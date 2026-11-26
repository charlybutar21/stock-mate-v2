import type {
  CreateWatchlistRequest,
  HoldingTrancheDto,
  UpdateWatchlistRequest,
  WatchlistItemDto,
  WatchlistQuery,
} from '@/shared/contracts';
import {
  aggregateHoldingTranches,
  calculateValuation,
  DEFAULT_DISCOUNT_RATE_PCT,
  DEFAULT_PROJECTION_YEARS,
  DEFAULT_TERMINAL_GROWTH_PCT,
  isStaleTimestamp,
} from '@/shared/domain';
import { conflictError, notFoundError, validationError } from '@/server/shared/http/problem';
import type { IdxMarketDataProvider } from '@/server/modules/market-data/domain/market-data.types';
import type {
  FundamentalsRecord,
  WatchlistItemRecord,
  WatchlistRepository,
} from '../domain/watchlist.types';

export const MAX_WATCHLIST_ITEMS_PER_USER = 200;

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

function parseHoldingTranches(
  rawJson: string | null,
  ownedLots: number,
  avgBuyPrice: number | null,
): HoldingTrancheDto[] {
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (t): t is HoldingTrancheDto =>
            typeof t === 'object' &&
            t !== null &&
            typeof t.lots === 'number' &&
            t.lots >= 1 &&
            typeof t.buyPrice === 'number' &&
            t.buyPrice >= 1,
        );
      }
    } catch {
      // Fallback below
    }
  }
  if (ownedLots > 0 && avgBuyPrice !== null && avgBuyPrice >= 1) {
    return [{ lots: ownedLots, buyPrice: avgBuyPrice }];
  }
  return [];
}

