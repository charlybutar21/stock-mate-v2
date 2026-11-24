import type { IdxMarketQuoteDto } from '@/shared/contracts';
import { MIN_IDX_PRICE, round2 } from '@/shared/domain';
import { AppError, notFoundError } from '@/server/shared/http/problem';
import {
  mapYahooSectorToIdx,
  SECTOR_BENCHMARK_MULTIPLES,
  type IdxMarketDataProvider,
} from '../domain/market-data.types';

const QUOTE_CACHE_TTL_MS = 15 * 60 * 1000;

interface CachedQuote {
  data: IdxMarketQuoteDto;
  expiresAt: number;
}

const sectorsQuoteCache = new Map<string, CachedQuote>();

interface SectorsHistoricalValuationRow {
  year?: number;
  pe?: number | null;
  pb?: number | null;
  pe_peer_avg?: number | null;
  pb_peer_avg?: number | null;
}

interface SectorsHistoricalFinancialRow {
  year?: number;
  eps?: number | null;
  earnings?: number | null;
  net_income?: number | null;
  roe?: number | null;
  der?: number | null;
  debt_to_equity?: number | null;
  total_debt?: number | null;
  total_equity?: number | null;
  book_value_per_share?: number | null;
}

interface SectorsDividendBreakdownRow {
  year?: number;
  total?: number | null;
  yield?: number | null;
}

export interface SectorsCompanyReportResponse {
  symbol?: string;
  company_name?: string;
  overview?: {
    company_name?: string;
    sector?: string;
    sub_sector?: string;
    industry?: string;
    last_close_price?: number | null;
  };
  valuation?: {
    pe?: number | null;
    pb?: number | null;
    pe_peer_avg?: number | null;
    pb_peer_avg?: number | null;
    historical_valuation?: SectorsHistoricalValuationRow[];
  };
  financials?: {
    eps?: number | null;
    bvps?: number | null;
    roe?: number | null;
    der?: number | null;
    debt_to_equity?: number | null;
    total_debt?: number | null;
    total_equity?: number | null;
    earnings_growth?: number | null;
    historical_financials?: SectorsHistoricalFinancialRow[];
  };
  dividend?: {
    dividend_ttm?: number | null;
    yield_ttm?: number | null;
    historical_dividends?: SectorsDividendBreakdownRow[];
  };
}

