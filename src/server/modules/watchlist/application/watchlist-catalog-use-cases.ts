import type {
  AddCustomWatchlistStockRequest,
  CatalogQuery,
  CatalogResponseDto,
  CatalogSortOption,
  CatalogSummaryDto,
  CatalogSyncResponseDto,
  CreateCustomWatchlistRequest,
  CustomWatchlistGroupDto,
  IdxMarketQuoteDto,
  MarketStockDto,
  UpdateCustomWatchlistRequest,
  WatchlistItemDto,
} from '@/shared/contracts';
import {
  calculateValuation,
  DEFAULT_DISCOUNT_RATE_PCT,
  DEFAULT_PROJECTION_YEARS,
  DEFAULT_TERMINAL_GROWTH_PCT,
  isStaleTimestamp,
} from '@/shared/domain';
import { conflictError, notFoundError, validationError } from '@/server/shared/http/problem';
import type { IdxMarketDataProvider } from '@/server/modules/market-data/domain/market-data.types';
import type {
  CustomWatchlistRecord,
  CustomWatchlistRepository,
  IdxCatalogRepository,
  IdxStockRecord,
  WatchlistItemRecord,
  WatchlistRepository,
} from '../domain/watchlist.types';
import { mapRecordToDto, MAX_WATCHLIST_ITEMS_PER_USER } from './watchlist-use-cases';

export const MAX_CUSTOM_WATCHLISTS_PER_USER = 30;
export const MAX_TICKERS_PER_CUSTOM_WATCHLIST = 100;
export const CATALOG_AUTO_SYNC_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function toBps(pct: number | null | undefined): number | null {
  if (pct === null || pct === undefined) return null;
  return Math.round(pct * 100);
}

function fromBps(bps: number | null): number | null {
  if (bps === null) return null;
  return bps / 100;
}

function toX100(val: number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  return Math.round(val * 100);
}

function fromX100(x100: number | null): number | null {
  if (x100 === null) return null;
  return x100 / 100;
}

export function quoteToIdxStockRecord(quote: IdxMarketQuoteDto, syncedAt: number): IdxStockRecord {
  return {
    ticker: quote.ticker.trim().toUpperCase(),
    companyName: quote.companyName,
    sector: quote.sector,
    currentPrice: quote.currentPrice,
    periodLabel: quote.periodLabel,
    eps: quote.fundamentals.eps,
    bvps: quote.fundamentals.bvps,
    dps: quote.fundamentals.dps,
    roeBps: toBps(quote.fundamentals.roePct),
    derX100: toX100(quote.fundamentals.der),
    epsGrowthBps: toBps(quote.fundamentals.epsGrowthPct),
    targetPerX100: toX100(quote.fundamentals.targetPer),
    targetPbvX100: toX100(quote.fundamentals.targetPbv),
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

  const iso = new Date(stock.syncedAt).toISOString();

  return {
    watchlistItemId: null,
    ticker: stock.ticker,
    companyName: stock.companyName,
    sector: stock.sector,
    currentPrice: stock.currentPrice,
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
      updatedAt: iso,
    },
    valuation,
    customWatchlistIds,
  };
}

export function mapWatchlistRecordToMarketDto(
  record: WatchlistItemRecord,
  customWatchlistIds: string[],
  nowMs = Date.now(),
): MarketStockDto {
  const dto = mapRecordToDto(record, nowMs);
  return {
    watchlistItemId: dto.id,
    ticker: dto.ticker,
    companyName: dto.companyName,
    sector: dto.sector,
    currentPrice: dto.currentPrice,
    ownedLots: dto.ownedLots,
    avgBuyPrice: dto.avgBuyPrice,
    holdingTranches: dto.holdingTranches,
    targetBuyPrice: dto.targetBuyPrice,
    investmentThesis: dto.investmentThesis,
    updatedAt: dto.updatedAt,
    isStale: dto.isStale,
    fundamentals: dto.fundamentals,
    valuation: dto.valuation,
    customWatchlistIds,
  };
}

