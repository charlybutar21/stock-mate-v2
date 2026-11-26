import { z } from 'zod';
import {
  DEFAULT_DISCOUNT_RATE_PCT,
  DEFAULT_PROJECTION_YEARS,
  DEFAULT_TERMINAL_GROWTH_PCT,
  IDX_SECTORS,
  MIN_IDX_PRICE,
  round2,
  type IdxSector,
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

export const watchlistQuerySchema = z.object({
  search: z.string().trim().max(60).optional(),
  sector: z.enum(IDX_SECTORS).optional(),
  sort: z.enum(['mos_desc', 'updated_desc', 'ticker_asc']).optional().default('updated_desc'),
});

export type CreateWatchlistRequest = z.infer<typeof createWatchlistSchema>;
export type UpdateWatchlistRequest = z.infer<typeof updateWatchlistSchema>;
export type WatchlistQuery = z.infer<typeof watchlistQuerySchema>;

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
  updatedAt: string;
}

export interface WatchlistItemDto {
  id: string;
  ticker: string;
  companyName: string;
  sector: IdxSector;
  currentPrice: number;
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
}
