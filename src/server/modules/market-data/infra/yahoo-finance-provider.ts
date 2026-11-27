import type { IdxMarketQuoteDto } from '@/shared/contracts';
import { MIN_IDX_PRICE, round2 } from '@/shared/domain';
import { BoundedTtlCache } from '@/server/shared/cache/bounded-ttl-cache';
import { AppError, notFoundError } from '@/server/shared/http/problem';
import {
  mapYahooSectorToIdx,
  SECTOR_BENCHMARK_MULTIPLES,
  type IdxMarketDataProvider,
} from '../domain/market-data.types';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CRUMB_TTL_MS = 25 * 60 * 1000;
const QUOTE_CACHE_TTL_MS = 15 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 8_000;

interface CrumbSession {
  cookie: string;
  crumb: string;
  expiresAt: number;
}

interface YahooRawField {
  raw?: number;
}

interface YahooQuoteSummaryResponse {
  quoteSummary?: {
    result?: Array<{
      price?: {
        longName?: string;
        shortName?: string;
        regularMarketPrice?: YahooRawField;
        marketCap?: YahooRawField;
      };
      assetProfile?: {
        sector?: string;
        industry?: string;
      };
      summaryDetail?: {
        dividendRate?: YahooRawField;
        averageVolume?: YahooRawField;
      };
      defaultKeyStatistics?: {
        trailingEps?: YahooRawField;
        bookValue?: YahooRawField;
        netIncomeToCommon?: YahooRawField;
        sharesOutstanding?: YahooRawField;
        earningsQuarterlyGrowth?: YahooRawField;
      };
      financialData?: {
        returnOnEquity?: YahooRawField;
        returnOnAssets?: YahooRawField;
        debtToEquity?: YahooRawField;
        currentRatio?: YahooRawField;
        operatingMargins?: YahooRawField;
        profitMargins?: YahooRawField;
        revenueGrowth?: YahooRawField;
        earningsGrowth?: YahooRawField;
        operatingCashflow?: YahooRawField;
        freeCashflow?: YahooRawField;
        totalRevenue?: YahooRawField;
        totalDebt?: YahooRawField;
        totalCash?: YahooRawField;
        ebitda?: YahooRawField;
      };
    }> | null;
    error?: { code?: string; description?: string } | null;
  };
}

let cachedCrumb: CrumbSession | null = null;
const quoteCache = new BoundedTtlCache<string, IdxMarketQuoteDto>(QUOTE_CACHE_TTL_MS, 500);

function extractCookieHeader(headers: Headers): string {
  const getSetCookie = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === 'function') {
    const list = getSetCookie.call(headers);
    if (list.length > 0) {
      return list.map((c) => c.split(';')[0]!.trim()).join('; ');
    }
  }
  const single = headers.get('set-cookie');
  if (!single) return '';
  return single
    .split(/,(?=\s*[A-Za-z0-9_-]+=)/)
    .map((c) => c.split(';')[0]!.trim())
    .join('; ');
}