function buildTickerMembershipMap(groups: CustomWatchlistRecord[]): Map<string, string[]> {
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

function mapGroupRecordToDto(record: CustomWatchlistRecord): CustomWatchlistGroupDto {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    tickers: record.tickers,
    stockCount: record.tickers.length,
    createdAt: new Date(record.createdAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString(),
  };
}

export function filterAndSortMarketStocks(
  allItems: MarketStockDto[],
  query: Pick<CatalogQuery, 'search' | 'sector' | 'valuationStatus' | 'minMos' | 'maxMos' | 'sort'>,
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

  const sort: CatalogSortOption = query.sort ?? 'mos_desc';
  const sorted = [...items];

  sorted.sort((a, b) => {
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
  ) {}

  async execute(userId?: string): Promise<CatalogSyncResponseDto> {
    const now = Date.now();
    const quotes = this.marketDataProvider.fetchAllIdxStocks
      ? await this.marketDataProvider.fetchAllIdxStocks()
      : [];

    if (quotes.length > 0) {
      const records = quotes.map((q) => quoteToIdxStockRecord(q, now));
      await this.catalogRepo.upsertMany(records, now);
    }

    let updatedUserItemsCount = 0;
    if (userId && quotes.length > 0) {
      const quoteByTicker = new Map(quotes.map((q) => [q.ticker.toUpperCase(), q]));
      const userRecords = await this.watchlistRepo.listByUser(userId);
      for (const record of userRecords) {
        const quote = quoteByTicker.get(record.ticker);
        if (!quote) continue;
        await this.watchlistRepo.update(
          record.id,
          userId,
          {
            currentPrice: quote.currentPrice,
            updatedAt: now,
          },
          {
            periodLabel: quote.periodLabel,
            eps: quote.fundamentals.eps,
            bvps: quote.fundamentals.bvps,
            dps: quote.fundamentals.dps,
            roeBps: toBps(quote.fundamentals.roePct),
            derX100: toX100(quote.fundamentals.der),
            epsGrowthBps: toBps(quote.fundamentals.epsGrowthPct),
            updatedAt: now,
          },
        );
        updatedUserItemsCount += 1;
      }
    }

    return {
      syncedCount: quotes.length,
      updatedUserItemsCount,
      syncedAt: new Date(now).toISOString(),
    };
  }
}

export class ListCatalogStocksUseCase {
  constructor(
    private readonly catalogRepo: IdxCatalogRepository,
    private readonly watchlistRepo: WatchlistRepository,
    private readonly customWatchlistRepo: CustomWatchlistRepository,
    private readonly marketDataProvider: IdxMarketDataProvider,
  ) {}

  async execute(userId: string, query: CatalogQuery): Promise<CatalogResponseDto> {
    const now = Date.now();
    let latestSyncedAt = await this.catalogRepo.getLatestSyncedAt();

    const needsAutoSync =
      latestSyncedAt === null || now - latestSyncedAt > CATALOG_AUTO_SYNC_TTL_MS;

    if (needsAutoSync && this.marketDataProvider.fetchAllIdxStocks) {
      try {
        const quotes = await this.marketDataProvider.fetchAllIdxStocks();
        if (quotes.length > 0) {
          const syncTs = Date.now();
          await this.catalogRepo.upsertMany(
            quotes.map((q) => quoteToIdxStockRecord(q, syncTs)),
            syncTs,
          );
          latestSyncedAt = syncTs;
        }
      } catch {
        // Gracefully serve existing D1 catalog rows if upstream is temporarily unavailable
      }
    }

    const [catalogStocks, userItems, customGroups] = await Promise.all([
      this.catalogRepo.listAll(),
      this.watchlistRepo.listByUser(userId),
      this.customWatchlistRepo.listByUser(userId),
    ]);

    const membershipMap = buildTickerMembershipMap(customGroups);
    const userItemByTicker = new Map(userItems.map((item) => [item.ticker, item]));

    // Build unified All Stocks list from synced IHSG constituents, overlaying user's personal
    // position, thesis, and custom valuation benchmarks when present.
    const merged: MarketStockDto[] = [];
    const seenTickers = new Set<string>();

    for (const stock of catalogStocks) {
      seenTickers.add(stock.ticker);
      const userRecord = userItemByTicker.get(stock.ticker);
      const customIds = membershipMap.get(stock.ticker) ?? [];
      if (userRecord) {
        merged.push(mapWatchlistRecordToMarketDto(userRecord, customIds, now));
      } else {
        merged.push(mapIdxStockToMarketDto(stock, customIds, now));
      }
    }

    // If catalog hasn't been synced yet (e.g. offline/test mode), still surface user's tracked stocks
    if (catalogStocks.length === 0) {
      for (const userRecord of userItems) {
        if (seenTickers.has(userRecord.ticker)) continue;
        seenTickers.add(userRecord.ticker);
        const customIds = membershipMap.get(userRecord.ticker) ?? [];
        merged.push(mapWatchlistRecordToMarketDto(userRecord, customIds, now));
      }
    }

    const summary: CatalogSummaryDto = {
      totalStocks: merged.length,
      undervalued: 0,
      fairlyValued: 0,
      overvalued: 0,
      insufficientData: 0,
      lastSyncedAt: latestSyncedAt !== null ? new Date(latestSyncedAt).toISOString() : null,
    };

    for (const item of merged) {
      if (item.valuation.valuationStatus === 'UNDERVALUED') summary.undervalued += 1;
      else if (item.valuation.valuationStatus === 'FAIRLY_VALUED') summary.fairlyValued += 1;
      else if (item.valuation.valuationStatus === 'OVERVALUED') summary.overvalued += 1;
      else summary.insufficientData += 1;
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
      const full = await this.watchlistRepo.findByIdForUser(existing.id, userId);
      if (full) {
        return { item: mapRecordToDto(full), created: false };
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
          if (full) return { item: mapRecordToDto(full), created: false };
        }
      }
      throw err;
    }

    return { item: mapRecordToDto({ ...record, deletedAt: null }, now), created: true };
  }
}

export class ListCustomWatchlistsUseCase {
  constructor(private readonly customWatchlistRepo: CustomWatchlistRepository) {}

  async execute(userId: string): Promise<CustomWatchlistGroupDto[]> {
    const groups = await this.customWatchlistRepo.listByUser(userId);
    return groups.map(mapGroupRecordToDto);
  }
}

export class CreateCustomWatchlistUseCase {
  constructor(
    private readonly customWatchlistRepo: CustomWatchlistRepository,
    private readonly catalogRepo: IdxCatalogRepository,
    private readonly watchlistRepo: WatchlistRepository,
    private readonly marketDataProvider: IdxMarketDataProvider,
  ) {}

  async execute(
    userId: string,
    input: CreateCustomWatchlistRequest,
  ): Promise<CustomWatchlistGroupDto> {
    const cleanName = input.name.trim();
    const existing = await this.customWatchlistRepo.findActiveByUserAndName(userId, cleanName);
    if (existing) {
      throw conflictError(`Custom watchlist "${cleanName}" already exists.`);
    }

    const activeCount = await this.customWatchlistRepo.countActiveByUser(userId);
    if (activeCount >= MAX_CUSTOM_WATCHLISTS_PER_USER) {
      throw validationError(
        `Custom watchlist limit reached (${MAX_CUSTOM_WATCHLISTS_PER_USER} watchlists maximum).`,
      );
    }

    const uniqueTickers = Array.from(new Set(input.tickers.map((t) => t.trim().toUpperCase())));
    if (uniqueTickers.length > MAX_TICKERS_PER_CUSTOM_WATCHLIST) {
      throw validationError(
        `Maximum ${MAX_TICKERS_PER_CUSTOM_WATCHLIST} stocks allowed per custom watchlist.`,
      );
    }

    // Ensure every requested ticker has data either in idx_stocks or user's watchlist_items,
    // fetching live quotes for any unknown ticker.
    if (uniqueTickers.length > 0) {
      const [foundInCatalog, userItems] = await Promise.all([
        this.catalogRepo.findByTickers(uniqueTickers),
        this.watchlistRepo.listByUser(userId),
      ]);
      const knownTickers = new Set<string>([
        ...foundInCatalog.map((s) => s.ticker),
        ...userItems.map((i) => i.ticker),
      ]);
      const missing = uniqueTickers.filter((t) => !knownTickers.has(t));

      if (missing.length > 0) {
        const nowSync = Date.now();
        if (this.marketDataProvider.fetchIdxQuotesBatch) {
          const quotesMap = await this.marketDataProvider.fetchIdxQuotesBatch(missing);
          const toUpsert = Array.from(quotesMap.values()).map((q) =>
            quoteToIdxStockRecord(q, nowSync),
          );
          if (toUpsert.length > 0) {
            await this.catalogRepo.upsertMany(toUpsert);
          }
          const unresolved = missing.filter((t) => !quotesMap.has(t));
          if (unresolved.length > 0) {
            throw notFoundError(`IDX ticker not found: ${unresolved.join(', ')}.`);
          }
        } else {
          for (const t of missing) {
            const quote = await this.marketDataProvider.fetchIdxQuote(t);
            await this.catalogRepo.upsertOne(quoteToIdxStockRecord(quote, nowSync));
          }
        }
      }
    }

    const now = Date.now();
    const record: Omit<CustomWatchlistRecord, 'deletedAt'> = {
      id: crypto.randomUUID(),
      userId,
      name: cleanName,
      description: input.description?.trim() || null,
      createdAt: now,
      updatedAt: now,
      tickers: uniqueTickers,
    };

    try {
      await this.customWatchlistRepo.create(record, now);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        throw conflictError(`Custom watchlist "${cleanName}" already exists.`);
      }
      throw err;
    }

    return mapGroupRecordToDto({ ...record, deletedAt: null });
  }
}