function asFinite(val: unknown): number | null {
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

function normalizePercent(raw: number | null): number | null {
  if (raw === null) return null;
  // Sectors API ratios like ROE or earnings_growth are typically decimals (e.g. 0.21 = 21%)
  // If |raw| <= 2, treat as decimal ratio and multiply by 100; otherwise already percentage.
  return Math.abs(raw) <= 2 ? round2(raw * 100) : round2(raw);
}

function pickLatestByYear<T extends { year?: number }>(rows?: T[]): T | null {
  if (!rows || rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return sorted[0] ?? null;
}

export function parseSectorsReportToDto(
  ticker: string,
  payload: SectorsCompanyReportResponse,
  nowMs = Date.now(),
): IdxMarketQuoteDto {
  const cleanTicker = ticker.trim().toUpperCase();
  const rawPrice = asFinite(payload.overview?.last_close_price);
  if (rawPrice === null || rawPrice <= 0) {
    throw notFoundError(`IDX ticker ${cleanTicker} has no price data on Sectors.app.`);
  }

  const currentPrice = Math.max(MIN_IDX_PRICE, Math.round(rawPrice));
  const companyName = (
    payload.company_name ??
    payload.overview?.company_name ??
    `${cleanTicker} Tbk`
  )
    .trim()
    .slice(0, 120);

  const sector = mapYahooSectorToIdx(
    payload.overview?.sector ?? payload.overview?.sub_sector,
    payload.overview?.industry,
  );
  const benchmarks = SECTOR_BENCHMARK_MULTIPLES[sector];

  const latestVal = pickLatestByYear(payload.valuation?.historical_valuation);
  const pe = asFinite(payload.valuation?.pe) ?? asFinite(latestVal?.pe);
  const pb = asFinite(payload.valuation?.pb) ?? asFinite(latestVal?.pb);

  const peerPer = asFinite(payload.valuation?.pe_peer_avg) ?? asFinite(latestVal?.pe_peer_avg);
  const peerPbv = asFinite(payload.valuation?.pb_peer_avg) ?? asFinite(latestVal?.pb_peer_avg);

  const histFin = payload.financials?.historical_financials ?? [];
  const sortedFin = [...histFin].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const latestFin = sortedFin[0] ?? null;
  const prevFin = sortedFin[1] ?? null;

  // EPS: direct field, or derived from Price / PE
  const directEps = asFinite(payload.financials?.eps) ?? asFinite(latestFin?.eps);
  const eps =
    directEps !== null
      ? Math.round(directEps)
      : pe !== null && pe !== 0
        ? Math.round(currentPrice / pe)
        : null;

  // BVPS: direct field, or derived from Price / PB
  const directBvps =
    asFinite(payload.financials?.bvps) ?? asFinite(latestFin?.book_value_per_share);
  const bvps =
    directBvps !== null
      ? Math.round(directBvps)
      : pb !== null && pb > 0
        ? Math.round(currentPrice / pb)
        : null;

  // ROE (%)
  const rawRoe = asFinite(payload.financials?.roe) ?? asFinite(latestFin?.roe);
  const roePct = normalizePercent(rawRoe);

  // DER (x) — always null for FINANCIALS
  let der: number | null = null;
  if (sector !== 'FINANCIALS') {
    const directDer =
      asFinite(payload.financials?.der) ??
      asFinite(payload.financials?.debt_to_equity) ??
      asFinite(latestFin?.der) ??
      asFinite(latestFin?.debt_to_equity);
    if (directDer !== null && directDer >= 0) {
      der = round2(directDer);
    } else {
      const debt = asFinite(payload.financials?.total_debt) ?? asFinite(latestFin?.total_debt);
      const equity =
        asFinite(payload.financials?.total_equity) ?? asFinite(latestFin?.total_equity);
      if (debt !== null && equity !== null && equity > 0 && debt >= 0) {
        der = round2(debt / equity);
      }
    }
  }

  // EPS / Earnings Growth (%)
  let epsGrowthPct = normalizePercent(asFinite(payload.financials?.earnings_growth));
  if (epsGrowthPct === null && latestFin && prevFin) {
    const currEarn = asFinite(latestFin.earnings) ?? asFinite(latestFin.net_income);
    const prevEarn = asFinite(prevFin.earnings) ?? asFinite(prevFin.net_income);
    if (currEarn !== null && prevEarn !== null && prevEarn > 0) {
      epsGrowthPct = round2(((currEarn - prevEarn) / prevEarn) * 100);
    }
  }

  // DPS (Annual Dividend per Share)
  const latestDiv = pickLatestByYear(payload.dividend?.historical_dividends);
  const directDps = asFinite(payload.dividend?.dividend_ttm) ?? asFinite(latestDiv?.total);
  const divYield = asFinite(payload.dividend?.yield_ttm) ?? asFinite(latestDiv?.yield);
  let dps: number | null = null;
  if (directDps !== null && directDps >= 0) {
    dps = Math.round(directDps);
  } else if (divYield !== null && divYield >= 0) {
    const yieldRatio = divYield > 1 ? divYield / 100 : divYield;
    dps = Math.round(currentPrice * yieldRatio);
  }

  const targetPer =
    peerPer !== null && peerPer > 0 && peerPer <= 100 ? round2(peerPer) : benchmarks.targetPer;
  const targetPbv =
    peerPbv !== null && peerPbv > 0 && peerPbv <= 50 ? round2(peerPbv) : benchmarks.targetPbv;

  return {
    ticker: cleanTicker,
    companyName,
    sector,
    currentPrice,
    periodLabel: 'TTM (Sectors.app)',
    fundamentals: {
      eps,
      bvps,
      dps,
      roePct,
      der,
      epsGrowthPct,
      targetPer,
      targetPbv,
    },
    source: 'sectors_app',
    fetchedAt: new Date(nowMs).toISOString(),
  };
}

export class SectorsIdxProvider implements IdxMarketDataProvider {
  constructor(private readonly apiKey: string) {}

  async fetchIdxQuote(ticker: string): Promise<IdxMarketQuoteDto> {
    const cleanTicker = ticker.trim().toUpperCase();
    const now = Date.now();

    const cached = sectorsQuoteCache.get(cleanTicker);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const url = `https://api.sectors.app/v1/company/report/${encodeURIComponent(cleanTicker)}/?sections=overview,valuation,financials,dividend`;
    const res = await fetch(url, {
      headers: {
        Authorization: this.apiKey,
        Accept: 'application/json',
      },
    });

    if (res.status === 404) {
      throw notFoundError(`IDX ticker ${cleanTicker} was not found on Sectors.app.`);
    }

    if (!res.ok) {
      throw new AppError({
        status: 502,
        type: 'https://stock-mate-v2/errors/upstream-unavailable',
        title: 'Market Data Unavailable',
        detail: `Sectors.app API returned status ${res.status}.`,
      });
    }

    const payload = (await res.json()) as SectorsCompanyReportResponse;
    const dto = parseSectorsReportToDto(cleanTicker, payload, now);

    sectorsQuoteCache.set(cleanTicker, {
      data: dto,
      expiresAt: now + QUOTE_CACHE_TTL_MS,
    });

    return dto;
  }
}

export class CompositeIdxMarketDataProvider implements IdxMarketDataProvider {
  constructor(
    private readonly primary: IdxMarketDataProvider,
    private readonly fallback: IdxMarketDataProvider,
  ) {}

  async fetchIdxQuote(ticker: string): Promise<IdxMarketQuoteDto> {
    try {
      return await this.primary.fetchIdxQuote(ticker);
    } catch (err) {
      if (err instanceof AppError && err.status === 404) {
        // Still try fallback in case ticker format differs
        return await this.fallback.fetchIdxQuote(ticker);
      }
      return await this.fallback.fetchIdxQuote(ticker);
    }
  }
}
