import type {
  CreateWatchlistRequest,
  HoldingTrancheDto,
  UpdateWatchlistRequest,
  WatchlistItemDto,
  WatchlistQuery,
} from '@/shared/contracts';
import {
  aggregateHoldingTranches,
  calculateFundamentalQuality,
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
  IdxCatalogRepository,
  QualityMetricColumnsRecord,
  WatchlistItemRecord,
  WatchlistRepository,
} from '../domain/watchlist.types';

export const MAX_WATCHLIST_ITEMS_PER_USER = 200;

export function toBps(pct: number | null | undefined): number | null {
  if (pct === null || pct === undefined) return null;
  return Math.round(pct * 100);
}

export function fromBps(bps: number | null): number | null {
  if (bps === null) return null;
  return bps / 100;
}

export function toX100(val: number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  return Math.round(val * 100);
}

export function fromX100(x100: number | null): number | null {
  if (x100 === null) return null;
  return x100 / 100;
}

export function toBoolInt(val: boolean | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  return val ? 1 : 0;
}

export function fromBoolInt(val: number | null): boolean | null {
  if (val === null) return null;
  return val !== 0;
}

export function extractQualityColumnsFromInput(f?: {
  marketCapIdr?: number | null;
  adtvIdr?: number | null;
  roaPct?: number | null;
  roicPct?: number | null;
  operatingMarginPct?: number | null;
  netMarginPct?: number | null;
  revenueGrowthPct?: number | null;
  netIncomeGrowthPct?: number | null;
  currentRatio?: number | null;
  netDebtToEbitda?: number | null;
  equityToAssetsPct?: number | null;
  wholesaleDer?: number | null;
  cfoToNetIncome?: number | null;
  fcfMarginPct?: number | null;
  fcfYieldPct?: number | null;
  cfoPositive?: boolean | null;
  fcfPositive?: boolean | null;
  piotroskiFScore?: number | null;
  altmanZScore?: number | null;
}): QualityMetricColumnsRecord {
  return {
    marketCapIdr: f?.marketCapIdr ?? null,
    adtvIdr: f?.adtvIdr ?? null,
    roaBps: toBps(f?.roaPct),
    roicBps: toBps(f?.roicPct),
    operatingMarginBps: toBps(f?.operatingMarginPct),
    netMarginBps: toBps(f?.netMarginPct),
    revenueGrowthBps: toBps(f?.revenueGrowthPct),
    netIncomeGrowthBps: toBps(f?.netIncomeGrowthPct),
    currentRatioX100: toX100(f?.currentRatio),
    netDebtToEbitdaX100: toX100(f?.netDebtToEbitda),
    equityToAssetsBps: toBps(f?.equityToAssetsPct),
    wholesaleDerX100: toX100(f?.wholesaleDer),
    cfoToNiX100: toX100(f?.cfoToNetIncome),
    fcfMarginBps: toBps(f?.fcfMarginPct),
    fcfYieldBps: toBps(f?.fcfYieldPct),
    cfoPositive: toBoolInt(f?.cfoPositive),
    fcfPositive: toBoolInt(f?.fcfPositive),
    piotroskiFScore: f?.piotroskiFScore ?? null,
    altmanZX100: toX100(f?.altmanZScore),
  };
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

export function mapRecordToDto(
  record: WatchlistItemRecord,
  nowMs = Date.now(),
  catalogFallback?: QualityMetricColumnsRecord | null,
): WatchlistItemDto {
  const f = record.fundamentals;
  const roePct = fromBps(f.roeBps);
  const der = fromX100(f.derX100);
  const epsGrowthPct = fromBps(f.epsGrowthBps);
  const targetPer = fromX100(f.targetPerX100);
  const targetPbv = fromX100(f.targetPbvX100);
  const discountRatePct = f.discountRateBps / 100;
  const terminalGrowthPct = f.terminalGrowthBps / 100;
  const dividendGrowthPct = fromBps(f.dividendGrowthBps);

  const marketCapIdr = f.marketCapIdr ?? catalogFallback?.marketCapIdr ?? null;
  const adtvIdr = f.adtvIdr ?? catalogFallback?.adtvIdr ?? null;
  const roaPct = fromBps(f.roaBps ?? catalogFallback?.roaBps ?? null);
  const roicPct = fromBps(f.roicBps ?? catalogFallback?.roicBps ?? null);
  const operatingMarginPct = fromBps(
    f.operatingMarginBps ?? catalogFallback?.operatingMarginBps ?? null,
  );
  const netMarginPct = fromBps(f.netMarginBps ?? catalogFallback?.netMarginBps ?? null);
  const revenueGrowthPct = fromBps(
    f.revenueGrowthBps ?? catalogFallback?.revenueGrowthBps ?? null,
  );
  const netIncomeGrowthPct = fromBps(
    f.netIncomeGrowthBps ?? catalogFallback?.netIncomeGrowthBps ?? null,
  );
  const currentRatio = fromX100(f.currentRatioX100 ?? catalogFallback?.currentRatioX100 ?? null);
  const netDebtToEbitda = fromX100(
    f.netDebtToEbitdaX100 ?? catalogFallback?.netDebtToEbitdaX100 ?? null,
  );
  const equityToAssetsPct = fromBps(
    f.equityToAssetsBps ?? catalogFallback?.equityToAssetsBps ?? null,
  );
  const wholesaleDer = fromX100(f.wholesaleDerX100 ?? catalogFallback?.wholesaleDerX100 ?? null);
  const cfoToNetIncome = fromX100(f.cfoToNiX100 ?? catalogFallback?.cfoToNiX100 ?? null);
  const fcfMarginPct = fromBps(f.fcfMarginBps ?? catalogFallback?.fcfMarginBps ?? null);
  const fcfYieldPct = fromBps(f.fcfYieldBps ?? catalogFallback?.fcfYieldBps ?? null);
  const cfoPositive = fromBoolInt(f.cfoPositive ?? catalogFallback?.cfoPositive ?? null);
  const fcfPositive = fromBoolInt(f.fcfPositive ?? catalogFallback?.fcfPositive ?? null);
  const piotroskiFScore = f.piotroskiFScore ?? catalogFallback?.piotroskiFScore ?? null;
  const altmanZScore = fromX100(f.altmanZX100 ?? catalogFallback?.altmanZX100 ?? null);

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

  const quality = calculateFundamentalQuality({
    sector: record.sector,
    currentPrice: record.currentPrice,
    eps: f.eps,
    dps: f.dps,
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
    piotroskiFScore,
    altmanZScore,
    marketCapIdr,
    adtvIdr,
    mosPct: valuation.mosPct,
    valueTrapRiskLevel: valuation.valueTrapShield.riskLevel,
  });

  const storedAvgBuyPrice =
    record.avgBuyPriceX100 !== null ? fromX100(record.avgBuyPriceX100) : record.avgBuyPrice;
  const holdingTranches = parseHoldingTranches(
    record.holdingTranchesJson,
    record.ownedLots,
    storedAvgBuyPrice,
  );
  const trancheAgg =
    holdingTranches.length > 0 ? aggregateHoldingTranches(holdingTranches) : null;
  const preciseAvgBuyPrice = trancheAgg ? trancheAgg.avgBuyPrice : storedAvgBuyPrice;

  return {
    id: record.id,
    ticker: record.ticker,
    companyName: record.companyName,
    sector: record.sector,
    currentPrice: record.currentPrice,
    ownedLots: record.ownedLots,
    avgBuyPrice: preciseAvgBuyPrice,
    holdingTranches,
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
      marketCapIdr,
      adtvIdr,
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
      piotroskiFScore,
      altmanZScore,
      updatedAt: new Date(f.updatedAt).toISOString(),
    },
    valuation,
    quality,
  };
}

