import { z } from 'zod';
import {
  DEFAULT_DISCOUNT_RATE_PCT,
  DEFAULT_PROJECTION_YEARS,
  DEFAULT_TERMINAL_GROWTH_PCT,
  IDX_SECTORS,
  MIN_IDX_PRICE,
  round2,
  type FundamentalQualitySummary,
  type IdxSector,
  type QarpQuadrant,
  type QualityGrade,
  type ValuationSummary,
} from '../domain';

export const MAX_IDX_PRICE = 100_000_000;
export const MAX_OWNED_LOTS = 100_000_000;
export const MAX_PER_SHARE_VALUE = 100_000_000;

const optionalNullableInt = (opts?: { min?: number; max?: number }) => {
  let schema = z.number().int();
  if (opts?.min !== undefined) schema = schema.min(opts.min);
  if (opts?.max !== undefined) schema = schema.max(opts.max);
  return schema.nullable().optional();
};

const optionalNullableNumber = (opts?: { min?: number; max?: number; positive?: boolean }) => {
  let schema = z.number().finite();
  if (opts?.positive) schema = schema.positive();
  if (opts?.min !== undefined) schema = schema.min(opts.min);
  if (opts?.max !== undefined) schema = schema.max(opts.max);
  return schema.nullable().optional();
};

const sharedFundamentalsFields = {
  periodLabel: z.string().trim().max(40).nullable().optional(),
  eps: optionalNullableInt({ min: -MAX_PER_SHARE_VALUE, max: MAX_PER_SHARE_VALUE }),
  bvps: optionalNullableInt({ min: -MAX_PER_SHARE_VALUE, max: MAX_PER_SHARE_VALUE }),
  dps: optionalNullableInt({ min: 0, max: MAX_PER_SHARE_VALUE }),
  roePct: optionalNullableNumber({ min: -100_000, max: 100_000 }),
  der: optionalNullableNumber({ min: 0, max: 100_000 }),
  epsGrowthPct: optionalNullableNumber({ min: -100_000, max: 100_000 }),
  targetPer: optionalNullableNumber({ positive: true, max: 1000 }),
  targetPbv: optionalNullableNumber({ positive: true, max: 500 }),
  dividendGrowthPct: optionalNullableNumber({ min: 0.0, max: 30.0 }),
  marketCapIdr: optionalNullableInt({ min: 0 }),
  adtvIdr: optionalNullableInt({ min: 0 }),
  roaPct: optionalNullableNumber({ min: -100_000, max: 100_000 }),
  roicPct: optionalNullableNumber({ min: -100_000, max: 100_000 }),
  operatingMarginPct: optionalNullableNumber({ min: -100_000, max: 100_000 }),
  netMarginPct: optionalNullableNumber({ min: -100_000, max: 100_000 }),
  revenueGrowthPct: optionalNullableNumber({ min: -100_000, max: 100_000 }),
  netIncomeGrowthPct: optionalNullableNumber({ min: -100_000, max: 100_000 }),
  currentRatio: optionalNullableNumber({ min: 0, max: 100_000 }),
  netDebtToEbitda: optionalNullableNumber({ min: -1000, max: 1000 }),
  equityToAssetsPct: optionalNullableNumber({ min: -100_000, max: 100 }),
  wholesaleDer: optionalNullableNumber({ min: 0, max: 100_000 }),
  cfoToNetIncome: optionalNullableNumber({ min: -1000, max: 1000 }),
  fcfMarginPct: optionalNullableNumber({ min: -100_000, max: 100_000 }),
  fcfYieldPct: optionalNullableNumber({ min: -100_000, max: 100_000 }),
  cfoPositive: z.boolean().nullable().optional(),
  fcfPositive: z.boolean().nullable().optional(),
  piotroskiFScore: optionalNullableInt({ min: 0, max: 9 }),
  altmanZScore: optionalNullableNumber({ min: -1000, max: 1000 }),
};

