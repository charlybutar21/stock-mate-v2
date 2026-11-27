import { describe, expect, it } from 'vitest';
import type {
  CustomWatchlistGroupDto,
  MarketStockDto,
  WatchlistItemDto,
} from '@/shared/contracts';
import {
  calculateFundamentalQuality,
  calculateValuation,
  type IdxSector,
} from '@/shared/domain';
import {
  queryCatalogSnapshot,
  type CatalogSnapshotResponse,
} from '../catalogOverlay';

function makeStock(params: {
  ticker: string;
  sector: IdxSector;
  price: number;
  eps: number;
  bvps: number;
  roePct: number;
  epsGrowthPct: number;
  adtvIdr?: number;
}): MarketStockDto {
  const valuation = calculateValuation({
    sector: params.sector,
    currentPrice: params.price,
    eps: params.eps,
    bvps: params.bvps,
    roePct: params.roePct,
    der: params.sector === 'FINANCIALS' ? null : 0.4,
    epsGrowthPct: params.epsGrowthPct,
    targetPer: 15,
    targetPbv: 2.5,
  });
  const quality = calculateFundamentalQuality({
    sector: params.sector,
    currentPrice: params.price,
    eps: params.eps,
    roePct: params.roePct,
    roaPct: 2.5,
    roicPct: 16,
    operatingMarginPct: 22,
    netMarginPct: 18,
    revenueGrowthPct: 12,
    epsGrowthPct: params.epsGrowthPct,
    der: params.sector === 'FINANCIALS' ? null : 0.4,
    wholesaleDer: params.sector === 'FINANCIALS' ? 0.1 : null,
    currentRatio: 2.0,
    netDebtToEbitda: -0.2,
    equityToAssetsPct: 16,
    cfoToNetIncome: 1.1,
    fcfMarginPct: 12,
    fcfYieldPct: 6,
    cfoPositive: true,
    fcfPositive: true,
    adtvIdr: params.adtvIdr ?? 50_000_000_000,
    mosPct: valuation.mosPct,
    valueTrapRiskLevel: valuation.valueTrapShield.riskLevel,
  });

  const now = '2026-11-27T00:00:00.000Z';
  return {
    watchlistItemId: null,
    ticker: params.ticker,
    companyName: `PT ${params.ticker} Tbk`,
    sector: params.sector,
    currentPrice: params.price,
    openPrice: params.price,
    dailyChange: 0,
    dailyChangePct: 0,
    ownedLots: 0,
    avgBuyPrice: null,
    holdingTranches: [],
    targetBuyPrice: null,
    investmentThesis: null,
    updatedAt: now,
    isStale: false,
    fundamentals: {
      periodLabel: 'TTM (TradingView)',
      eps: params.eps,
      bvps: params.bvps,
      dps: 100,
      roePct: params.roePct,
      der: params.sector === 'FINANCIALS' ? null : 0.4,
      epsGrowthPct: params.epsGrowthPct,
      targetPer: 15,
      targetPbv: 2.5,
      discountRatePct: 12,
      projectionYears: 5,
      terminalGrowthPct: 4,
      dividendGrowthPct: null,
      marketCapIdr: 100_000_000_000_000,
      adtvIdr: params.adtvIdr ?? 50_000_000_000,
      roaPct: 2.5,
      roicPct: 16,
      operatingMarginPct: 22,
      netMarginPct: 18,
      revenueGrowthPct: 12,
      netIncomeGrowthPct: params.epsGrowthPct,
      currentRatio: 2.0,
      netDebtToEbitda: -0.2,
      equityToAssetsPct: 16,
      wholesaleDer: params.sector === 'FINANCIALS' ? 0.1 : null,
      cfoToNetIncome: 1.1,
      fcfMarginPct: 12,
      fcfYieldPct: 6,
      cfoPositive: true,
      fcfPositive: true,
      piotroskiFScore: 8,
      altmanZScore: 4.5,
      updatedAt: now,
    },
    valuation,
    quality,
    customWatchlistIds: [],
  };
}

describe('catalogOverlay client Edge snapshot overlay', () => {
  it('overlays user holdings & custom groups, ranks qarp_desc with Value Trap penalty, and paginates', () => {
    const bbca = makeStock({
      ticker: 'BBCA',
      sector: 'FINANCIALS',
      price: 5000,
      eps: 480,
      bvps: 2300,
      roePct: 21,
      epsGrowthPct: 10,
    });
    const trap = makeStock({
      ticker: 'TRAP',
      sector: 'INDUSTRIALS',
      price: 500,
      eps: 100,
      bvps: 1000,
      roePct: 12,
      epsGrowthPct: -20, // Triggers SHRINKING_EARNINGS_TRAP -> HIGH_RISK
    });

    const snapshot: CatalogSnapshotResponse = {
      version: 1,
      syncedAt: '2026-11-27T00:00:00.000Z',
      summary: {
        totalStocks: 2,
        undervalued: 1,
        fairlyValued: 1,
        overvalued: 0,
        insufficientData: 0,
        qualityScored: 2,
        eliteQuality: 1,
        strongQuality: 0,
        primeOpportunities: 1,
        lastSyncedAt: '2026-11-27T00:00:00.000Z',
      },
      items: [trap, bbca],
    };

    const personalItem: WatchlistItemDto = {
      ...bbca,
      id: 'item_bbca',
      createdAt: '2026-11-27T00:00:00.000Z',
      ownedLots: 10,
      avgBuyPrice: 4800,
    };

    const groups: CustomWatchlistGroupDto[] = [
      {
        id: 'grp_1',
        name: 'Core Banks',
        description: null,
        tickers: ['BBCA'],
        stockCount: 1,
        createdAt: '2026-11-27T00:00:00.000Z',
        updatedAt: '2026-11-27T00:00:00.000Z',
      },
    ];

    const res = queryCatalogSnapshot(snapshot, [personalItem], groups, {
      sort: 'qarp_desc',
      page: 1,
      pageSize: 10,
    });

    expect(res.items.map((i) => i.ticker)).toEqual(['BBCA', 'TRAP']);
    expect(res.items[0]?.watchlistItemId).toBe('item_bbca');
    expect(res.items[0]?.ownedLots).toBe(10);
    expect(res.items[0]?.customWatchlistIds).toEqual(['grp_1']);
    expect(res.pagination.totalItems).toBe(2);

    const safeOnly = queryCatalogSnapshot(snapshot, [personalItem], groups, {
      excludeHighRiskTrap: true,
    });
    expect(safeOnly.items.map((i) => i.ticker)).toEqual(['BBCA']);
  });
});