export class UpdateCustomWatchlistUseCase {
  constructor(private readonly customWatchlistRepo: CustomWatchlistRepository) {}

  async execute(
    userId: string,
    id: string,
    input: UpdateCustomWatchlistRequest,
  ): Promise<CustomWatchlistGroupDto> {
    const current = await this.customWatchlistRepo.findByIdForUser(id, userId);
    if (!current) {
      throw notFoundError('Custom watchlist not found.');
    }

    const patch: { name?: string; description?: string | null; updatedAt: number } = {
      updatedAt: Date.now(),
    };

    if (input.name !== undefined) {
      const cleanName = input.name.trim();
      if (cleanName.toLowerCase() !== current.name.toLowerCase()) {
        const conflict = await this.customWatchlistRepo.findActiveByUserAndName(userId, cleanName);
        if (conflict && conflict.id !== id) {
          throw conflictError(`Custom watchlist "${cleanName}" already exists.`);
        }
      }
      patch.name = cleanName;
    }

    if (input.description !== undefined) {
      patch.description = input.description?.trim() || null;
    }

    await this.customWatchlistRepo.update(id, userId, patch);

    const updated = await this.customWatchlistRepo.findByIdForUser(id, userId);
    if (!updated) {
      throw notFoundError('Custom watchlist not found.');
    }
    return mapGroupRecordToDto(updated);
  }
}

