import { z } from 'zod';
import {
  DEFAULT_DISCOUNT_RATE_PCT,
  DEFAULT_PROJECTION_YEARS,
  DEFAULT_TERMINAL_GROWTH_PCT,
  IDX_SECTORS,
  MIN_IDX_PRICE,
  type IdxSector,
  type ValuationSummary,
} from '../domain';

const optionalNullableInt = (min?: number) => {
  let schema = z.number().int();
  if (min !== undefined) {
    schema = schema.min(min);
  }
  return schema.nullable().optional();
};

const optionalNullableNumber = (opts?: { min?: number; max?: number; positive?: boolean }) => {
  let schema = z.number().finite();
  if (opts?.positive) schema = schema.positive();
  if (opts?.min !== undefined) schema = schema.min(opts.min);
  if (opts?.max !== undefined) schema = schema.max(opts.max);
  return schema.nullable().optional();
};

export const fundamentalsInputSchema = z.object({
  periodLabel: z.string().trim().max(40).nullable().optional(),
  eps: optionalNullableInt(),
  bvps: optionalNullableInt(),
  dps: optionalNullableInt(0),
  roePct: optionalNullableNumber({ min: -1000, max: 1000 }),
  der: optionalNullableNumber({ min: 0, max: 1000 }),
  epsGrowthPct: optionalNullableNumber({ min: -1000, max: 1000 }),
  targetPer: optionalNullableNumber({ positive: true, max: 1000 }),
  targetPbv: optionalNullableNumber({ positive: true, max: 500 }),
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
  dividendGrowthPct: optionalNullableNumber({ min: 0.0, max: 30.0 }),
});

export const fundamentalsPatchSchema = z.object({
  periodLabel: z.string().trim().max(40).nullable().optional(),
  eps: optionalNullableInt(),
  bvps: optionalNullableInt(),
  dps: optionalNullableInt(0),
  roePct: optionalNullableNumber({ min: -1000, max: 1000 }),
  der: optionalNullableNumber({ min: 0, max: 1000 }),
  epsGrowthPct: optionalNullableNumber({ min: -1000, max: 1000 }),
  targetPer: optionalNullableNumber({ positive: true, max: 1000 }),
  targetPbv: optionalNullableNumber({ positive: true, max: 500 }),
  discountRatePct: z.number().finite().min(1.0).max(50.0).optional(),
  projectionYears: z.number().int().min(1).max(15).optional(),
  terminalGrowthPct: z.number().finite().min(0.0).max(15.0).optional(),
  dividendGrowthPct: optionalNullableNumber({ min: 0.0, max: 30.0 }),
});

export const createWatchlistSchema = z.object({
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}$/, 'Must be a 4-letter IDX ticker (e.g. BBCA)'),
  companyName: z
    .string()
    .trim()
    .min(1, 'Company name is required')
    .max(120, 'Company name must be at most 120 characters'),
  sector: z.enum(IDX_SECTORS),
  currentPrice: z
    .number()
    .int('Must be an integer >= 1')
    .min(MIN_IDX_PRICE, 'Must be an integer >= 1'),
  targetBuyPrice: optionalNullableInt(MIN_IDX_PRICE),
  investmentThesis: z.string().trim().max(2000).nullable().optional(),
  fundamentals: fundamentalsInputSchema.optional(),
});

export const updateWatchlistSchema = z.object({
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}$/, 'Must be a 4-letter IDX ticker (e.g. BBCA)')
    .optional(),
  companyName: z.string().trim().min(1).max(120).optional(),
  sector: z.enum(IDX_SECTORS).optional(),
  currentPrice: z.number().int().min(MIN_IDX_PRICE).optional(),
  targetBuyPrice: optionalNullableInt(MIN_IDX_PRICE),
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
  targetBuyPrice: number | null;
  investmentThesis: string | null;
  createdAt: string;
  updatedAt: string;
  isStale: boolean;
  fundamentals: FundamentalsDto;
  valuation: ValuationSummary;
}