export function mapRecordToDto(record: WatchlistItemRecord, nowMs = Date.now()): WatchlistItemDto {
  const f = record.fundamentals;
  const roePct = fromBps(f.roeBps);
  const der = fromX100(f.derX100);
  const epsGrowthPct = fromBps(f.epsGrowthBps);
  const targetPer = fromX100(f.targetPerX100);
  const targetPbv = fromX100(f.targetPbvX100);
  const discountRatePct = f.discountRateBps / 100;
  const terminalGrowthPct = f.terminalGrowthBps / 100;
  const dividendGrowthPct = fromBps(f.dividendGrowthBps);

  const valuation = calculateValuation({
    sector: record.sector,
    currentPrice: record.currentPrice,
    eps: f.eps,
    bvps: f.bvps,
    dps: f.dps,
    roePct,
    der,
    epsGrowthPct,
    targetPer,
    targetPbv,
    discountRatePct,
    projectionYears: f.projectionYears,
    terminalGrowthPct,
    dividendGrowthPct,
  });

  return {
    id: record.id,
    ticker: record.ticker,
    companyName: record.companyName,
    sector: record.sector,
    currentPrice: record.currentPrice,
    ownedLots: record.ownedLots,
    avgBuyPrice: record.avgBuyPrice,
    holdingTranches: parseHoldingTranches(
      record.holdingTranchesJson,
      record.ownedLots,
      record.avgBuyPrice,
    ),
    targetBuyPrice: record.targetBuyPrice,
    investmentThesis: record.investmentThesis,
    createdAt: new Date(record.createdAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString(),
    isStale: isStaleTimestamp(record.updatedAt, nowMs),
    fundamentals: {
      periodLabel: f.periodLabel,
      eps: f.eps,
      bvps: f.bvps,
      dps: f.dps,
      roePct,
      der,
      epsGrowthPct,
      targetPer,
      targetPbv,
      discountRatePct,
      projectionYears: f.projectionYears,
      terminalGrowthPct,
      dividendGrowthPct,
      updatedAt: new Date(f.updatedAt).toISOString(),
    },
    valuation,
  };
}

export class ListWatchlistUseCase {
  constructor(private readonly repo: WatchlistRepository) {}

  async execute(userId: string, query: WatchlistQuery): Promise<WatchlistItemDto[]> {
    const records = await this.repo.listByUser(userId, query.sector);
    const now = Date.now();
    let items = records.map((r) => mapRecordToDto(r, now));

    if (query.search) {
      const needle = query.search.toLowerCase();
      items = items.filter(
        (item) =>
          item.ticker.toLowerCase().includes(needle) ||
          item.companyName.toLowerCase().includes(needle),
      );
    }

    if (query.sort === 'mos_desc') {
      items.sort((a, b) => {
        const mosA = a.valuation.mosPct ?? Number.NEGATIVE_INFINITY;
        const mosB = b.valuation.mosPct ?? Number.NEGATIVE_INFINITY;
        if (mosB !== mosA) return mosB - mosA;
        return a.ticker.localeCompare(b.ticker);
      });
    } else if (query.sort === 'ticker_asc') {
      items.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }

    return items;
  }
}

export class GetWatchlistItemUseCase {
  constructor(private readonly repo: WatchlistRepository) {}

  async execute(userId: string, id: string): Promise<WatchlistItemDto> {
    const record = await this.repo.findByIdForUser(id, userId);
    if (!record) {
      throw notFoundError('Watchlist item not found.');
    }
    return mapRecordToDto(record);
  }
}

export class CreateWatchlistItemUseCase {
  constructor(private readonly repo: WatchlistRepository) {}

  async execute(userId: string, input: CreateWatchlistRequest): Promise<WatchlistItemDto> {
    const existing = await this.repo.findActiveByUserAndTicker(userId, input.ticker);
    if (existing) {
      throw conflictError(`Ticker ${input.ticker} is already in your watchlist.`);
    }

    const activeCount = await this.repo.countActiveByUser(userId);
    if (activeCount >= MAX_WATCHLIST_ITEMS_PER_USER) {
      throw validationError(
        `Watchlist limit reached (${MAX_WATCHLIST_ITEMS_PER_USER} active stocks maximum).`,
      );
    }

    const now = Date.now();
    const itemId = crypto.randomUUID();
    const fundamentalsId = crypto.randomUUID();
    const f = input.fundamentals;

    const agg = input.holdingTranches
      ? aggregateHoldingTranches(input.holdingTranches)
      : {
          ownedLots: input.ownedLots ?? 0,
          avgBuyPrice: input.avgBuyPrice ?? null,
        };
    const holdingTranchesJson = input.holdingTranches
      ? JSON.stringify(input.holdingTranches)
      : agg.ownedLots > 0 && agg.avgBuyPrice !== null
        ? JSON.stringify([{ lots: agg.ownedLots, buyPrice: agg.avgBuyPrice }])
        : null;

    const record: Omit<WatchlistItemRecord, 'deletedAt'> = {
      id: itemId,
      userId,
      ticker: input.ticker,
      companyName: input.companyName,
      sector: input.sector,
      currentPrice: input.currentPrice,
      ownedLots: agg.ownedLots,
      avgBuyPrice: agg.avgBuyPrice,
      holdingTranchesJson,
      targetBuyPrice: input.targetBuyPrice ?? null,
      investmentThesis: input.investmentThesis ?? null,
      createdAt: now,
      updatedAt: now,
      fundamentals: {
        id: fundamentalsId,
        watchlistItemId: itemId,
        periodLabel: f?.periodLabel ?? null,
        eps: f?.eps ?? null,
        bvps: f?.bvps ?? null,
        dps: f?.dps ?? null,
        roeBps: toBps(f?.roePct),
        derX100: toX100(f?.der),
        epsGrowthBps: toBps(f?.epsGrowthPct),
        targetPerX100: toX100(f?.targetPer),
        targetPbvX100: toX100(f?.targetPbv),
        discountRateBps: Math.round((f?.discountRatePct ?? DEFAULT_DISCOUNT_RATE_PCT) * 100),
        projectionYears: f?.projectionYears ?? DEFAULT_PROJECTION_YEARS,
        terminalGrowthBps: Math.round((f?.terminalGrowthPct ?? DEFAULT_TERMINAL_GROWTH_PCT) * 100),
        dividendGrowthBps: toBps(f?.dividendGrowthPct),
        updatedAt: now,
      },
    };

    try {
      await this.repo.create(record);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        throw conflictError(`Ticker ${input.ticker} is already in your watchlist.`);
      }
      throw err;
    }

    return mapRecordToDto({ ...record, deletedAt: null }, now);
  }
}

export class UpdateWatchlistItemUseCase {
  constructor(private readonly repo: WatchlistRepository) {}

