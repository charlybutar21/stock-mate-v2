import type {
  CatalogQuery,
  CatalogResponseDto,
  CatalogSortOption,
  CatalogSummaryDto,
  CustomWatchlistGroupDto,
  MarketStockDto,
  WatchlistItemDto,
} from '@/shared/contracts';
import { computeQarpRankScore } from '@/shared/domain';

const ONE_BILLION_IDR = 1_000_000_000;

export interface CatalogSnapshotResponse {
  version: 1;
  syncedAt: string | null;
  syncedAtMs?: number;
  etag?: string;
  summary: CatalogSummaryDto;
  items: MarketStockDto[];
}

export function mapWatchlistItemToMarket(
  item: WatchlistItemDto,
  customWatchlistIds: string[],
): MarketStockDto {
  return {
    watchlistItemId: item.id,
    ticker: item.ticker,
    companyName: item.companyName,
    sector: item.sector,
    currentPrice: item.currentPrice,
    openPrice: item.openPrice,
    dailyChange: item.dailyChange,
    dailyChangePct: item.dailyChangePct,
    ownedLots: item.ownedLots,
    avgBuyPrice: item.avgBuyPrice,
    holdingTranches: item.holdingTranches,
    targetBuyPrice: item.targetBuyPrice,
    investmentThesis: item.investmentThesis,
    updatedAt: item.updatedAt,
    isStale: item.isStale,
    fundamentals: item.fundamentals,
    valuation: item.valuation,
    quality: item.quality,
    customWatchlistIds,
  };
}

export function buildCustomMembershipMap(
  groups: CustomWatchlistGroupDto[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const group of groups) {
    for (const ticker of group.tickers) {
      const existing = map.get(ticker);
      if (existing) {
        existing.push(group.id);
      } else {
        map.set(ticker, [group.id]);
      }
    }
  }
  return map;
}

export type ClientMarketStockFilterQuery = Partial<
  Pick<
    CatalogQuery,
    | 'search'
    | 'sector'
    | 'valuationStatus'
    | 'minMos'
    | 'maxMos'
    | 'qualityGrade'
    | 'qarpQuadrant'
    | 'minFqs'
    | 'maxFqs'
    | 'minProfitability'
    | 'minGrowth'
    | 'minHealth'
    | 'minCashFlow'
    | 'minAdtvBillion'
    | 'minPiotroski'
    | 'excludeHighRiskTrap'
    | 'sort'
  >
>;

