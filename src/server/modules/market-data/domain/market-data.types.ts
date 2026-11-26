import type { IdxMarketQuoteDto } from '@/shared/contracts';
import type { IdxSector } from '@/shared/domain';

export interface IdxMarketDataProvider {
  fetchIdxQuote(ticker: string): Promise<IdxMarketQuoteDto>;
  fetchIdxQuotesBatch?(tickers: string[]): Promise<Map<string, IdxMarketQuoteDto>>;
  fetchAllIdxStocks?(): Promise<IdxMarketQuoteDto[]>;
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

export function mapYahooSectorToIdx(rawSector?: string | null, rawIndustry?: string | null): IdxSector {
  const sector = (rawSector ?? '').toLowerCase();
  const industry = (rawIndustry ?? '').toLowerCase();

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