export class ListWatchlistUseCase {
  constructor(
    private readonly repo: WatchlistRepository,
    private readonly catalogRepo?: IdxCatalogRepository,
  ) {}

  async execute(userId: string, query: WatchlistQuery): Promise<WatchlistItemDto[]> {
    const records = await this.repo.listByUser(userId, query.sector);
    const catalogMap = new Map<string, QualityMetricColumnsRecord>();
    if (this.catalogRepo && records.length > 0) {
      const catRows = await this.catalogRepo.findByTickers(records.map((r) => r.ticker));
      for (const row of catRows) {
        catalogMap.set(row.ticker, row);
      }
    }
    const now = Date.now();
    let items = records.map((r) => mapRecordToDto(r, now, catalogMap.get(r.ticker)));

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
    } else if (query.sort === 'fqs_desc') {
      items.sort((a, b) => {
        const fqsA = a.quality.score ?? Number.NEGATIVE_INFINITY;
        const fqsB = b.quality.score ?? Number.NEGATIVE_INFINITY;
        if (fqsB !== fqsA) return fqsB - fqsA;
        return a.ticker.localeCompare(b.ticker);
      });
    } else if (query.sort === 'ticker_asc') {
      items.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }

    return items;
  }
}

export class GetWatchlistItemUseCase {
  constructor(
    private readonly repo: WatchlistRepository,
    private readonly catalogRepo?: IdxCatalogRepository,
  ) {}

