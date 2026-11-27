import type {
  CatalogQuery,
  CatalogResponseDto,
  CatalogSortOption,
  CatalogSummaryDto,
  CatalogSyncResponseDto,
  IdxMarketQuoteDto,
  MarketStockDto,
  WatchlistItemDto,
} from '@/shared/contracts';
import {
  calculateFundamentalQuality,
  calculateValuation,
  computeQarpRankScore,
  DEFAULT_DISCOUNT_RATE_PCT,
  DEFAULT_PROJECTION_YEARS,
  DEFAULT_TERMINAL_GROWTH_PCT,
  isStaleTimestamp,
} from '@/shared/domain';
import { validationError } from '@/server/shared/http/problem';
import type { IdxMarketDataProvider } from '@/server/modules/market-data/domain/market-data.types';
import type {
  CustomWatchlistRecord,
  CustomWatchlistRepository,
  FundamentalsRecord,
  IdxCatalogRepository,
  IdxStockRecord,
  WatchlistItemRecord,
  WatchlistRepository,
} from '../domain/watchlist.types';
import type { CatalogSnapshotStore } from '../infra/catalog-snapshot-store';
import {
  extractQualityColumnsFromInput,
  fromBoolInt,
  fromBps,
  fromX100,
  mapRecordToDto,
  MAX_WATCHLIST_ITEMS_PER_USER,
  toBps,
  toX100,
  type CatalogFallbackRecord,
} from './watchlist-use-cases';

export const CATALOG_AUTO_SYNC_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const ONE_BILLION_IDR = 1_000_000_000;

export function quoteToIdxStockRecord(quote: IdxMarketQuoteDto, syncedAt: number): IdxStockRecord {
  return {
    ticker: quote.ticker.trim().toUpperCase(),
    companyName: quote.companyName,
    sector: quote.sector,
    currentPrice: quote.currentPrice,
    openPrice: quote.openPrice ?? null,
    dailyChange: quote.dailyChange ?? null,
    dailyChangeBps: toBps(quote.dailyChangePct),
    periodLabel: quote.periodLabel,
    eps: quote.fundamentals.eps,
    bvps: quote.fundamentals.bvps,
    dps: quote.fundamentals.dps,
    roeBps: toBps(quote.fundamentals.roePct),
    derX100: toX100(quote.fundamentals.der),
    epsGrowthBps: toBps(quote.fundamentals.epsGrowthPct),
    targetPerX100: toX100(quote.fundamentals.targetPer),
    targetPbvX100: toX100(quote.fundamentals.targetPbv),
    ...extractQualityColumnsFromInput(quote.fundamentals),
    source: quote.source,
    syncedAt,
  };
}