export function filterAndSortMarketStocksClient(
  allItems: MarketStockDto[],
  query: ClientMarketStockFilterQuery,
): MarketStockDto[] {
  let items = allItems;

  if (query.sector) {
    items = items.filter((item) => item.sector === query.sector);
  }
  if (query.search) {
    const needle = query.search.trim().toLowerCase();
    if (needle) {
      items = items.filter(
        (item) =>
          item.ticker.toLowerCase().includes(needle) ||
          item.companyName.toLowerCase().includes(needle),
      );
    }
  }
  if (query.valuationStatus) {
    items = items.filter((item) => item.valuation.valuationStatus === query.valuationStatus);
  }
  if (query.minMos !== undefined) {
    const min = query.minMos;
    items = items.filter((item) => item.valuation.mosPct !== null && item.valuation.mosPct >= min);
  }
  if (query.maxMos !== undefined) {
    const max = query.maxMos;
    items = items.filter((item) => item.valuation.mosPct !== null && item.valuation.mosPct <= max);
  }
  if (query.qualityGrade) {
    items = items.filter((item) => item.quality.grade === query.qualityGrade);
  }
  if (query.qarpQuadrant) {
    items = items.filter((item) => item.quality.qarpQuadrant === query.qarpQuadrant);
  }
  if (query.minFqs !== undefined) {
    const min = query.minFqs;
    items = items.filter((item) => item.quality.score !== null && item.quality.score >= min);
  }
  if (query.maxFqs !== undefined) {
    const max = query.maxFqs;
    items = items.filter((item) => item.quality.score !== null && item.quality.score <= max);
  }
  if (query.minProfitability !== undefined) {
    const min = query.minProfitability;
    items = items.filter(
      (item) =>
        item.quality.pillars.profitability.score !== null &&
        item.quality.pillars.profitability.score >= min,
    );
  }
  if (query.minGrowth !== undefined) {
    const min = query.minGrowth;
    items = items.filter(
      (item) =>
        item.quality.pillars.growth.score !== null && item.quality.pillars.growth.score >= min,
    );
  }
  if (query.minHealth !== undefined) {
    const min = query.minHealth;
    items = items.filter(
      (item) =>
        item.quality.pillars.financialHealth.score !== null &&
        item.quality.pillars.financialHealth.score >= min,
    );
  }
  if (query.minCashFlow !== undefined) {
    const min = query.minCashFlow;
    items = items.filter(
      (item) =>
        item.quality.pillars.cashFlow.score !== null && item.quality.pillars.cashFlow.score >= min,
    );
  }
  if (query.minAdtvBillion !== undefined) {
    const minIdr = query.minAdtvBillion * ONE_BILLION_IDR;
    items = items.filter(
      (item) => item.fundamentals.adtvIdr !== null && item.fundamentals.adtvIdr >= minIdr,
    );
  }
  if (query.minPiotroski !== undefined) {
    const min = query.minPiotroski;
    items = items.filter(
      (item) =>
        item.fundamentals.piotroskiFScore !== null && item.fundamentals.piotroskiFScore >= min,
    );
  }
  if (query.excludeHighRiskTrap) {
    items = items.filter((item) => item.valuation.valueTrapShield.riskLevel !== 'HIGH_RISK');
  }

  const sort: CatalogSortOption = query.sort ?? 'mos_desc';
  const sorted = [...items];

  sorted.sort((a, b) => {
    if (sort === 'fqs_desc') {
      const fqsA = a.quality.score ?? Number.NEGATIVE_INFINITY;
      const fqsB = b.quality.score ?? Number.NEGATIVE_INFINITY;
      if (fqsB !== fqsA) return fqsB - fqsA;
      const mosA = a.valuation.mosPct ?? Number.NEGATIVE_INFINITY;
      const mosB = b.valuation.mosPct ?? Number.NEGATIVE_INFINITY;
      if (mosB !== mosA) return mosB - mosA;
      return a.ticker.localeCompare(b.ticker);
    }
    if (sort === 'fqs_asc') {
      const fqsA = a.quality.score ?? Number.POSITIVE_INFINITY;
      const fqsB = b.quality.score ?? Number.POSITIVE_INFINITY;
      if (fqsA !== fqsB) return fqsA - fqsB;
      return a.ticker.localeCompare(b.ticker);
    }
    if (sort === 'qarp_desc') {
      const rankA = computeQarpRankScore({
        fqs: a.quality.score,
        mosPct: a.valuation.mosPct,
        valueTrapRiskLevel: a.valuation.valueTrapShield.riskLevel,
      });
      const rankB = computeQarpRankScore({
        fqs: b.quality.score,
        mosPct: b.valuation.mosPct,
        valueTrapRiskLevel: b.valuation.valueTrapShield.riskLevel,
      });
      if (rankB !== rankA) return rankB - rankA;
      return a.ticker.localeCompare(b.ticker);
    }
    if (sort === 'profitability_desc') {
      const pA = a.quality.pillars.profitability.score ?? Number.NEGATIVE_INFINITY;
      const pB = b.quality.pillars.profitability.score ?? Number.NEGATIVE_INFINITY;
      if (pB !== pA) return pB - pA;
      return a.ticker.localeCompare(b.ticker);
    }
    if (sort === 'growth_desc') {
      const gA = a.quality.pillars.growth.score ?? Number.NEGATIVE_INFINITY;
      const gB = b.quality.pillars.growth.score ?? Number.NEGATIVE_INFINITY;
      if (gB !== gA) return gB - gA;
      return a.ticker.localeCompare(b.ticker);
    }
    if (sort === 'health_desc') {
      const hA = a.quality.pillars.financialHealth.score ?? Number.NEGATIVE_INFINITY;
      const hB = b.quality.pillars.financialHealth.score ?? Number.NEGATIVE_INFINITY;
      if (hB !== hA) return hB - hA;
      return a.ticker.localeCompare(b.ticker);
    }
    if (sort === 'cashflow_desc') {
      const cA = a.quality.pillars.cashFlow.score ?? Number.NEGATIVE_INFINITY;
      const cB = b.quality.pillars.cashFlow.score ?? Number.NEGATIVE_INFINITY;
      if (cB !== cA) return cB - cA;
      return a.ticker.localeCompare(b.ticker);
    }
    if (sort === 'adtv_desc') {
      const aA = a.fundamentals.adtvIdr ?? Number.NEGATIVE_INFINITY;
      const aB = b.fundamentals.adtvIdr ?? Number.NEGATIVE_INFINITY;
      if (aB !== aA) return aB - aA;
      return a.ticker.localeCompare(b.ticker);
    }
    if (sort === 'mos_desc') {
      const mosA = a.valuation.mosPct ?? Number.NEGATIVE_INFINITY;
      const mosB = b.valuation.mosPct ?? Number.NEGATIVE_INFINITY;
      if (mosB !== mosA) return mosB - mosA;
      return a.ticker.localeCompare(b.ticker);
    }
    if (sort === 'mos_asc') {
      const mosA = a.valuation.mosPct ?? Number.POSITIVE_INFINITY;
      const mosB = b.valuation.mosPct ?? Number.POSITIVE_INFINITY;
      if (mosA !== mosB) return mosA - mosB;
      return a.ticker.localeCompare(b.ticker);
    }
    if (sort === 'ticker_asc') {
      return a.ticker.localeCompare(b.ticker);
    }
    if (sort === 'ticker_desc') {
      return b.ticker.localeCompare(a.ticker);
    }
    if (sort === 'price_asc') {
      if (a.currentPrice !== b.currentPrice) return a.currentPrice - b.currentPrice;
      return a.ticker.localeCompare(b.ticker);
    }
    if (sort === 'price_desc') {
      if (b.currentPrice !== a.currentPrice) return b.currentPrice - a.currentPrice;
      return a.ticker.localeCompare(b.ticker);
    }
    if (sort === 'fair_value_desc') {
      const fvA = a.valuation.fairValue.moderate ?? Number.NEGATIVE_INFINITY;
      const fvB = b.valuation.fairValue.moderate ?? Number.NEGATIVE_INFINITY;
      if (fvB !== fvA) return fvB - fvA;
      return a.ticker.localeCompare(b.ticker);
    }
    return a.ticker.localeCompare(b.ticker);
  });

  return sorted;
}