export class DeleteCustomWatchlistUseCase {
  constructor(private readonly customWatchlistRepo: CustomWatchlistRepository) {}

  async execute(userId: string, id: string): Promise<void> {
    const deleted = await this.customWatchlistRepo.softDelete(id, userId, Date.now());
    if (!deleted) {
      throw notFoundError('Custom watchlist not found.');
    }
  }
}

export class ListCustomWatchlistStocksUseCase {
  constructor(
    private readonly customWatchlistRepo: CustomWatchlistRepository,
    private readonly catalogRepo: IdxCatalogRepository,
    private readonly watchlistRepo: WatchlistRepository,
  ) {}

  async execute(
    userId: string,
    groupId: string,
    query: Pick<CatalogQuery, 'search' | 'sector' | 'valuationStatus' | 'minMos' | 'maxMos' | 'sort'>,
  ): Promise<{ group: CustomWatchlistGroupDto; items: MarketStockDto[] }> {
    const group = await this.customWatchlistRepo.findByIdForUser(groupId, userId);
    if (!group) {
      throw notFoundError('Custom watchlist not found.');
    }

    if (group.tickers.length === 0) {
      return { group: mapGroupRecordToDto(group), items: [] };
    }

    const [catalogStocks, userItems, allGroups] = await Promise.all([
      this.catalogRepo.findByTickers(group.tickers),
      this.watchlistRepo.listByUser(userId),
      this.customWatchlistRepo.listByUser(userId),
    ]);

    const catalogByTicker = new Map(catalogStocks.map((s) => [s.ticker, s]));
    const userItemByTicker = new Map(userItems.map((i) => [i.ticker, i]));
    const membershipMap = buildTickerMembershipMap(allGroups);
    const now = Date.now();

    const resolved: MarketStockDto[] = [];
    for (const ticker of group.tickers) {
      const customIds = membershipMap.get(ticker) ?? [group.id];
      const userRecord = userItemByTicker.get(ticker);
      if (userRecord) {
        resolved.push(mapWatchlistRecordToMarketDto(userRecord, customIds, now));
        continue;
      }
      const catRecord = catalogByTicker.get(ticker);
      if (catRecord) {
        resolved.push(mapIdxStockToMarketDto(catRecord, customIds, now));
      }
    }

    const filtered = filterAndSortMarketStocks(resolved, query);
    return {
      group: mapGroupRecordToDto(group),
      items: filtered,
    };
  }
}