export function mapIdxStockToMarketDto(
  stock: IdxStockRecord,
  customWatchlistIds: string[],
  nowMs = Date.now(),
): MarketStockDto {
  const roePct = fromBps(stock.roeBps);
  const der = fromX100(stock.derX100);
  const epsGrowthPct = fromBps(stock.epsGrowthBps);
  const targetPer = fromX100(stock.targetPerX100);
  const targetPbv = fromX100(stock.targetPbvX100);
  const roaPct = fromBps(stock.roaBps);
  const roicPct = fromBps(stock.roicBps);
  const operatingMarginPct = fromBps(stock.operatingMarginBps);
  const netMarginPct = fromBps(stock.netMarginBps);
  const revenueGrowthPct = fromBps(stock.revenueGrowthBps);
  const netIncomeGrowthPct = fromBps(stock.netIncomeGrowthBps);
  const currentRatio = fromX100(stock.currentRatioX100);
  const netDebtToEbitda = fromX100(stock.netDebtToEbitdaX100);
  const equityToAssetsPct = fromBps(stock.equityToAssetsBps);
  const wholesaleDer = fromX100(stock.wholesaleDerX100);
  const cfoToNetIncome = fromX100(stock.cfoToNiX100);
  const fcfMarginPct = fromBps(stock.fcfMarginBps);
  const fcfYieldPct = fromBps(stock.fcfYieldBps);
  const cfoPositive = fromBoolInt(stock.cfoPositive);
  const fcfPositive = fromBoolInt(stock.fcfPositive);
  const altmanZScore = fromX100(stock.altmanZX100);

  const valuation = calculateValuation({
    sector: stock.sector,
    currentPrice: stock.currentPrice,
    eps: stock.eps,
    bvps: stock.bvps,
    dps: stock.dps,
    roePct,
    der,
    epsGrowthPct,
    targetPer,
    targetPbv,
    discountRatePct: DEFAULT_DISCOUNT_RATE_PCT,
    projectionYears: DEFAULT_PROJECTION_YEARS,
    terminalGrowthPct: DEFAULT_TERMINAL_GROWTH_PCT,
    dividendGrowthPct: null,
  });

  const quality = calculateFundamentalQuality({
    sector: stock.sector,
    currentPrice: stock.currentPrice,
    eps: stock.eps,
    dps: stock.dps,
    roePct,
    roaPct,
    roicPct,
    operatingMarginPct,
    netMarginPct,
    revenueGrowthPct,
    epsGrowthPct,
    netIncomeGrowthPct,
    der,
    wholesaleDer,
    currentRatio,
    netDebtToEbitda,
    equityToAssetsPct,
    cfoToNetIncome,
    fcfMarginPct,
    fcfYieldPct,
    cfoPositive,
    fcfPositive,
    piotroskiFScore: stock.piotroskiFScore,
    altmanZScore,
    marketCapIdr: stock.marketCapIdr,
    adtvIdr: stock.adtvIdr,
    mosPct: valuation.mosPct,
    valueTrapRiskLevel: valuation.valueTrapShield.riskLevel,
  });

  const iso = new Date(stock.syncedAt).toISOString();

  return {
    watchlistItemId: null,
    ticker: stock.ticker,
    companyName: stock.companyName,
    sector: stock.sector,
    currentPrice: stock.currentPrice,
    openPrice: stock.openPrice,
    dailyChange: stock.dailyChange,
    dailyChangePct: fromBps(stock.dailyChangeBps),
    ownedLots: 0,
    avgBuyPrice: null,
    holdingTranches: [],
    targetBuyPrice: null,
    investmentThesis: null,
    updatedAt: iso,
    isStale: isStaleTimestamp(stock.syncedAt, nowMs),
    fundamentals: {
      periodLabel: stock.periodLabel,
      eps: stock.eps,
      bvps: stock.bvps,
      dps: stock.dps,
      roePct,
      der,
      epsGrowthPct,
      targetPer,
      targetPbv,
      discountRatePct: DEFAULT_DISCOUNT_RATE_PCT,
      projectionYears: DEFAULT_PROJECTION_YEARS,
      terminalGrowthPct: DEFAULT_TERMINAL_GROWTH_PCT,
      dividendGrowthPct: null,
      marketCapIdr: stock.marketCapIdr,
      adtvIdr: stock.adtvIdr,
      roaPct,
      roicPct,
      operatingMarginPct,
      netMarginPct,
      revenueGrowthPct,
      netIncomeGrowthPct,
      currentRatio,
      netDebtToEbitda,
      equityToAssetsPct,
      wholesaleDer,
      cfoToNetIncome,
      fcfMarginPct,
      fcfYieldPct,
      cfoPositive,
      fcfPositive,
      piotroskiFScore: stock.piotroskiFScore,
      altmanZScore,
      updatedAt: iso,
    },
    valuation,
    quality,
    customWatchlistIds,
  };
}

export function mapWatchlistRecordToMarketDto(
  record: WatchlistItemRecord,
  customWatchlistIds: string[],
  nowMs = Date.now(),
  catalogFallback?: CatalogFallbackRecord | null,
): MarketStockDto {
  const dto = mapRecordToDto(record, nowMs, catalogFallback);
  return {
    watchlistItemId: dto.id,
    ticker: dto.ticker,
    companyName: dto.companyName,
    sector: dto.sector,
    currentPrice: dto.currentPrice,
    openPrice: dto.openPrice,
    dailyChange: dto.dailyChange,
    dailyChangePct: dto.dailyChangePct,
    ownedLots: dto.ownedLots,
    avgBuyPrice: dto.avgBuyPrice,
    holdingTranches: dto.holdingTranches,
    targetBuyPrice: dto.targetBuyPrice,
    investmentThesis: dto.investmentThesis,
    updatedAt: dto.updatedAt,
    isStale: dto.isStale,
    fundamentals: dto.fundamentals,
    valuation: dto.valuation,
    quality: dto.quality,
    customWatchlistIds,
  };
}

export function buildTickerMembershipMap(groups: CustomWatchlistRecord[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const group of groups) {
    for (const ticker of group.tickers) {
      const list = map.get(ticker) ?? [];
      list.push(group.id);
      map.set(ticker, list);
    }
  }
  return map;
}