export const fundamentalsInputSchema = z.object({
  ...sharedFundamentalsFields,
  discountRatePct: z
    .number()
    .finite()
    .min(1.0)
    .max(50.0)
    .optional()
    .default(DEFAULT_DISCOUNT_RATE_PCT),
  projectionYears: z
    .number()
    .int()
    .min(1)
    .max(15)
    .optional()
    .default(DEFAULT_PROJECTION_YEARS),
  terminalGrowthPct: z
    .number()
    .finite()
    .min(0.0)
    .max(15.0)
    .optional()
    .default(DEFAULT_TERMINAL_GROWTH_PCT),
});

export const fundamentalsPatchSchema = z.object({
  ...sharedFundamentalsFields,
  discountRatePct: z.number().finite().min(1.0).max(50.0).optional(),
  projectionYears: z.number().int().min(1).max(15).optional(),
  terminalGrowthPct: z.number().finite().min(0.0).max(15.0).optional(),
});

export const holdingTrancheSchema = z.object({
  lots: z.number().int('Lots must be >= 1').min(1).max(MAX_OWNED_LOTS),
  buyPrice: z
    .number()
    .finite('Price must be >= 1')
    .min(MIN_IDX_PRICE, 'Price must be >= 1')
    .max(MAX_IDX_PRICE, `Must be at most ${MAX_IDX_PRICE}`)
    .transform(round2),
});

export type HoldingTrancheDto = z.infer<typeof holdingTrancheSchema>;

const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}$/, 'Must be a 4-letter IDX ticker (e.g. BBCA)');

export const createWatchlistSchema = z.object({
  ticker: tickerSchema,
  companyName: z
    .string()
    .trim()
    .min(1, 'Company name is required')
    .max(120, 'Company name must be at most 120 characters'),
  sector: z.enum(IDX_SECTORS),
  currentPrice: z
    .number()
    .int('Must be an integer >= 1')
    .min(MIN_IDX_PRICE, 'Must be an integer >= 1')
    .max(MAX_IDX_PRICE, `Must be at most ${MAX_IDX_PRICE}`),
  ownedLots: z
    .number()
    .int('Must be an integer >= 0')
    .min(0)
    .max(MAX_OWNED_LOTS)
    .optional()
    .default(0),
  avgBuyPrice: optionalNullableNumber({ min: MIN_IDX_PRICE, max: MAX_IDX_PRICE }),
  holdingTranches: z.array(holdingTrancheSchema).max(20).optional(),
  targetBuyPrice: optionalNullableInt({ min: MIN_IDX_PRICE, max: MAX_IDX_PRICE }),
  investmentThesis: z.string().trim().max(2000).nullable().optional(),
  fundamentals: fundamentalsInputSchema.optional(),
});

export const updateWatchlistSchema = z.object({
  ticker: tickerSchema.optional(),
  companyName: z.string().trim().min(1).max(120).optional(),
  sector: z.enum(IDX_SECTORS).optional(),
  currentPrice: z.number().int().min(MIN_IDX_PRICE).max(MAX_IDX_PRICE).optional(),
  ownedLots: z.number().int().min(0).max(MAX_OWNED_LOTS).optional(),
  avgBuyPrice: optionalNullableNumber({ min: MIN_IDX_PRICE, max: MAX_IDX_PRICE }),
  holdingTranches: z.array(holdingTrancheSchema).max(20).optional(),
  targetBuyPrice: optionalNullableInt({ min: MIN_IDX_PRICE, max: MAX_IDX_PRICE }),
  investmentThesis: z.string().trim().max(2000).nullable().optional(),
  fundamentals: fundamentalsPatchSchema.optional(),
});

export const VALUATION_STATUS_FILTERS = [
  'UNDERVALUED',
  'FAIRLY_VALUED',
  'OVERVALUED',
  'INSUFFICIENT_DATA',
] as const;

export type ValuationStatusFilter = (typeof VALUATION_STATUS_FILTERS)[number];

export const QUALITY_GRADE_FILTERS = ['A', 'B', 'C', 'D'] as const;
export type QualityGradeFilter = (typeof QUALITY_GRADE_FILTERS)[number];

