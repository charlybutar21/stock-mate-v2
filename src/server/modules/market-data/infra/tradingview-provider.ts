import type { IdxMarketQuoteDto } from '@/shared/contracts';
import { MIN_IDX_PRICE, round2 } from '@/shared/domain';
import { BoundedTtlCache } from '@/server/shared/cache/bounded-ttl-cache';
import { AppError, notFoundError } from '@/server/shared/http/problem';
import { CircuitBreaker } from '@/server/shared/resilience/circuit-breaker';
import {
  mapYahooSectorToIdx,
  SECTOR_BENCHMARK_MULTIPLES,
  type IdxMarketDataProvider,
} from '../domain/market-data.types';

const TV_SCANNER_URL = 'https://scanner.tradingview.com/indonesia/scan';
const QUOTE_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
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
  // Extended Fundamental Quality Score (FQS) & liquidity columns
  'market_cap_basic',
  'average_volume_30d_calc',
  'return_on_assets',
  'return_on_invested_capital',
  'operating_margin',
  'net_margin',
  'total_revenue_yoy_growth_ttm',
  'net_income_yoy_growth_ttm',
  'current_ratio',
  'net_debt',
  'ebitda',
  'total_assets_fq',
  'total_liabilities_fq',
  'cash_f_operating_activities_ttm',
  'free_cash_flow_ttm',
  'net_income_ttm',
  'free_cash_flow_margin_ttm',
  'piotroski_f_score_ttm',
  'altman_z_score_ttm',
  // Intraday open & daily price change columns (appended for backwards-compatible positional parsing)
  'open',
  'change_abs',
  'change',
] as const;

interface TradingViewScanResponse {
  totalCount?: number;
  data?: Array<{
    s: string;
    d: Array<string | number | null>;
  }>;
}

const tvQuoteCache = new BoundedTtlCache<string, IdxMarketQuoteDto>(QUOTE_CACHE_TTL_MS, 500);
const tvCircuitBreaker = new CircuitBreaker(3, 60_000);

