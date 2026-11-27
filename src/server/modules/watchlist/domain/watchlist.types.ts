import type { IdxSector } from '@/shared/domain';

export interface QualityMetricColumnsRecord {
  marketCapIdr: number | null;
  adtvIdr: number | null;
  roaBps: number | null;
  roicBps: number | null;
  operatingMarginBps: number | null;
  netMarginBps: number | null;
  revenueGrowthBps: number | null;
  netIncomeGrowthBps: number | null;
  currentRatioX100: number | null;
  netDebtToEbitdaX100: number | null;
  equityToAssetsBps: number | null;
  wholesaleDerX100: number | null;
  cfoToNiX100: number | null;
  fcfMarginBps: number | null;
  fcfYieldBps: number | null;
  cfoPositive: number | null;
  fcfPositive: number | null;
  piotroskiFScore: number | null;
  altmanZX100: number | null;
}

export interface FundamentalsRecord extends QualityMetricColumnsRecord {
  id: string;
  watchlistItemId: string;
  periodLabel: string | null;
  eps: number | null;
  bvps: number | null;
  dps: number | null;
  roeBps: number | null;
  derX100: number | null;
  epsGrowthBps: number | null;
  targetPerX100: number | null;
  targetPbvX100: number | null;
  discountRateBps: number;
  projectionYears: number;
  terminalGrowthBps: number;
  dividendGrowthBps: number | null;
  updatedAt: number;
}

export interface WatchlistItemRecord {
  id: string;
  userId: string;
  ticker: string;
  companyName: string;
  sector: IdxSector;
  currentPrice: number;
  ownedLots: number;
  avgBuyPrice: number | null;
  avgBuyPriceX100: number | null;
  holdingTranchesJson: string | null;
  targetBuyPrice: number | null;
  investmentThesis: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  fundamentals: FundamentalsRecord;
}

export interface WatchlistRepository {
  listByUser(userId: string, sector?: IdxSector): Promise<WatchlistItemRecord[]>;
  countActiveByUser(userId: string): Promise<number>;
  findByIdForUser(id: string, userId: string): Promise<WatchlistItemRecord | null>;
  findActiveByUserAndTicker(userId: string, ticker: string): Promise<{ id: string } | null>;
  create(item: Omit<WatchlistItemRecord, 'deletedAt'>): Promise<void>;
  update(
    id: string,
    userId: string,
    itemPatch: Partial<{
      ticker: string;
      companyName: string;
      sector: IdxSector;
      currentPrice: number;
      ownedLots: number;
      avgBuyPrice: number | null;
      avgBuyPriceX100: number | null;
      holdingTranchesJson: string | null;
      targetBuyPrice: number | null;
      investmentThesis: string | null;
      updatedAt: number;
    }>,
    fundamentalsPatch?: Partial<Omit<FundamentalsRecord, 'id' | 'watchlistItemId'>>,
  ): Promise<void>;
  batchUpdateMarketData?(
    userId: string,
    updates: Array<{
      id: string;
      currentPrice: number;
      updatedAt: number;
      fundamentalsPatch: Partial<Omit<FundamentalsRecord, 'id' | 'watchlistItemId'>>;
    }>,
  ): Promise<void>;
  softDelete(id: string, userId: string, deletedAtMs: number): Promise<boolean>;
}

export interface IdxStockRecord extends QualityMetricColumnsRecord {
  ticker: string;
  companyName: string;
  sector: IdxSector;
  currentPrice: number;
  periodLabel: string | null;
  eps: number | null;
  bvps: number | null;
  dps: number | null;
  roeBps: number | null;
  derX100: number | null;
  epsGrowthBps: number | null;
  targetPerX100: number | null;
  targetPbvX100: number | null;
  source: string;
  syncedAt: number;
}

export interface IdxCatalogRepository {
  listAll(): Promise<IdxStockRecord[]>;
  findByTicker(ticker: string): Promise<IdxStockRecord | null>;
  findByTickers(tickers: string[]): Promise<IdxStockRecord[]>;
  getLatestSyncedAt(): Promise<number | null>;
  hasQualityMetrics(): Promise<boolean>;
  upsertMany(stocks: IdxStockRecord[], pruneBeforeMs?: number): Promise<void>;
  upsertOne(stock: IdxStockRecord): Promise<void>;
}

export interface CustomWatchlistRecord {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  tickers: string[];
}

export interface CustomWatchlistRepository {
  listByUser(userId: string): Promise<CustomWatchlistRecord[]>;
  countActiveByUser(userId: string): Promise<number>;
  findByIdForUser(id: string, userId: string): Promise<CustomWatchlistRecord | null>;
  findActiveByUserAndName(userId: string, name: string): Promise<{ id: string } | null>;
  create(group: Omit<CustomWatchlistRecord, 'deletedAt'>, addedAtMs: number): Promise<void>;
  update(
    id: string,
    userId: string,
    patch: { name?: string; description?: string | null; updatedAt: number },
  ): Promise<void>;
  softDelete(id: string, userId: string, deletedAtMs: number): Promise<boolean>;
  addTicker(watchlistId: string, ticker: string, addedAtMs: number): Promise<boolean>;
  removeTicker(watchlistId: string, ticker: string): Promise<boolean>;
}