  async execute(userId: string, id: string): Promise<WatchlistItemDto> {
    const record = await this.repo.findByIdForUser(id, userId);
    if (!record) {
      throw notFoundError('Watchlist item not found.');
    }
    const catalogFallback = this.catalogRepo
      ? await this.catalogRepo.findByTicker(record.ticker)
      : null;
    return mapRecordToDto(record, Date.now(), catalogFallback);
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
      avgBuyPrice: agg.avgBuyPrice !== null ? Math.round(agg.avgBuyPrice) : null,
      avgBuyPriceX100: toX100(agg.avgBuyPrice),
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
        ...extractQualityColumnsFromInput(f),
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
      itemPatch.avgBuyPrice = agg.avgBuyPrice !== null ? Math.round(agg.avgBuyPrice) : null;
      itemPatch.avgBuyPriceX100 = toX100(agg.avgBuyPrice);
      itemPatch.holdingTranchesJson = JSON.stringify(input.holdingTranches);
    } else {
      if (input.ownedLots !== undefined) itemPatch.ownedLots = input.ownedLots;
      if (input.avgBuyPrice !== undefined) {
        itemPatch.avgBuyPrice =
          input.avgBuyPrice !== null ? Math.round(input.avgBuyPrice) : null;
        itemPatch.avgBuyPriceX100 = toX100(input.avgBuyPrice);
        if (input.avgBuyPrice !== null) {
          const lotsForTranche = input.ownedLots ?? current.ownedLots;
          if (lotsForTranche > 0) {
            itemPatch.holdingTranchesJson = JSON.stringify([
              { lots: lotsForTranche, buyPrice: input.avgBuyPrice },
            ]);
          }
        }
      }
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
      if (f.marketCapIdr !== undefined) fundamentalsPatch.marketCapIdr = f.marketCapIdr;
      if (f.adtvIdr !== undefined) fundamentalsPatch.adtvIdr = f.adtvIdr;
      if (f.roaPct !== undefined) fundamentalsPatch.roaBps = toBps(f.roaPct);
      if (f.roicPct !== undefined) fundamentalsPatch.roicBps = toBps(f.roicPct);
      if (f.operatingMarginPct !== undefined) {
        fundamentalsPatch.operatingMarginBps = toBps(f.operatingMarginPct);
      }
      if (f.netMarginPct !== undefined) fundamentalsPatch.netMarginBps = toBps(f.netMarginPct);
      if (f.revenueGrowthPct !== undefined) {
        fundamentalsPatch.revenueGrowthBps = toBps(f.revenueGrowthPct);
      }
      if (f.netIncomeGrowthPct !== undefined) {
        fundamentalsPatch.netIncomeGrowthBps = toBps(f.netIncomeGrowthPct);
      }
      if (f.currentRatio !== undefined) {
        fundamentalsPatch.currentRatioX100 = toX100(f.currentRatio);
      }
      if (f.netDebtToEbitda !== undefined) {
        fundamentalsPatch.netDebtToEbitdaX100 = toX100(f.netDebtToEbitda);
      }
      if (f.equityToAssetsPct !== undefined) {
        fundamentalsPatch.equityToAssetsBps = toBps(f.equityToAssetsPct);
      }
      if (f.wholesaleDer !== undefined) {
        fundamentalsPatch.wholesaleDerX100 = toX100(f.wholesaleDer);
      }
      if (f.cfoToNetIncome !== undefined) {
        fundamentalsPatch.cfoToNiX100 = toX100(f.cfoToNetIncome);
      }
      if (f.fcfMarginPct !== undefined) fundamentalsPatch.fcfMarginBps = toBps(f.fcfMarginPct);
      if (f.fcfYieldPct !== undefined) fundamentalsPatch.fcfYieldBps = toBps(f.fcfYieldPct);
      if (f.cfoPositive !== undefined) fundamentalsPatch.cfoPositive = toBoolInt(f.cfoPositive);
      if (f.fcfPositive !== undefined) fundamentalsPatch.fcfPositive = toBoolInt(f.fcfPositive);
      if (f.piotroskiFScore !== undefined) fundamentalsPatch.piotroskiFScore = f.piotroskiFScore;
      if (f.altmanZScore !== undefined) fundamentalsPatch.altmanZX100 = toX100(f.altmanZScore);
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
    private readonly catalogRepo?: IdxCatalogRepository,
  ) {}