export type MarketStockFilterQuery = Pick<
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
>;

export function filterAndSortMarketStocks(
  allItems: MarketStockDto[],
  query: MarketStockFilterQuery,
): MarketStockDto[] {
  let items = allItems;

  if (query.sector) {
    items = items.filter((item) => item.sector === query.sector);
  }

  if (query.search) {
    const needle = query.search.toLowerCase();
    items = items.filter(
      (item) =>
        item.ticker.toLowerCase().includes(needle) ||
        item.companyName.toLowerCase().includes(needle),
    );
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

export class SyncIdxCatalogUseCase {
  constructor(
    private readonly catalogRepo: IdxCatalogRepository,
    private readonly watchlistRepo: WatchlistRepository,
    private readonly marketDataProvider: IdxMarketDataProvider,
    private readonly snapshotStore?: CatalogSnapshotStore,
  ) {}

  async execute(userId?: string, kv?: KVNamespace): Promise<CatalogSyncResponseDto> {
    const now = Date.now();
    const quotes = this.marketDataProvider.fetchAllIdxStocks
      ? await this.marketDataProvider.fetchAllIdxStocks()
      : [];

    if (quotes.length > 0) {
      const records = quotes.map((q) => quoteToIdxStockRecord(q, now));
      await this.catalogRepo.upsertMany(records, now);
      if (this.snapshotStore) {
        await this.snapshotStore.publishSnapshot(records, now, kv);
      }
    }

    let updatedUserItemsCount = 0;
    if (userId && quotes.length > 0) {
      const quoteByTicker = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));
      const userRecords = await this.watchlistRepo.listByUser(userId);
      const batchUpdates: Array<{
        id: string;
        currentPrice: number;
        updatedAt: number;
        fundamentalsPatch: Partial<Omit<FundamentalsRecord, 'id' | 'watchlistItemId'>>;
      }> = [];

      for (const record of userRecords) {
        const quote = quoteByTicker.get(record.ticker);
        if (!quote) continue;
        batchUpdates.push({
          id: record.id,
          currentPrice: quote.currentPrice,
          updatedAt: now,
          fundamentalsPatch: {
            periodLabel: quote.periodLabel,
            eps: quote.fundamentals.eps,
            bvps: quote.fundamentals.bvps,
            dps: quote.fundamentals.dps,
            roeBps: toBps(quote.fundamentals.roePct),
            derX100: toX100(quote.fundamentals.der),
            epsGrowthBps: toBps(quote.fundamentals.epsGrowthPct),
            ...extractQualityColumnsFromInput(quote.fundamentals),
            updatedAt: now,
          },
        });
      }

      if (this.watchlistRepo.batchUpdateMarketData) {
        await this.watchlistRepo.batchUpdateMarketData(userId, batchUpdates);
      } else {
        for (const entry of batchUpdates) {
          await this.watchlistRepo.update(
            entry.id,
            userId,
            { currentPrice: entry.currentPrice, updatedAt: entry.updatedAt },
            entry.fundamentalsPatch,
          );
        }
      }
      updatedUserItemsCount = batchUpdates.length;
    }

    return {
      syncedCount: quotes.length,
      updatedUserItemsCount,
      syncedAt: new Date(now).toISOString(),
    };
  }
}

export class ListCatalogStocksUseCase {
  private static inFlightBootstrap: Promise<void> | null = null;

  constructor(
    private readonly catalogRepo: IdxCatalogRepository,
    private readonly watchlistRepo: WatchlistRepository,
    private readonly customWatchlistRepo: CustomWatchlistRepository,
    private readonly marketDataProvider: IdxMarketDataProvider,
    private readonly snapshotStore?: CatalogSnapshotStore,
  ) {}

