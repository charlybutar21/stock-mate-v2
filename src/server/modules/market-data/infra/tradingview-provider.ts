import type { IdxMarketQuoteDto } from '@/shared/contracts';
import { MIN_IDX_PRICE, round2 } from '@/shared/domain';
import { AppError, notFoundError } from '@/server/shared/http/problem';
import {
  mapYahooSectorToIdx,
  SECTOR_BENCHMARK_MULTIPLES,
  type IdxMarketDataProvider,
} from '../domain/market-data.types';

const TV_SCANNER_URL = 'https://scanner.tradingview.com/indonesia/scan';
const QUOTE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const TV_COLUMNS = [
  'name',
  'description',
  'close',
  'sector',
  'earnings_per_share_basic_ttm',
  'book_value_per_share_fq',
  'dps_common_stock_prim_issue_fy',
  'return_on_equity',
  'debt_to_equity',
  'earnings_per_share_diluted_yoy_growth_ttm',
] as const;

interface CachedQuote {
  data: IdxMarketQuoteDto;
  expiresAt: number;
}

interface TradingViewScanResponse {
  totalCount?: number;
  data?: Array<{
    s: string;
    d: Array<string | number | null>;
  }>;
}

const tvQuoteCache = new Map<string, CachedQuote>();

function asFinite(val: unknown): number | null {
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function parseTradingViewRowToDto(
  row: { s: string; d: Array<string | number | null> },
  nowMs = Date.now(),
): IdxMarketQuoteDto | null {
  const [
    rawName,
    rawDescription,
    rawClose,
    rawSector,
    rawEps,
    rawBvps,
    rawDps,
    rawRoe,
    rawDer,
    rawEpsGrowth,
  ] = row.d;

  const tickerFromSymbol = row.s.replace(/^IDX:/i, '').trim().toUpperCase();
  const ticker = (typeof rawName === 'string' && rawName.trim() ? rawName.trim() : tickerFromSymbol).toUpperCase();
  const closePrice = asFinite(rawClose);
  if (closePrice === null || closePrice <= 0) {
    return null;
  }

  const currentPrice = Math.max(MIN_IDX_PRICE, Math.round(closePrice));
  const companyName = (
    typeof rawDescription === 'string' && rawDescription.trim()
      ? rawDescription.trim()
      : `${ticker} Tbk`
  ).slice(0, 120);

  const sector = mapYahooSectorToIdx(typeof rawSector === 'string' ? rawSector : null);
  const benchmarks = SECTOR_BENCHMARK_MULTIPLES[sector];

  const epsVal = asFinite(rawEps);
  const bvpsVal = asFinite(rawBvps);
  const dpsVal = asFinite(rawDps);
  const roeVal = asFinite(rawRoe);
  const derVal = asFinite(rawDer);
  const epsGrowthVal = asFinite(rawEpsGrowth);

  return {
    ticker,
    companyName,
    sector,
    currentPrice,
    periodLabel: 'TTM (TradingView)',
    fundamentals: {
      eps: epsVal !== null ? Math.round(epsVal) : null,
      bvps: bvpsVal !== null ? Math.round(bvpsVal) : null,
      dps: dpsVal !== null && dpsVal >= 0 ? Math.round(dpsVal) : null,
      roePct: roeVal !== null ? round2(clamp(roeVal, -1000, 1000)) : null,
      der:
        sector === 'FINANCIALS'
          ? null
          : derVal !== null && derVal >= 0
            ? round2(clamp(derVal, 0, 1000))
            : null,
      epsGrowthPct:
        epsGrowthVal !== null ? round2(clamp(epsGrowthVal, -1000, 1000)) : null,
      targetPer: benchmarks.targetPer,
      targetPbv: benchmarks.targetPbv,
    },
    source: 'tradingview',
    fetchedAt: new Date(nowMs).toISOString(),
  };
}

export class TradingViewIdxProvider implements IdxMarketDataProvider {
  async fetchIdxQuote(ticker: string): Promise<IdxMarketQuoteDto> {
    const cleanTicker = ticker.trim().toUpperCase();
    const map = await this.fetchIdxQuotesBatch([cleanTicker]);
    const found = map.get(cleanTicker);
    if (!found) {
      throw notFoundError(`IDX ticker ${cleanTicker} was not found on TradingView.`);
    }
    return found;
  }

  async fetchIdxQuotesBatch(tickers: string[]): Promise<Map<string, IdxMarketQuoteDto>> {
    const now = Date.now();
    const result = new Map<string, IdxMarketQuoteDto>();
    const missing: string[] = [];

    for (const raw of tickers) {
      const clean = raw.trim().toUpperCase();
      if (!clean) continue;
      const cached = tvQuoteCache.get(clean);
      if (cached && cached.expiresAt > now) {
        result.set(clean, cached.data);
      } else if (!missing.includes(clean)) {
        missing.push(clean);
      }
    }

    if (missing.length === 0) {
      return result;
    }

    const res = await fetch(TV_SCANNER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        symbols: {
          tickers: missing.map((t) => `IDX:${t}`),
        },
        columns: [...TV_COLUMNS],
      }),
    });

    if (!res.ok) {
      throw new AppError({
        status: 502,
        type: 'https://stock-mate-v2/errors/upstream-unavailable',
        title: 'Market Data Unavailable',
        detail: `TradingView scanner returned status ${res.status}.`,
      });
    }

    const payload = (await res.json()) as TradingViewScanResponse;
    for (const row of payload.data ?? []) {
      const dto = parseTradingViewRowToDto(row, now);
      if (dto) {
        result.set(dto.ticker, dto);
        tvQuoteCache.set(dto.ticker, {
          data: dto,
          expiresAt: now + QUOTE_CACHE_TTL_MS,
        });
      }
    }

    return result;
  }
}