/**
 * Overlays the shared Edge-cached IHSG catalog snapshot with the logged-in user's
 * personal holdings/benchmarks and custom watchlist memberships, then filters, sorts,
 * and paginates locally in the browser (0 Worker CPU / 0 D1 reads per screener click).
 */
export function queryCatalogSnapshot(
  snapshot: CatalogSnapshotResponse,
  personalItems: WatchlistItemDto[],
  customGroups: CustomWatchlistGroupDto[],
  query?: Partial<CatalogQuery>,
): CatalogResponseDto {
  const membershipMap = buildCustomMembershipMap(customGroups);
  const personalByTicker = new Map(personalItems.map((item) => [item.ticker, item]));

  const merged: MarketStockDto[] = [];
  const seenTickers = new Set<string>();

  for (const base of snapshot.items) {
    seenTickers.add(base.ticker);
    const personal = personalByTicker.get(base.ticker);
    const customIds = membershipMap.get(base.ticker) ?? [];
    if (personal) {
      merged.push(mapWatchlistItemToMarket(personal, customIds));
    } else if (customIds.length > 0) {
      merged.push({ ...base, customWatchlistIds: customIds });
    } else {
      merged.push(base);
    }
  }

  if (snapshot.items.length === 0 && personalItems.length > 0) {
    for (const personal of personalItems) {
      if (seenTickers.has(personal.ticker)) continue;
      seenTickers.add(personal.ticker);
      merged.push(mapWatchlistItemToMarket(personal, membershipMap.get(personal.ticker) ?? []));
    }
  }

  let summary: CatalogSummaryDto;
  if (personalItems.length === 0 && snapshot.items.length > 0) {
    summary = snapshot.summary;
  } else {
    summary = {
      totalStocks: merged.length,
      undervalued: 0,
      fairlyValued: 0,
      overvalued: 0,
      insufficientData: 0,
      qualityScored: 0,
      eliteQuality: 0,
      strongQuality: 0,
      primeOpportunities: 0,
      lastSyncedAt: snapshot.syncedAt ?? snapshot.summary.lastSyncedAt ?? null,
    };

    for (const item of merged) {
      if (item.valuation.valuationStatus === 'UNDERVALUED') summary.undervalued += 1;
      else if (item.valuation.valuationStatus === 'FAIRLY_VALUED') summary.fairlyValued += 1;
      else if (item.valuation.valuationStatus === 'OVERVALUED') summary.overvalued += 1;
      else summary.insufficientData += 1;

      if (item.quality.score !== null) {
        summary.qualityScored += 1;
        if (item.quality.grade === 'S') summary.eliteQuality += 1;
        else if (item.quality.grade === 'A') summary.strongQuality += 1;
      }
      if (item.quality.qarpQuadrant === 'PRIME_OPPORTUNITY') {
        summary.primeOpportunities += 1;
      }
    }
  }

  const filtered = filterAndSortMarketStocksClient(merged, query ?? {});
  const pageSize = Math.max(1, Math.min(100, query?.pageSize ?? 25));
  const requestedPage = Math.max(1, query?.page ?? 1);
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;

  return {
    items: filtered.slice(startIdx, startIdx + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    summary,
  };
}