  async execute(
    userId: string,
    query: CatalogQuery,
    kv?: KVNamespace,
  ): Promise<CatalogResponseDto> {
    const now = Date.now();

    let snapshot = this.snapshotStore
      ? (
          await this.snapshotStore.getSnapshot({
            kv,
            loadFromD1: async () => {
              const [stocks, latestSyncedAt] = await Promise.all([
                this.catalogRepo.listAll(),
                this.catalogRepo.getLatestSyncedAt(),
              ]);
              return { stocks, latestSyncedAt };
            },
          })
        ).snapshot
      : null;

    // Anti-Thundering Herd: NEVER trigger upstream TradingView sync on TTL expiry inside user requests
    // (Cron Trigger refreshes the snapshot in background). Only perform a single-flight cold bootstrap
    // when the catalog is completely empty (initial deploy or clean test DB).
    if (!snapshot && this.marketDataProvider.fetchAllIdxStocks) {
      if (!ListCatalogStocksUseCase.inFlightBootstrap) {
        ListCatalogStocksUseCase.inFlightBootstrap = (async () => {
          try {
            const quotes = await this.marketDataProvider.fetchAllIdxStocks!();
            if (quotes.length > 0) {
              const syncTs = Date.now();
              const records = quotes.map((q) => quoteToIdxStockRecord(q, syncTs));
              await this.catalogRepo.upsertMany(records, syncTs);
              if (this.snapshotStore) {
                await this.snapshotStore.publishSnapshot(records, syncTs, kv);
              }
            }
          } catch {
            // Gracefully fall back to empty/user items if upstream is temporarily unavailable
          }
        })().finally(() => {
          ListCatalogStocksUseCase.inFlightBootstrap = null;
        });
      }
      await ListCatalogStocksUseCase.inFlightBootstrap;

      if (this.snapshotStore) {
        snapshot = (
          await this.snapshotStore.getSnapshot({
            kv,
            loadFromD1: async () => {
              const [stocks, latestSyncedAt] = await Promise.all([
                this.catalogRepo.listAll(),
                this.catalogRepo.getLatestSyncedAt(),
              ]);
              return { stocks, latestSyncedAt };
            },
          })
        ).snapshot;
      }
    }

    const [userItems, customGroups] = await Promise.all([
      this.watchlistRepo.listByUser(userId),
      this.customWatchlistRepo.listByUser(userId),
    ]);

    const membershipMap = buildTickerMembershipMap(customGroups);
    const userItemByTicker = new Map(userItems.map((item) => [item.ticker, item]));

    // Reuse precomputed MarketStockDto items from Edge/KV snapshot (0 recomputation for unmodified stocks!)
    // and only overlay user's personal positions, custom benchmarks, and custom watchlist memberships.
    const merged: MarketStockDto[] = [];
    const seenTickers = new Set<string>();
    const baseItems = snapshot?.items ?? [];

    for (const base of baseItems) {
      seenTickers.add(base.ticker);
      const userRecord = userItemByTicker.get(base.ticker);
      const customIds = membershipMap.get(base.ticker) ?? [];
      if (userRecord) {
        const fallbackQuality: CatalogFallbackRecord = {
          ...extractQualityColumnsFromInput(base.fundamentals),
          openPrice: base.openPrice,
          dailyChange: base.dailyChange,
          dailyChangeBps: toBps(base.dailyChangePct),
        };
        merged.push(mapWatchlistRecordToMarketDto(userRecord, customIds, now, fallbackQuality));
      } else if (customIds.length > 0) {
        merged.push({ ...base, customWatchlistIds: customIds });
      } else {
        merged.push(base);
      }
    }

    if (baseItems.length === 0) {
      for (const userRecord of userItems) {
        if (seenTickers.has(userRecord.ticker)) continue;
        seenTickers.add(userRecord.ticker);
        const customIds = membershipMap.get(userRecord.ticker) ?? [];
        merged.push(mapWatchlistRecordToMarketDto(userRecord, customIds, now));
      }
    }

    // Fast-path: reuse precomputed summary if user has no personal valuation overrides
    let summary: CatalogSummaryDto;
    if (snapshot && userItems.length === 0) {
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
        lastSyncedAt: snapshot?.syncedAt ?? null,
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

    const filtered = filterAndSortMarketStocks(merged, query);
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize));
    const safePage = Math.min(query.page, totalPages);
    const startIdx = (safePage - 1) * query.pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + query.pageSize);

    return {
      items: pageItems,
      pagination: {
        page: safePage,
        pageSize: query.pageSize,
        totalItems,
        totalPages,
      },
      summary,
    };
  }
}

export class EnsureWatchlistItemUseCase {
  constructor(
    private readonly watchlistRepo: WatchlistRepository,
    private readonly catalogRepo: IdxCatalogRepository,
    private readonly marketDataProvider: IdxMarketDataProvider,
  ) {}