  async execute(
    userId: string,
    id: string,
    input: UpdateWatchlistRequest,
  ): Promise<WatchlistItemDto> {
    const current = await this.repo.findByIdForUser(id, userId);
    if (!current) {
      throw notFoundError('Watchlist item not found.');
    }

    if (input.ticker && input.ticker !== current.ticker) {
      const conflict = await this.repo.findActiveByUserAndTicker(userId, input.ticker);
      if (conflict && conflict.id !== id) {
        throw conflictError(`Ticker ${input.ticker} is already in your watchlist.`);
      }
    }

    const now = Date.now();
    const itemPatch: Parameters<WatchlistRepository['update']>[2] = {
      updatedAt: now,
    };
    if (input.ticker !== undefined) itemPatch.ticker = input.ticker;
    if (input.companyName !== undefined) itemPatch.companyName = input.companyName;
    if (input.sector !== undefined) itemPatch.sector = input.sector;
    if (input.currentPrice !== undefined) itemPatch.currentPrice = input.currentPrice;
    if (input.holdingTranches !== undefined) {
      const agg = aggregateHoldingTranches(input.holdingTranches);
      itemPatch.ownedLots = agg.ownedLots;
      itemPatch.avgBuyPrice = agg.avgBuyPrice;
      itemPatch.holdingTranchesJson = JSON.stringify(input.holdingTranches);
    } else {
      if (input.ownedLots !== undefined) itemPatch.ownedLots = input.ownedLots;
      if (input.avgBuyPrice !== undefined) itemPatch.avgBuyPrice = input.avgBuyPrice;
    }
    if (input.targetBuyPrice !== undefined) itemPatch.targetBuyPrice = input.targetBuyPrice;
    if (input.investmentThesis !== undefined) itemPatch.investmentThesis = input.investmentThesis;

    let fundamentalsPatch: Partial<Omit<FundamentalsRecord, 'id' | 'watchlistItemId'>> | undefined;
    if (input.fundamentals) {
      const f = input.fundamentals;
      fundamentalsPatch = { updatedAt: now };
      if (f.periodLabel !== undefined) fundamentalsPatch.periodLabel = f.periodLabel;
      if (f.eps !== undefined) fundamentalsPatch.eps = f.eps;
      if (f.bvps !== undefined) fundamentalsPatch.bvps = f.bvps;
      if (f.dps !== undefined) fundamentalsPatch.dps = f.dps;
      if (f.roePct !== undefined) fundamentalsPatch.roeBps = toBps(f.roePct);
      if (f.der !== undefined) fundamentalsPatch.derX100 = toX100(f.der);
      if (f.epsGrowthPct !== undefined) fundamentalsPatch.epsGrowthBps = toBps(f.epsGrowthPct);
      if (f.targetPer !== undefined) fundamentalsPatch.targetPerX100 = toX100(f.targetPer);
      if (f.targetPbv !== undefined) fundamentalsPatch.targetPbvX100 = toX100(f.targetPbv);
      if (f.discountRatePct !== undefined) {
        fundamentalsPatch.discountRateBps = Math.round(f.discountRatePct * 100);
      }
      if (f.projectionYears !== undefined) {
        fundamentalsPatch.projectionYears = f.projectionYears;
      }
      if (f.terminalGrowthPct !== undefined) {
        fundamentalsPatch.terminalGrowthBps = Math.round(f.terminalGrowthPct * 100);
      }
      if (f.dividendGrowthPct !== undefined) {
        fundamentalsPatch.dividendGrowthBps = toBps(f.dividendGrowthPct);
      }
    }

    await this.repo.update(id, userId, itemPatch, fundamentalsPatch);

    const updated = await this.repo.findByIdForUser(id, userId);
    if (!updated) {
      throw notFoundError('Watchlist item not found.');
    }
    return mapRecordToDto(updated, now);
  }
}

export class SoftDeleteWatchlistItemUseCase {
  constructor(private readonly repo: WatchlistRepository) {}

  async execute(userId: string, id: string): Promise<void> {
    const deleted = await this.repo.softDelete(id, userId, Date.now());
    if (!deleted) {
      throw notFoundError('Watchlist item not found.');
    }
  }
}

export class SyncAllWatchlistUseCase {
  constructor(
    private readonly repo: WatchlistRepository,
    private readonly marketDataProvider: IdxMarketDataProvider,
  ) {}

  async execute(userId: string): Promise<{ updatedCount: number }> {
    const records = await this.repo.listByUser(userId);
    if (records.length === 0) {
      return { updatedCount: 0 };
    }

    const tickers = records.map((r) => r.ticker);
    const quotesMap = this.marketDataProvider.fetchIdxQuotesBatch
      ? await this.marketDataProvider.fetchIdxQuotesBatch(tickers)
      : new Map();

    const now = Date.now();
    let updatedCount = 0;

    for (const record of records) {
      const quote = quotesMap.get(record.ticker);
      if (!quote) continue;
      await this.repo.update(
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
      updatedCount += 1;
    }

    return { updatedCount };
  }
}
