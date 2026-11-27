import type {
  AddCustomWatchlistStockRequest,
  CreateCustomWatchlistRequest,
  CustomWatchlistGroupDto,
  MarketStockDto,
  UpdateCustomWatchlistRequest,
} from '@/shared/contracts';
import { conflictError, notFoundError, validationError } from '@/server/shared/http/problem';
import type { IdxMarketDataProvider } from '@/server/modules/market-data/domain/market-data.types';
import type {
  CustomWatchlistRecord,
  CustomWatchlistRepository,
  IdxCatalogRepository,
  WatchlistRepository,
} from '../domain/watchlist.types';
import {
  buildTickerMembershipMap,
  filterAndSortMarketStocks,
  mapIdxStockToMarketDto,
  mapWatchlistRecordToMarketDto,
  quoteToIdxStockRecord,
  type MarketStockFilterQuery,
} from './watchlist-catalog-use-cases';

export const MAX_CUSTOM_WATCHLISTS_PER_USER = 30;
export const MAX_TICKERS_PER_CUSTOM_WATCHLIST = 100;

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
    query: MarketStockFilterQuery,
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
      const catRecord = catalogByTicker.get(ticker);
      if (userRecord) {
        resolved.push(mapWatchlistRecordToMarketDto(userRecord, customIds, now, catRecord));
        continue;
      }
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
        return mapWatchlistRecordToMarketDto(full, customIds, now, catalogStock);
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