export class AddStockToCustomWatchlistUseCase {
  constructor(
    private readonly customWatchlistRepo: CustomWatchlistRepository,
    private readonly catalogRepo: IdxCatalogRepository,
    private readonly watchlistRepo: WatchlistRepository,
    private readonly marketDataProvider: IdxMarketDataProvider,
  ) {}

  async execute(
    userId: string,
    groupId: string,
    input: AddCustomWatchlistStockRequest,
  ): Promise<MarketStockDto> {
    const group = await this.customWatchlistRepo.findByIdForUser(groupId, userId);
    if (!group) {
      throw notFoundError('Custom watchlist not found.');
    }

    const cleanTicker = input.ticker.trim().toUpperCase();
    if (group.tickers.includes(cleanTicker)) {
      throw conflictError(`Ticker ${cleanTicker} is already in "${group.name}".`);
    }
    if (group.tickers.length >= MAX_TICKERS_PER_CUSTOM_WATCHLIST) {
      throw validationError(
        `Maximum ${MAX_TICKERS_PER_CUSTOM_WATCHLIST} stocks allowed per custom watchlist.`,
      );
    }

    const existingUserLink = await this.watchlistRepo.findActiveByUserAndTicker(userId, cleanTicker);
    let catalogStock = await this.catalogRepo.findByTicker(cleanTicker);

    if (!existingUserLink && !catalogStock) {
      const quote = await this.marketDataProvider.fetchIdxQuote(cleanTicker);
      catalogStock = quoteToIdxStockRecord(quote, Date.now());
      await this.catalogRepo.upsertOne(catalogStock);
    }

    const now = Date.now();
    const added = await this.customWatchlistRepo.addTicker(group.id, cleanTicker, now);
    if (!added) {
      throw conflictError(`Ticker ${cleanTicker} is already in "${group.name}".`);
    }

    const allGroups = await this.customWatchlistRepo.listByUser(userId);
    const customIds = buildTickerMembershipMap(allGroups).get(cleanTicker) ?? [group.id];

    if (existingUserLink) {
      const full = await this.watchlistRepo.findByIdForUser(existingUserLink.id, userId);
      if (full) {
        return mapWatchlistRecordToMarketDto(full, customIds, now);
      }
    }

    if (!catalogStock) {
      throw notFoundError(`IDX ticker ${cleanTicker} not found.`);
    }
    return mapIdxStockToMarketDto(catalogStock, customIds, now);
  }
}

export class RemoveStockFromCustomWatchlistUseCase {
  constructor(private readonly customWatchlistRepo: CustomWatchlistRepository) {}

  async execute(userId: string, groupId: string, ticker: string): Promise<void> {
    const group = await this.customWatchlistRepo.findByIdForUser(groupId, userId);
    if (!group) {
      throw notFoundError('Custom watchlist not found.');
    }

    const cleanTicker = ticker.trim().toUpperCase();
    const removed = await this.customWatchlistRepo.removeTicker(group.id, cleanTicker);
    if (!removed) {
      throw notFoundError(`Ticker ${cleanTicker} is not in "${group.name}".`);
    }
  }
}