  async execute(userId: string): Promise<{ updatedCount: number }> {
    const records = await this.repo.listByUser(userId);
    if (records.length === 0) {
      return { updatedCount: 0 };
    }

    const tickers = records.map((r) => r.ticker);
    const catalogByTicker = new Map<string, Awaited<ReturnType<IdxCatalogRepository['findByTickers']>>[number]>();
    if (this.catalogRepo) {
      const catRows = await this.catalogRepo.findByTickers(tickers);
      for (const row of catRows) {
        catalogByTicker.set(row.ticker, row);
      }
    }

    const missingFromCatalog = tickers.filter((t) => !catalogByTicker.has(t));
    const quotesMap =
      missingFromCatalog.length > 0 && this.marketDataProvider.fetchIdxQuotesBatch
        ? await this.marketDataProvider.fetchIdxQuotesBatch(missingFromCatalog)
        : new Map();

    const now = Date.now();
    const batchPayload: Array<{
      id: string;
      currentPrice: number;
      updatedAt: number;
      fundamentalsPatch: Partial<Omit<FundamentalsRecord, 'id' | 'watchlistItemId'>>;
    }> = [];

    for (const record of records) {
      const cat = catalogByTicker.get(record.ticker);
      if (cat) {
        batchPayload.push({
          id: record.id,
          currentPrice: cat.currentPrice,
          updatedAt: now,
          fundamentalsPatch: {
            periodLabel: cat.periodLabel,
            eps: cat.eps,
            bvps: cat.bvps,
            dps: cat.dps,
            roeBps: cat.roeBps,
            derX100: cat.derX100,
            epsGrowthBps: cat.epsGrowthBps,
            marketCapIdr: cat.marketCapIdr,
            adtvIdr: cat.adtvIdr,
            roaBps: cat.roaBps,
            roicBps: cat.roicBps,
            operatingMarginBps: cat.operatingMarginBps,
            netMarginBps: cat.netMarginBps,
            revenueGrowthBps: cat.revenueGrowthBps,
            netIncomeGrowthBps: cat.netIncomeGrowthBps,
            currentRatioX100: cat.currentRatioX100,
            netDebtToEbitdaX100: cat.netDebtToEbitdaX100,
            equityToAssetsBps: cat.equityToAssetsBps,
            wholesaleDerX100: cat.wholesaleDerX100,
            cfoToNiX100: cat.cfoToNiX100,
            fcfMarginBps: cat.fcfMarginBps,
            fcfYieldBps: cat.fcfYieldBps,
            cfoPositive: cat.cfoPositive,
            fcfPositive: cat.fcfPositive,
            piotroskiFScore: cat.piotroskiFScore,
            altmanZX100: cat.altmanZX100,
            updatedAt: now,
          },
        });
        continue;
      }

      const quote = quotesMap.get(record.ticker);
      if (!quote) continue;
      batchPayload.push({
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

    if (this.repo.batchUpdateMarketData) {
      await this.repo.batchUpdateMarketData(userId, batchPayload);
    } else {
      for (const entry of batchPayload) {
        await this.repo.update(
          entry.id,
          userId,
          { currentPrice: entry.currentPrice, updatedAt: entry.updatedAt },
          entry.fundamentalsPatch,
        );
      }
    }

    return { updatedCount: batchPayload.length };
  }
}