  async execute(userId: string, ticker: string): Promise<{ item: WatchlistItemDto; created: boolean }> {
    const cleanTicker = ticker.trim().toUpperCase();
    const existing = await this.watchlistRepo.findActiveByUserAndTicker(userId, cleanTicker);
    if (existing) {
      const [full, cat] = await Promise.all([
        this.watchlistRepo.findByIdForUser(existing.id, userId),
        this.catalogRepo.findByTicker(cleanTicker),
      ]);
      if (full) {
        return { item: mapRecordToDto(full, Date.now(), cat), created: false };
      }
    }

    const activeCount = await this.watchlistRepo.countActiveByUser(userId);
    if (activeCount >= MAX_WATCHLIST_ITEMS_PER_USER) {
      throw validationError(
        `Tracked stock limit reached (${MAX_WATCHLIST_ITEMS_PER_USER} active stocks maximum).`,
      );
    }

    let stock = await this.catalogRepo.findByTicker(cleanTicker);
    if (!stock) {
      const quote = await this.marketDataProvider.fetchIdxQuote(cleanTicker);
      stock = quoteToIdxStockRecord(quote, Date.now());
      await this.catalogRepo.upsertOne(stock);
    }

    const now = Date.now();
    const itemId = crypto.randomUUID();
    const fundamentalsId = crypto.randomUUID();

    const record: Omit<WatchlistItemRecord, 'deletedAt'> = {
      id: itemId,
      userId,
      ticker: stock.ticker,
      companyName: stock.companyName,
      sector: stock.sector,
      currentPrice: stock.currentPrice,
      ownedLots: 0,
      avgBuyPrice: null,
      avgBuyPriceX100: null,
      holdingTranchesJson: null,
      targetBuyPrice: null,
      investmentThesis: null,
      createdAt: now,
      updatedAt: now,
      fundamentals: {
        id: fundamentalsId,
        watchlistItemId: itemId,
        periodLabel: stock.periodLabel,
        eps: stock.eps,
        bvps: stock.bvps,
        dps: stock.dps,
        roeBps: stock.roeBps,
        derX100: stock.derX100,
        epsGrowthBps: stock.epsGrowthBps,
        targetPerX100: stock.targetPerX100,
        targetPbvX100: stock.targetPbvX100,
        discountRateBps: Math.round(DEFAULT_DISCOUNT_RATE_PCT * 100),
        projectionYears: DEFAULT_PROJECTION_YEARS,
        terminalGrowthBps: Math.round(DEFAULT_TERMINAL_GROWTH_PCT * 100),
        dividendGrowthBps: null,
        marketCapIdr: stock.marketCapIdr,
        adtvIdr: stock.adtvIdr,
        roaBps: stock.roaBps,
        roicBps: stock.roicBps,
        operatingMarginBps: stock.operatingMarginBps,
        netMarginBps: stock.netMarginBps,
        revenueGrowthBps: stock.revenueGrowthBps,
        netIncomeGrowthBps: stock.netIncomeGrowthBps,
        currentRatioX100: stock.currentRatioX100,
        netDebtToEbitdaX100: stock.netDebtToEbitdaX100,
        equityToAssetsBps: stock.equityToAssetsBps,
        wholesaleDerX100: stock.wholesaleDerX100,
        cfoToNiX100: stock.cfoToNiX100,
        fcfMarginBps: stock.fcfMarginBps,
        fcfYieldBps: stock.fcfYieldBps,
        cfoPositive: stock.cfoPositive,
        fcfPositive: stock.fcfPositive,
        piotroskiFScore: stock.piotroskiFScore,
        altmanZX100: stock.altmanZX100,
        updatedAt: now,
      },
    };

    try {
      await this.watchlistRepo.create(record);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        const raced = await this.watchlistRepo.findActiveByUserAndTicker(userId, cleanTicker);
        if (raced) {
          const full = await this.watchlistRepo.findByIdForUser(raced.id, userId);
          if (full) return { item: mapRecordToDto(full, now, stock), created: false };
        }
      }
      throw err;
    }

    return { item: mapRecordToDto({ ...record, deletedAt: null }, now), created: true };
  }
}

export {
  AddStockToCustomWatchlistUseCase,
  CreateCustomWatchlistUseCase,
  DeleteCustomWatchlistUseCase,
  ListCustomWatchlistsUseCase,
  ListCustomWatchlistStocksUseCase,
  MAX_CUSTOM_WATCHLISTS_PER_USER,
  MAX_TICKERS_PER_CUSTOM_WATCHLIST,
  RemoveStockFromCustomWatchlistUseCase,
  UpdateCustomWatchlistUseCase,
} from './custom-watchlist-use-cases';