export const QARP_QUADRANT_FILTERS = [
  'PRIME_OPPORTUNITY',
  'QUALITY_FAIR_PRICE',
  'DEEP_VALUE_TURNAROUND',
  'VALUE_TRAP_RISK',
  'OVERVALUED_OR_UNRATED',
] as const;
export type QarpQuadrantFilter = (typeof QARP_QUADRANT_FILTERS)[number];

export const CATALOG_SORT_OPTIONS = [
  'fqs_desc',
  'fqs_asc',
  'qarp_desc',
  'mos_desc',
  'mos_asc',
  'profitability_desc',
  'growth_desc',
  'health_desc',
  'cashflow_desc',
  'adtv_desc',
  'ticker_asc',
  'ticker_desc',
  'price_asc',
  'price_desc',
  'fair_value_desc',
] as const;

export type CatalogSortOption = (typeof CATALOG_SORT_OPTIONS)[number];

export const watchlistQuerySchema = z.object({
  search: z.string().trim().max(60).optional(),
  sector: z.enum(IDX_SECTORS).optional(),
  sort: z
    .enum(['mos_desc', 'fqs_desc', 'updated_desc', 'ticker_asc'])
    .optional()
    .default('updated_desc'),
});

const optionalQueryNumber = (min: number, max: number) =>
  z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === '') return undefined;
      const num = Number(val);
      return Number.isFinite(num) ? num : val;
    },
    z.number().finite().min(min).max(max).optional(),
  );

const optionalQueryBoolean = z.preprocess(
  (val) => {
    if (val === undefined || val === null || val === '') return undefined;
    if (val === true || val === 'true' || val === '1') return true;
    if (val === false || val === 'false' || val === '0') return false;
    return val;
  },
  z.boolean().optional(),
);

const optionalQueryInt = (min: number, max: number, fallback: number) =>
  z.preprocess(
    (val) => {
      if (val === undefined || val === null || val === '') return fallback;
      const num = Number(val);
      return Number.isFinite(num) ? Math.trunc(num) : val;
    },
    z.number().int().min(min).max(max),
  );

export const catalogQuerySchema = z.object({
  search: z.string().trim().max(60).optional(),
  sector: z.enum(IDX_SECTORS).optional(),
  valuationStatus: z.enum(VALUATION_STATUS_FILTERS).optional(),
  minMos: optionalQueryNumber(-1000, 1000),
  maxMos: optionalQueryNumber(-1000, 1000),
  qualityGrade: z.enum(QUALITY_GRADE_FILTERS).optional(),
  qarpQuadrant: z.enum(QARP_QUADRANT_FILTERS).optional(),
  minFqs: optionalQueryNumber(0, 100),
  maxFqs: optionalQueryNumber(0, 100),
  minProfitability: optionalQueryNumber(0, 100),
  minGrowth: optionalQueryNumber(0, 100),
  minHealth: optionalQueryNumber(0, 100),
  minCashFlow: optionalQueryNumber(0, 100),
  minAdtvBillion: optionalQueryNumber(0, 100_000),
  minPiotroski: optionalQueryNumber(0, 9),
  excludeHighRiskTrap: optionalQueryBoolean,
  sort: z.enum(CATALOG_SORT_OPTIONS).optional().default('mos_desc'),
  page: optionalQueryInt(1, 500, 1),
  pageSize: optionalQueryInt(10, 100, 10),
});

export const ensureWatchlistStockSchema = z.object({
  ticker: tickerSchema,
});

export const createCustomWatchlistSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Watchlist name is required')
    .max(60, 'Watchlist name must be at most 60 characters'),
  description: z.string().trim().max(200).nullable().optional(),
  tickers: z.array(tickerSchema).max(100).optional().default([]),
});

export const updateCustomWatchlistSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Watchlist name is required')
    .max(60, 'Watchlist name must be at most 60 characters')
    .optional(),
  description: z.string().trim().max(200).nullable().optional(),
});

export const addCustomWatchlistStockSchema = z.object({
  ticker: tickerSchema,
});

