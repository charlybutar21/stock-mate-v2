import type { IdxMarketQuoteDto } from '@/shared/contracts';
import { MIN_IDX_PRICE, round2 } from '@/shared/domain';
import { BoundedTtlCache } from '@/server/shared/cache/bounded-ttl-cache';
import { AppError, notFoundError } from '@/server/shared/http/problem';
import {
  mapYahooSectorToIdx,
  SECTOR_BENCHMARK_MULTIPLES,
  type IdxMarketDataProvider,
} from '../domain/market-data.types';

const TV_SCANNER_URL = 'https://scanner.tradingview.com/indonesia/scan';
const QUOTE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const UPSTREAM_TIMEOUT_MS = 8_000;
const UNIVERSE_TIMEOUT_MS = 15_000;
const IDX_TICKER_REGEX = /^[A-Z]{4}$/;

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

interface TradingViewScanResponse {
  totalCount?: number;
  data?: Array<{
    s: string;
    d: Array<string | number | null>;
  }>;
}

const tvQuoteCache = new BoundedTtlCache<string, IdxMarketQuoteDto>(QUOTE_CACHE_TTL_MS, 500);

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
      const cached = tvQuoteCache.get(clean, now);
      if (cached) {
        result.set(clean, cached);
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
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
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
        tvQuoteCache.set(dto.ticker, dto, now);
      }
    }

    return result;
  }

  /**
   * Fetches all active common IDX stocks participating in IHSG (IDX Composite):
   * - Listed on IDX (exchange = IDX)
   * - Primary common shares (type = stock, subtype = common, is_primary = true)
   * - Actively traded (active_symbol = true, close > 0)
   * - Positive market capitalization (market_cap_basic > 0, eligible for IHSG market-cap calculation)
   * - Strict 4-letter IDX ticker (excludes warrants, rights, bonds, ETFs)
   */
  async fetchAllIdxStocks(): Promise<IdxMarketQuoteDto[]> {
    const now = Date.now();
    const res = await fetch(TV_SCANNER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        filter: [
          { left: 'exchange', operation: 'equal', right: 'IDX' },
          { left: 'type', operation: 'equal', right: 'stock' },
          { left: 'subtype', operation: 'equal', right: 'common' },
          { left: 'is_primary', operation: 'equal', right: true },
          { left: 'active_symbol', operation: 'equal', right: true },
          { left: 'market_cap_basic', operation: 'greater', right: 0 },
          { left: 'close', operation: 'greater', right: 0 },
        ],
        options: { lang: 'en' },
        range: [0, 1500],
        sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
        columns: [...TV_COLUMNS],
      }),
      signal: AbortSignal.timeout(UNIVERSE_TIMEOUT_MS),
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
    const byTicker = new Map<string, IdxMarketQuoteDto>();

    for (const row of payload.data ?? []) {
      const dto = parseTradingViewRowToDto(row, now);
      if (!dto || !IDX_TICKER_REGEX.test(dto.ticker)) continue;
      if (!byTicker.has(dto.ticker)) {
        byTicker.set(dto.ticker, dto);
        tvQuoteCache.set(dto.ticker, dto, now);
      }
    }

    return Array.from(byTicker.values());
  }
}
