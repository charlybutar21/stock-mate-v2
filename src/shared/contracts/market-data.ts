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
  };
  source: 'tradingview' | 'sectors_app' | 'yahoo_finance';
  fetchedAt: string;
}
