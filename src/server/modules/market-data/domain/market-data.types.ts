import type { IdxMarketQuoteDto } from '@/shared/contracts';
import { round2, type IdxSector } from '@/shared/domain';

export interface IdxMarketDataProvider {
  fetchIdxQuote(ticker: string): Promise<IdxMarketQuoteDto>;
  fetchIdxQuotesBatch?(tickers: string[]): Promise<Map<string, IdxMarketQuoteDto>>;
  fetchAllIdxStocks?(): Promise<IdxMarketQuoteDto[]>;
}

/**
 * Gordon Growth Justified P/B for IDX banks: PBV = (ROE - g) / (Ke - g)
 * Using Indonesian banking Ke = 12% and sustainable g = 6% -> (ROE - 6) / 6,
 * clamped to [0.5x, 4.5x] so low-ROE banks are not inflated to 2.5x while
 * high-ROE leaders (BBCA/BBRI) reflect their true excess return on equity.
 */
export function computeBankJustifiedPbv(roePct: number | null): number {
  if (roePct === null || !Number.isFinite(roePct)) {
    return SECTOR_BENCHMARK_MULTIPLES.FINANCIALS.targetPbv;
  }
  const justified = (roePct - 6) / 6;
  return round2(Math.max(0.5, Math.min(4.5, justified)));
}

export const SECTOR_BENCHMARK_MULTIPLES: Record<
  IdxSector,
  { targetPer: number; targetPbv: number }
> = {
  FINANCIALS: { targetPer: 15, targetPbv: 2.5 },
  CONSUMER_NON_CYCLICALS: { targetPer: 18, targetPbv: 3.5 },
  CONSUMER_CYCLICALS: { targetPer: 14, targetPbv: 2.0 },
  ENERGY: { targetPer: 8, targetPbv: 1.5 },
  BASIC_MATERIALS: { targetPer: 12, targetPbv: 1.5 },
  INFRASTRUCTURE: { targetPer: 16, targetPbv: 2.2 },
  HEALTHCARE: { targetPer: 22, targetPbv: 3.5 },
  TECHNOLOGY: { targetPer: 20, targetPbv: 2.5 },
  PROPERTY_REAL_ESTATE: { targetPer: 12, targetPbv: 1.0 },
  INDUSTRIALS: { targetPer: 12, targetPbv: 1.8 },
  TRANSPORTATION_LOGISTICS: { targetPer: 12, targetPbv: 1.5 },
};

export function mapMarketSectorToIdx(rawSector?: string | null, rawIndustry?: string | null): IdxSector {
  const sector = (rawSector ?? '').toLowerCase();
  const industry = (rawIndustry ?? '').toLowerCase();

  // Check Real Estate / Property industry BEFORE Finance (TradingView groups Real Estate under Finance)
  if (
    sector.includes('property') ||
    sector.includes('real estate') ||
    industry.includes('real estate') ||
    industry.includes('property') ||
    industry.includes('reit')
  ) {
    return 'PROPERTY_REAL_ESTATE';
  }
  if (sector.includes('financ') || sector === 'finance') return 'FINANCIALS';
  if (
    sector.includes('consumer non-cyclical') ||
    sector.includes('consumer non-durable') ||
    sector.includes('consumer defensive') ||
    sector.includes('consumer staple')
  ) {
    return 'CONSUMER_NON_CYCLICALS';
  }
  if (
    sector.includes('consumer cyclical') ||
    sector.includes('consumer durable') ||
    sector.includes('consumer services') ||
    sector.includes('consumer discretionary') ||
    sector.includes('retail')
  ) {
    return 'CONSUMER_CYCLICALS';
  }
  if (sector.includes('non-energy mineral') || sector.includes('basic material') || sector.includes('process industries') || sector.includes('material')) {
    return 'BASIC_MATERIALS';
  }
  if (sector.includes('energy')) return 'ENERGY';
  if (sector.includes('health')) return 'HEALTHCARE';
  if (sector.includes('technology')) return 'TECHNOLOGY';
  if (sector.includes('property') || sector.includes('real estate')) return 'PROPERTY_REAL_ESTATE';
  if (
    sector.includes('transport') ||
    sector.includes('logistic') ||
    industry.includes('shipping') ||
    industry.includes('airline') ||
    industry.includes('logistics') ||
    industry.includes('trucking') ||
    industry.includes('marine')
  ) {
    return 'TRANSPORTATION_LOGISTICS';
  }
  if (
    sector.includes('infrastructure') ||
    sector.includes('communication') ||
    sector.includes('utilities')
  ) {
    return 'INFRASTRUCTURE';
  }
  if (sector.includes('industrial') || sector.includes('manufacturing') || sector.includes('commercial')) {
    return 'INDUSTRIALS';
  }

  return 'INDUSTRIALS';
}