async function getYahooCrumb(forceRefresh = false): Promise<CrumbSession> {
  const now = Date.now();
  if (!forceRefresh && cachedCrumb && cachedCrumb.expiresAt > now) {
    return cachedCrumb;
  }

  const initRes = await fetch('https://fc.yahoo.com', {
    headers: { 'User-Agent': USER_AGENT },
    redirect: 'manual',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  const cookie = extractCookieHeader(initRes.headers);

  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: {
      'User-Agent': USER_AGENT,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (!crumbRes.ok) {
    throw new AppError({
      status: 502,
      type: 'https://stock-mate-v2/errors/upstream-unavailable',
      title: 'Market Data Unavailable',
      detail: 'Unable to authenticate with market data provider. Please try again or enter manually.',
    });
  }

  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.startsWith('<')) {
    throw new AppError({
      status: 502,
      type: 'https://stock-mate-v2/errors/upstream-unavailable',
      title: 'Market Data Unavailable',
      detail: 'Received invalid session from market data provider.',
    });
  }

  cachedCrumb = {
    cookie,
    crumb,
    expiresAt: now + CRUMB_TTL_MS,
  };
  return cachedCrumb;
}

function toOptionalInt(val?: number): number | null {
  if (val === undefined || val === null || !Number.isFinite(val)) return null;
  return Math.round(val);
}

export class YahooFinanceIdxProvider implements IdxMarketDataProvider {
  async fetchIdxQuote(ticker: string): Promise<IdxMarketQuoteDto> {
    const cleanTicker = ticker.trim().toUpperCase();
    const now = Date.now();

    const cached = quoteCache.get(cleanTicker, now);
    if (cached) {
      return cached;
    }

    const session = await getYahooCrumb();
    const modules = 'price,summaryDetail,defaultKeyStatistics,financialData,assetProfile';
    const buildUrl = (crumb: string) =>
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(cleanTicker)}.JK?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;

    let res = await fetch(buildUrl(session.crumb), {
      headers: {
        'User-Agent': USER_AGENT,
        ...(session.cookie ? { Cookie: session.cookie } : {}),
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    // Retry once if crumb expired on upstream
    if (res.status === 401 || res.status === 403) {
      const freshSession = await getYahooCrumb(true);
      res = await fetch(buildUrl(freshSession.crumb), {
        headers: {
          'User-Agent': USER_AGENT,
          ...(freshSession.cookie ? { Cookie: freshSession.cookie } : {}),
        },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    }

    if (res.status === 404) {
      throw notFoundError(`IDX ticker ${cleanTicker} was not found.`);
    }

    if (!res.ok) {
      throw new AppError({
        status: 502,
        type: 'https://stock-mate-v2/errors/upstream-unavailable',
        title: 'Market Data Unavailable',
        detail: `Market data provider returned status ${res.status}. You can still enter fundamentals manually.`,
      });
    }

    const payload = (await res.json()) as YahooQuoteSummaryResponse;
    const item = payload.quoteSummary?.result?.[0];
    if (!item || !item.price?.regularMarketPrice?.raw) {
      throw notFoundError(`IDX ticker ${cleanTicker} was not found or has no market price.`);
    }

    const currentPrice = Math.max(MIN_IDX_PRICE, Math.round(item.price.regularMarketPrice.raw));
    const companyName = (
      item.price.longName ??
      item.price.shortName ??
      `${cleanTicker} Tbk`
    )
      .trim()
      .slice(0, 120);

    const sector = mapYahooSectorToIdx(item.assetProfile?.sector, item.assetProfile?.industry);
    const benchmarks = SECTOR_BENCHMARK_MULTIPLES[sector];

    const rawRoe = item.financialData?.returnOnEquity?.raw;
    const roePct =
      rawRoe !== undefined && Number.isFinite(rawRoe) ? round2(rawRoe * 100) : null;

    let eps = toOptionalInt(item.defaultKeyStatistics?.trailingEps?.raw);
    const netIncome = item.defaultKeyStatistics?.netIncomeToCommon?.raw;
    const sharesOut = item.defaultKeyStatistics?.sharesOutstanding?.raw;
    if (
      netIncome !== undefined &&
      sharesOut !== undefined &&
      Number.isFinite(netIncome) &&
      Number.isFinite(sharesOut) &&
      sharesOut > 0
    ) {
      const derivedEps = Math.round(netIncome / sharesOut);
      // Guard against stale Yahoo trailingEps contradicting negative ROE / Net Income
      if (eps === null || (eps > 0 && (derivedEps < 0 || (roePct !== null && roePct < 0)))) {
        eps = derivedEps;
      }
    }

    const bvps = toOptionalInt(item.defaultKeyStatistics?.bookValue?.raw);
    const rawDps = item.summaryDetail?.dividendRate?.raw;
    const dps =
      rawDps !== undefined && Number.isFinite(rawDps) && rawDps >= 0 ? Math.round(rawDps) : null;

    // Yahoo Finance reports debtToEquity as a percentage (e.g. 64.97 = 0.65x)
    const rawDerPct = item.financialData?.debtToEquity?.raw;
    const der =
      sector === 'FINANCIALS'
        ? null
        : rawDerPct !== undefined && Number.isFinite(rawDerPct) && rawDerPct >= 0
          ? round2(rawDerPct / 100)
          : null;

    const rawGrowth =
      item.financialData?.earningsGrowth?.raw ??
      item.defaultKeyStatistics?.earningsQuarterlyGrowth?.raw;
    const epsGrowthPct =
      rawGrowth !== undefined && Number.isFinite(rawGrowth) ? round2(rawGrowth * 100) : null;

    const rawMarketCap = item.price?.marketCap?.raw;
    const marketCapIdr =
      rawMarketCap !== undefined && Number.isFinite(rawMarketCap) && rawMarketCap > 0
        ? Math.round(rawMarketCap)
        : null;
    const rawAvgVol = item.summaryDetail?.averageVolume?.raw;
    const adtvIdr =
      rawAvgVol !== undefined && Number.isFinite(rawAvgVol) && rawAvgVol >= 0
        ? Math.round(rawAvgVol * currentPrice)
        : null;
    const rawRoa = item.financialData?.returnOnAssets?.raw;
    const roaPct = rawRoa !== undefined && Number.isFinite(rawRoa) ? round2(rawRoa * 100) : null;
    const rawOpm = item.financialData?.operatingMargins?.raw;
    const operatingMarginPct =
      rawOpm !== undefined && Number.isFinite(rawOpm) ? round2(rawOpm * 100) : null;
    const rawNpm = item.financialData?.profitMargins?.raw;
    const netMarginPct =
      rawNpm !== undefined && Number.isFinite(rawNpm) ? round2(rawNpm * 100) : null;
    const rawRevGrowth = item.financialData?.revenueGrowth?.raw;
    const revenueGrowthPct =
      rawRevGrowth !== undefined && Number.isFinite(rawRevGrowth)
        ? round2(rawRevGrowth * 100)
        : null;
    const rawCurrRatio = item.financialData?.currentRatio?.raw;
    const currentRatio =
      sector === 'FINANCIALS'
        ? null
        : rawCurrRatio !== undefined && Number.isFinite(rawCurrRatio) && rawCurrRatio >= 0
          ? round2(rawCurrRatio)
          : null;
    const wholesaleDer =
      sector === 'FINANCIALS' &&
      rawDerPct !== undefined &&
      Number.isFinite(rawDerPct) &&
      rawDerPct >= 0
        ? round2(rawDerPct / 100)
        : null;
    const rawCfo = item.financialData?.operatingCashflow?.raw;
    const rawFcf = item.financialData?.freeCashflow?.raw;
    const rawRev = item.financialData?.totalRevenue?.raw;
    const cfoToNetIncome =
      rawCfo !== undefined &&
      netIncome !== undefined &&
      Number.isFinite(rawCfo) &&
      Number.isFinite(netIncome) &&
      netIncome > 0
        ? round2(rawCfo / netIncome)
        : null;
    const fcfMarginPct =
      rawFcf !== undefined &&
      rawRev !== undefined &&
      Number.isFinite(rawFcf) &&
      Number.isFinite(rawRev) &&
      rawRev > 0
        ? round2((rawFcf / rawRev) * 100)
        : null;
    const fcfYieldPct =
      rawFcf !== undefined &&
      marketCapIdr !== null &&
      Number.isFinite(rawFcf) &&
      marketCapIdr > 0
        ? round2((rawFcf / marketCapIdr) * 100)
        : null;
    const rawDebt = item.financialData?.totalDebt?.raw;
    const rawCash = item.financialData?.totalCash?.raw;
    const rawEbitda = item.financialData?.ebitda?.raw;
    let netDebtToEbitda: number | null = null;
    if (
      sector !== 'FINANCIALS' &&
      rawDebt !== undefined &&
      rawCash !== undefined &&
      Number.isFinite(rawDebt) &&
      Number.isFinite(rawCash)
    ) {
      const netDebt = rawDebt - rawCash;
      if (netDebt <= 0) {
        netDebtToEbitda =
          rawEbitda !== undefined && Number.isFinite(rawEbitda) && rawEbitda > 0
            ? round2(Math.max(-50, netDebt / rawEbitda))
            : -0.01;
      } else if (rawEbitda !== undefined && Number.isFinite(rawEbitda) && rawEbitda > 0) {
        netDebtToEbitda = round2(Math.min(50, netDebt / rawEbitda));
      } else if (rawEbitda !== undefined && Number.isFinite(rawEbitda) && rawEbitda <= 0) {
        netDebtToEbitda = 50;
      }
    }

    const dto: IdxMarketQuoteDto = {
      ticker: cleanTicker,
      companyName,
      sector,
      currentPrice,
      periodLabel: 'TTM (Yahoo Finance)',
      fundamentals: {
        eps,
        bvps,
        dps,
        roePct,
        der,
        epsGrowthPct,
        targetPer: benchmarks.targetPer,
        targetPbv: benchmarks.targetPbv,
        marketCapIdr,
        adtvIdr,
        roaPct,
        roicPct: null,
        operatingMarginPct,
        netMarginPct,
        revenueGrowthPct,
        netIncomeGrowthPct: null,
        currentRatio,
        netDebtToEbitda,
        equityToAssetsPct: null,
        wholesaleDer,
        cfoToNetIncome,
        fcfMarginPct,
        fcfYieldPct,
        cfoPositive: rawCfo !== undefined && Number.isFinite(rawCfo) ? rawCfo > 0 : null,
        fcfPositive: rawFcf !== undefined && Number.isFinite(rawFcf) ? rawFcf > 0 : null,
        piotroskiFScore: null,
        altmanZScore: null,
      },
      source: 'yahoo_finance',
      fetchedAt: new Date(now).toISOString(),
    };

    quoteCache.set(cleanTicker, dto, now);

    return dto;
  }
}