export type CreateWatchlistRequest = z.infer<typeof createWatchlistSchema>;
export type UpdateWatchlistRequest = z.infer<typeof updateWatchlistSchema>;
export type WatchlistQuery = z.infer<typeof watchlistQuerySchema>;
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export type EnsureWatchlistStockRequest = z.infer<typeof ensureWatchlistStockSchema>;
export type CreateCustomWatchlistRequest = z.infer<typeof createCustomWatchlistSchema>;
export type UpdateCustomWatchlistRequest = z.infer<typeof updateCustomWatchlistSchema>;
export type AddCustomWatchlistStockRequest = z.infer<typeof addCustomWatchlistStockSchema>;

export interface FundamentalsDto {
  periodLabel: string | null;
  eps: number | null;
  bvps: number | null;
  dps: number | null;
  roePct: number | null;
  der: number | null;
  epsGrowthPct: number | null;
  targetPer: number | null;
  targetPbv: number | null;
  discountRatePct: number;
  projectionYears: number;
  terminalGrowthPct: number;
  dividendGrowthPct: number | null;
  marketCapIdr: number | null;
  adtvIdr: number | null;
  roaPct: number | null;
  roicPct: number | null;
  operatingMarginPct: number | null;
  netMarginPct: number | null;
  revenueGrowthPct: number | null;
  netIncomeGrowthPct: number | null;
  currentRatio: number | null;
  netDebtToEbitda: number | null;
  equityToAssetsPct: number | null;
  wholesaleDer: number | null;
  cfoToNetIncome: number | null;
  fcfMarginPct: number | null;
  fcfYieldPct: number | null;
  cfoPositive: boolean | null;
  fcfPositive: boolean | null;
  piotroskiFScore: number | null;
  altmanZScore: number | null;
  updatedAt: string;
}

export interface WatchlistItemDto {
  id: string;
  ticker: string;
  companyName: string;
  sector: IdxSector;
  currentPrice: number;
  openPrice: number | null;
  dailyChange: number | null;
  dailyChangePct: number | null;
  ownedLots: number;
  avgBuyPrice: number | null;
  holdingTranches: HoldingTrancheDto[];
  targetBuyPrice: number | null;
  investmentThesis: string | null;
  createdAt: string;
  updatedAt: string;
  isStale: boolean;
  fundamentals: FundamentalsDto;
  valuation: ValuationSummary;
  quality: FundamentalQualitySummary;
}

export interface MarketStockDto {
  /** Personal watchlist_items.id when saved/owned by the user, otherwise null */
  watchlistItemId: string | null;
  ticker: string;
  companyName: string;
  sector: IdxSector;
  currentPrice: number;
  openPrice: number | null;
  dailyChange: number | null;
  dailyChangePct: number | null;
  ownedLots: number;
  avgBuyPrice: number | null;
  holdingTranches: HoldingTrancheDto[];
  targetBuyPrice: number | null;
  investmentThesis: string | null;
  updatedAt: string;
  isStale: boolean;
  fundamentals: FundamentalsDto;
  valuation: ValuationSummary;
  quality: FundamentalQualitySummary;
  /** IDs of the current user's custom watchlists containing this ticker */
  customWatchlistIds: string[];
}

export interface CatalogSummaryDto {
  totalStocks: number;
  undervalued: number;
  fairlyValued: number;
  overvalued: number;
  insufficientData: number;
  qualityScored: number;
  eliteQuality: number;
  strongQuality: number;
  primeOpportunities: number;
  lastSyncedAt: string | null;
}

export type { QualityGrade, QarpQuadrant };

export interface CatalogPaginationDto {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface CatalogResponseDto {
  items: MarketStockDto[];
  pagination: CatalogPaginationDto;
  summary: CatalogSummaryDto;
}

export interface CustomWatchlistGroupDto {
  id: string;
  name: string;
  description: string | null;
  tickers: string[];
  stockCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogSyncResponseDto {
  syncedCount: number;
  updatedUserItemsCount: number;
  syncedAt: string;
}
