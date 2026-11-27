import { describe, expect, it } from 'vitest';
import {
  calculateFundamentalQuality,
  computeQarpRankScore,
  interpolateAscending,
  interpolateDescending,
} from '../quality-score';

describe('quality-score interpolation helpers', () => {
  it('handles null, undefined, NaN, out-of-bounds, and mid-segment values', () => {
    const pts = [
      [0, 0],
      [10, 50],
      [20, 100],
    ] as const;

    expect(interpolateAscending(null, pts)).toBeNull();
    expect(interpolateAscending(undefined, pts)).toBeNull();
    expect(interpolateAscending(Number.NaN, pts)).toBeNull();
    expect(interpolateAscending(-5, pts)).toBe(0);
    expect(interpolateAscending(0, pts)).toBe(0);
    expect(interpolateAscending(5, pts)).toBe(25);
    expect(interpolateAscending(15, pts)).toBe(75);
    expect(interpolateAscending(25, pts)).toBe(100);

    const invPts = [
      [0.3, 100],
      [1.3, 50],
      [2.3, 0],
    ] as const;
    expect(interpolateDescending(0.1, invPts)).toBe(100);
    expect(interpolateDescending(0.8, invPts)).toBe(75);
    expect(interpolateDescending(3.0, invPts)).toBe(0);
  });
});

