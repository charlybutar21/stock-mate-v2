import type { IdxSector } from '../domain';

export interface IdxMarketQuoteDto {
  ticker: string;
  companyName: string;
  sector: IdxSector;
  currentPrice: number;
  periodLabel: string;
  fundamentals: {
    eps: number | null;
    bvps: number | null;
    dps: number | null;
    roePct: number | null;
    der: number | null;
    epsGrowthPct: number | null;
    targetPer: number;
    targetPbv: number;
  };
  source: 'tradingview' | 'sectors_app' | 'yahoo_finance';
  fetchedAt: string;
}
