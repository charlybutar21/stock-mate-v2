import type { IdxMarketQuoteDto } from '@/shared/contracts';
import type { IdxSector } from '@/shared/domain';

export interface IdxMarketDataProvider {
  fetchIdxQuote(ticker: string): Promise<IdxMarketQuoteDto>;
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

  if (sector.includes('financial')) return 'FINANCIALS';
  if (sector.includes('consumer defensive') || sector.includes('consumer staple')) {
    return 'CONSUMER_NON_CYCLICALS';
  }
  if (sector.includes('consumer cyclical') || sector.includes('consumer discretionary')) {
    return 'CONSUMER_CYCLICALS';
  }
  if (sector.includes('energy')) return 'ENERGY';
  if (sector.includes('basic material') || sector.includes('material')) return 'BASIC_MATERIALS';
  if (sector.includes('healthcare') || sector.includes('health care')) return 'HEALTHCARE';
  if (sector.includes('technology')) return 'TECHNOLOGY';
  if (sector.includes('real estate')) return 'PROPERTY_REAL_ESTATE';
  if (
    industry.includes('shipping') ||
    industry.includes('airline') ||
    industry.includes('logistics') ||
    industry.includes('trucking') ||
    industry.includes('marine')
  ) {
    return 'TRANSPORTATION_LOGISTICS';
  }
  if (sector.includes('communication') || sector.includes('utilities')) {
    return 'INFRASTRUCTURE';
  }
  if (sector.includes('industrial')) return 'INDUSTRIALS';

  return 'INDUSTRIALS';
}