describe('calculateFundamentalQuality', () => {
  it('scores an elite Non-Financial compounder (ICBP-like) as Grade A Prime Opportunity', () => {
    const res = calculateFundamentalQuality({
      sector: 'CONSUMER_NON_CYCLICALS',
      currentPrice: 7050,
      eps: 710,
      dps: 265,
      roePct: 18,
      roicPct: 14,
      operatingMarginPct: 20,
      netMarginPct: 14,
      revenueGrowthPct: 14,
      epsGrowthPct: 24,
      der: 0.45,
      currentRatio: 2.2,
      netDebtToEbitda: 0.4,
      cfoToNetIncome: 1.25,
      fcfMarginPct: 14,
      fcfYieldPct: 9,
      mosPct: 35,
      valueTrapRiskLevel: 'CLEAR',
    });

    expect(res.track).toBe('NON_FINANCIALS');
    expect(res.availablePillars).toBe(4);
    expect(res.grade).toBe('A');
    expect(res.score).toBeGreaterThanOrEqual(80);
    expect(res.appliedCaps).toEqual([]);
    expect(res.qarpQuadrant).toBe('PRIME_OPPORTUNITY');
    expect(res.pillars.profitability.weightPct).toBe(30);
    expect(res.pillars.cashFlow.weightPct).toBe(20);
  });

  it('scores an elite Banking stock (BBCA-like) using FINANCIALS dual-track without punishing deposit liabilities', () => {
    const res = calculateFundamentalQuality({
      sector: 'FINANCIALS',
      currentPrice: 5900,
      eps: 483,
      dps: 336,
      roePct: 21.2,
      roaPct: 3.73,
      netMarginPct: 51.4,
      revenueGrowthPct: 8,
      epsGrowthPct: 11,
      der: null,
      wholesaleDer: 0.02,
      currentRatio: 0.15, // ignored for financials
      equityToAssetsPct: 17.3,
      cfoPositive: true,
      fcfPositive: true,
      mosPct: 12,
      valueTrapRiskLevel: 'CLEAR',
    });

    expect(res.track).toBe('FINANCIALS');
    expect(res.grade).toBe('A');
    expect(res.score).toBeGreaterThanOrEqual(85);
    expect(res.pillars.financialHealth.score).toBe(100);
    expect(res.pillars.profitability.score).toBe(100);
    expect(res.pillars.cashFlow.score).toBe(100);
    expect(res.qarpQuadrant).toBe('QUALITY_FAIR_PRICE');
  });

  it('handles negative CFO/FCF for Financials gracefully without zeroing out cash flow pillar', () => {
    const res = calculateFundamentalQuality({
      sector: 'FINANCIALS',
      currentPrice: 3000,
      eps: 200,
      dps: 0,
      roePct: 14,
      roaPct: 1.6,
      netMarginPct: 20,
      revenueGrowthPct: 10,
      epsGrowthPct: 6, // rev > 0 and eps > 0, but eps < rev => opLev = 65
      wholesaleDer: 1.2,
      equityToAssetsPct: 11,
      cfoPositive: false,
      fcfPositive: false,
      mosPct: 25,
      valueTrapRiskLevel: 'HIGH_RISK',
    });

    expect(res.pillars.cashFlow.score).toBe(18); // (25*40 + 25*30 + 0*30)/100 = 17.5 -> 18
    expect(res.qarpQuadrant).toBe('DEEP_VALUE_TURNAROUND');
  });

  it('applies Weak-Link Cap when profitability is weak or company is loss-making (GOTO-like)', () => {
    const res = calculateFundamentalQuality({
      sector: 'TECHNOLOGY',
      currentPrice: 80,
      eps: -5,
      roePct: 1,
      roicPct: 0.5,
      operatingMarginPct: -2,
      netMarginPct: -3,
      revenueGrowthPct: 24,
      netIncomeGrowthPct: 30, // tests fallback from epsGrowthPct to netIncomeGrowthPct
      der: 0.1,
      currentRatio: 3.0,
      netDebtToEbitda: -2.0,
      cfoPositive: true,
      fcfMarginPct: 12,
      fcfYieldPct: 6,
      mosPct: 40,
      valueTrapRiskLevel: 'HIGH_RISK',
    });

    expect(res.rawCompositeScore).toBeGreaterThan(50);
    expect(res.score).toBe(50);
    expect(res.grade).toBe('C');
    expect(res.appliedCaps).toContain('LOSS_MAKING_OR_WEAK_PROFITABILITY');
  });

  it('applies loss-making CFO negative rule, weak financial health cap, and weak cash flow cap', () => {
    // Weak financial health cap (score > 55 capped to 55)
    const highDebt = calculateFundamentalQuality({
      sector: 'INFRASTRUCTURE',
      currentPrice: 1000,
      eps: 100,
      roePct: 22,
      roicPct: 18,
      operatingMarginPct: 25,
      netMarginPct: 20,
      revenueGrowthPct: 20,
      epsGrowthPct: 25,
      der: 3.5,
      currentRatio: 0.6,
      netDebtToEbitda: 5.5,
      cfoToNetIncome: 1.2,
      fcfMarginPct: 16,
      fcfYieldPct: 9,
      mosPct: -10,
      valueTrapRiskLevel: 'HIGH_RISK',
    });
    expect(highDebt.pillars.financialHealth.score).toBe(0);
    expect(highDebt.score).toBe(55);
    expect(highDebt.appliedCaps).toEqual(['WEAK_FINANCIAL_HEALTH']);
    expect(highDebt.qarpQuadrant).toBe('OVERVALUED_OR_UNRATED');

    // Weak cash flow quality cap (score > 60 capped to 60)
    const weakCf = calculateFundamentalQuality({
      sector: 'INDUSTRIALS',
      currentPrice: 1000,
      eps: 100,
      roePct: 22,
      roicPct: 18,
      operatingMarginPct: 25,
      netMarginPct: 20,
      revenueGrowthPct: 20,
      epsGrowthPct: 25,
      der: 0.2,
      currentRatio: 2.5,
      netDebtToEbitda: -1,
      cfoToNetIncome: -0.5,
      fcfMarginPct: -5,
      fcfYieldPct: -3,
      mosPct: 30,
      valueTrapRiskLevel: 'CLEAR',
    });
    expect(weakCf.pillars.cashFlow.score).toBe(0);
    expect(weakCf.score).toBe(60);
    expect(weakCf.appliedCaps).toEqual(['WEAK_CASH_FLOW_QUALITY']);
    expect(weakCf.grade).toBe('C');

    // Loss-making with negative CFO and weak score (< 50, so caps do not fire needlessly)
    const deepLoss = calculateFundamentalQuality({
      sector: 'ENERGY',
      currentPrice: 50,
      eps: -20,
      roePct: -15,
      roicPct: -10,
      operatingMarginPct: -10,
      netMarginPct: -15,
      revenueGrowthPct: -20,
      epsGrowthPct: -40,
      der: 3.5,
      currentRatio: 0.5,
      netDebtToEbitda: 6,
      cfoPositive: false,
      fcfMarginPct: -10,
      fcfYieldPct: -8,
      mosPct: 35,
      valueTrapRiskLevel: 'HIGH_RISK',
    });
    expect(deepLoss.score).toBe(0);
    expect(deepLoss.grade).toBe('D');
    expect(deepLoss.appliedCaps).toEqual([]);
    expect(deepLoss.qarpQuadrant).toBe('VALUE_TRAP_RISK');
  });

  it('uses conservative fallback for missing pillars and returns INSUFFICIENT_DATA when < 2 pillars exist', () => {
    // Only 2 pillars available (profitability + health; growth & cashFlow null)
    const partial = calculateFundamentalQuality({
      sector: 'BASIC_MATERIALS',
      currentPrice: 1200,
      roePct: 22,
      roicPct: 18,
      operatingMarginPct: 25,
      netMarginPct: 20,
      der: 0.2,
      currentRatio: 2.5,
      netDebtToEbitda: -0.5,
      mosPct: null,
    });
    expect(partial.availablePillars).toBe(2);
    // 100*0.30 + 40*0.25 + 100*0.25 + 40*0.20 = 30 + 10 + 25 + 8 = 73
    expect(partial.score).toBe(73);
    expect(partial.grade).toBe('B');
    expect(partial.qarpQuadrant).toBe('OVERVALUED_OR_UNRATED');

    // Only 1 pillar (health + growth partial test where only revGrowth > 0, epsGrowth <= 0)
    const revOnly = calculateFundamentalQuality({
      sector: 'CONSUMER_CYCLICALS',
      currentPrice: 500,
      revenueGrowthPct: 5,
      epsGrowthPct: -5,
    });
    expect(revOnly.availablePillars).toBe(1);
    expect(revOnly.score).toBeNull();
    expect(revOnly.grade).toBe('INSUFFICIENT_DATA');
    expect(revOnly.qarpQuadrant).toBe('OVERVALUED_OR_UNRATED');

    // Growth + CashFlow only (profitability & financialHealth null)
    const twoOtherPillars = calculateFundamentalQuality({
      sector: 'FINANCIALS',
      currentPrice: 500,
      dps: 25,
      revenueGrowthPct: 10,
      epsGrowthPct: 15,
      cfoPositive: true,
      fcfPositive: null,
    });
    expect(twoOtherPillars.availablePillars).toBe(2);
    expect(twoOtherPillars.score).not.toBeNull();
  });
});

describe('computeQarpRankScore', () => {
  it('ranks stocks combining FQS, MoS, and Value Trap risk penalty', () => {
    expect(
      computeQarpRankScore({ fqs: null, mosPct: 40, valueTrapRiskLevel: 'CLEAR' }),
    ).toBe(Number.NEGATIVE_INFINITY);

    const prime = computeQarpRankScore({
      fqs: 85,
      mosPct: 35,
      valueTrapRiskLevel: 'CLEAR',
    });
    const watch = computeQarpRankScore({
      fqs: 85,
      mosPct: 35,
      valueTrapRiskLevel: 'WATCH',
    });
    const highRisk = computeQarpRankScore({
      fqs: 85,
      mosPct: 35,
      valueTrapRiskLevel: 'HIGH_RISK',
    });
    const noMos = computeQarpRankScore({
      fqs: 85,
      mosPct: null,
      valueTrapRiskLevel: 'CLEAR',
    });

    expect(prime).toBeGreaterThan(watch);
    expect(watch).toBeGreaterThan(highRisk);
    expect(prime).toBeGreaterThan(noMos);
  });
});