function tvCircuitOpenError(): AppError {
  return new AppError({
    status: 503,
    type: 'https://stock-mate-v2/errors/upstream-circuit-open',
    title: 'Market Data Temporarily Paused',
    detail: 'TradingView upstream circuit breaker is open. Serving fallback or cached data.',
  });
}

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
    rawMarketCap,
    rawAvgVol30d,
    rawRoa,
    rawRoic,
    rawOpm,
    rawNpm,
    rawRevGrowth,
    rawNiGrowth,
    rawCurrentRatio,
    rawNetDebt,
    rawEbitda,
    rawTotalAssets,
    rawTotalLiabilities,
    rawCfo,
    rawFcf,
    rawNetIncome,
    rawFcfMargin,
    rawPiotroski,
    rawAltmanZ,
    rawOpen,
    rawChangeAbs,
    rawChangePct,
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
  const isFinancials = sector === 'FINANCIALS';

  const epsVal = asFinite(rawEps);
  const bvpsVal = asFinite(rawBvps);
  const dpsVal = asFinite(rawDps);
  const roeVal = asFinite(rawRoe);
  const derVal = asFinite(rawDer);
  const epsGrowthVal = asFinite(rawEpsGrowth);

  const marketCapVal = asFinite(rawMarketCap);
  const avgVol30dVal = asFinite(rawAvgVol30d);
  const roaVal = asFinite(rawRoa);
  const roicVal = asFinite(rawRoic);
  const opmVal = asFinite(rawOpm);
  const npmVal = asFinite(rawNpm);
  const revGrowthVal = asFinite(rawRevGrowth);
  const niGrowthVal = asFinite(rawNiGrowth);
  const currentRatioVal = asFinite(rawCurrentRatio);
  const netDebtVal = asFinite(rawNetDebt);
  const ebitdaVal = asFinite(rawEbitda);
  const totalAssetsVal = asFinite(rawTotalAssets);
  const totalLiabilitiesVal = asFinite(rawTotalLiabilities);
  const cfoVal = asFinite(rawCfo);
  const fcfVal = asFinite(rawFcf);
  const netIncomeVal = asFinite(rawNetIncome);
  const fcfMarginVal = asFinite(rawFcfMargin);
  const piotroskiVal = asFinite(rawPiotroski);
  const altmanZVal = asFinite(rawAltmanZ);
  const openVal = asFinite(rawOpen);
  const changeAbsVal = asFinite(rawChangeAbs);
  const changePctVal = asFinite(rawChangePct);

  const openPrice =
    openVal !== null && openVal > 0 ? Math.max(MIN_IDX_PRICE, Math.round(openVal)) : null;
  const dailyChange = changeAbsVal !== null ? Math.round(changeAbsVal) : null;
  const dailyChangePct =
    changePctVal !== null ? round2(clamp(changePctVal, -100, 1000)) : null;

  let netDebtToEbitda: number | null = null;
  if (!isFinancials && netDebtVal !== null) {
    if (netDebtVal <= 0) {
      netDebtToEbitda =
        ebitdaVal !== null && ebitdaVal > 0 ? round2(clamp(netDebtVal / ebitdaVal, -50, 0)) : -0.01;
    } else if (ebitdaVal !== null && ebitdaVal > 0) {
      netDebtToEbitda = round2(clamp(netDebtVal / ebitdaVal, 0, 50));
    } else if (ebitdaVal !== null && ebitdaVal <= 0) {
      netDebtToEbitda = 50;
    }
  }

  const equityToAssetsPct =
    totalAssetsVal !== null && totalAssetsVal > 0 && totalLiabilitiesVal !== null
      ? round2(clamp(((totalAssetsVal - totalLiabilitiesVal) / totalAssetsVal) * 100, -1000, 100))
      : null;

  const cfoToNetIncome =
    cfoVal !== null && netIncomeVal !== null && netIncomeVal > 0
      ? round2(clamp(cfoVal / netIncomeVal, -50, 50))
      : null;

  const fcfYieldPct =
    fcfVal !== null && marketCapVal !== null && marketCapVal > 0
      ? round2(clamp((fcfVal / marketCapVal) * 100, -1000, 1000))
      : null;

  return {
    ticker,
    companyName,
    sector,
    currentPrice,
    openPrice,
    dailyChange,
    dailyChangePct,
    periodLabel: 'TTM (TradingView)',
    fundamentals: {
      eps: epsVal !== null ? Math.round(epsVal) : null,
      bvps: bvpsVal !== null ? Math.round(bvpsVal) : null,
      dps: dpsVal !== null && dpsVal >= 0 ? Math.round(dpsVal) : null,
      roePct: roeVal !== null ? round2(clamp(roeVal, -1000, 1000)) : null,
      der:
        isFinancials
          ? null
          : derVal !== null && derVal >= 0
            ? round2(clamp(derVal, 0, 1000))
            : null,
      epsGrowthPct:
        epsGrowthVal !== null ? round2(clamp(epsGrowthVal, -1000, 1000)) : null,
      targetPer: benchmarks.targetPer,
      targetPbv: benchmarks.targetPbv,
      marketCapIdr: marketCapVal !== null && marketCapVal > 0 ? Math.round(marketCapVal) : null,
      adtvIdr:
        avgVol30dVal !== null && avgVol30dVal >= 0 ? Math.round(avgVol30dVal * closePrice) : null,
      roaPct: roaVal !== null ? round2(clamp(roaVal, -1000, 1000)) : null,
      roicPct: roicVal !== null ? round2(clamp(roicVal, -1000, 1000)) : null,
      operatingMarginPct: opmVal !== null ? round2(clamp(opmVal, -1000, 1000)) : null,
      netMarginPct: npmVal !== null ? round2(clamp(npmVal, -1000, 1000)) : null,
      revenueGrowthPct: revGrowthVal !== null ? round2(clamp(revGrowthVal, -1000, 1000)) : null,
      netIncomeGrowthPct: niGrowthVal !== null ? round2(clamp(niGrowthVal, -1000, 1000)) : null,
      currentRatio:
        isFinancials
          ? null
          : currentRatioVal !== null && currentRatioVal >= 0
            ? round2(clamp(currentRatioVal, 0, 1000))
            : null,
      netDebtToEbitda,
      equityToAssetsPct,
      wholesaleDer:
        isFinancials && derVal !== null && derVal >= 0 ? round2(clamp(derVal, 0, 1000)) : null,
      cfoToNetIncome,
      fcfMarginPct: fcfMarginVal !== null ? round2(clamp(fcfMarginVal, -1000, 1000)) : null,
      fcfYieldPct,
      cfoPositive: cfoVal !== null ? cfoVal > 0 : null,
      fcfPositive: fcfVal !== null ? fcfVal > 0 : null,
      piotroskiFScore: piotroskiVal !== null ? Math.round(clamp(piotroskiVal, 0, 9)) : null,
      altmanZScore: altmanZVal !== null ? round2(clamp(altmanZVal, -100, 100)) : null,
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

    const payload = await tvCircuitBreaker.execute(async () => {
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

      return (await res.json()) as TradingViewScanResponse;
    }, tvCircuitOpenError);

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
    const payload = await tvCircuitBreaker.execute(async () => {
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

      return (await res.json()) as TradingViewScanResponse;
    }, tvCircuitOpenError);

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
