import { describe, expect, it } from 'vitest';
import {
  calculateFundamentalQuality,
  computeQarpRankScore,
  evaluateGrade,
  interpolateAscending,
  interpolateDescending,
  resolveQualityTrack,
} from '../quality-score';

describe('quality-score helpers', () => {
  it('handles null, undefined, NaN, out-of-bounds, and mid-segment interpolation', () => {
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

  it('maps 6-tier strict institutional grades (S, A, B, C, D, E) and 4 accounting tracks', () => {
    expect(evaluateGrade(null)).toBe('INSUFFICIENT_DATA');
    expect(evaluateGrade(92)).toBe('S');
    expect(evaluateGrade(88)).toBe('S');
    expect(evaluateGrade(87)).toBe('A');
    expect(evaluateGrade(76)).toBe('A');
    expect(evaluateGrade(75)).toBe('B');
    expect(evaluateGrade(64)).toBe('B');
    expect(evaluateGrade(63)).toBe('C');
    expect(evaluateGrade(50)).toBe('C');
    expect(evaluateGrade(49)).toBe('D');
    expect(evaluateGrade(35)).toBe('D');
    expect(evaluateGrade(34)).toBe('E');
    expect(evaluateGrade(0)).toBe('E');

    expect(resolveQualityTrack('FINANCIALS')).toBe('FINANCIALS');
    expect(resolveQualityTrack('ENERGY')).toBe('CYCLICALS');
    expect(resolveQualityTrack('BASIC_MATERIALS')).toBe('CYCLICALS');
    expect(resolveQualityTrack('PROPERTY_REAL_ESTATE')).toBe('PROPERTY_INFRA');
    expect(resolveQualityTrack('INFRASTRUCTURE')).toBe('PROPERTY_INFRA');
    expect(resolveQualityTrack('CONSUMER_NON_CYCLICALS')).toBe('NON_FINANCIALS');
  });
});

describe('calculateFundamentalQuality (FQS v2 — 4-Track & S-E Grading)', () => {
  it('scores an elite Non-Financial compounder as Grade S Prime Opportunity', () => {
    const res = calculateFundamentalQuality({
      sector: 'CONSUMER_NON_CYCLICALS',
      currentPrice: 7050,
      eps: 710,
      dps: 265,
      roePct: 24,
      roicPct: 19,
      operatingMarginPct: 25,
      netMarginPct: 20,
      revenueGrowthPct: 20,
      epsGrowthPct: 28,
      der: 0.2,
      currentRatio: 2.3,
      netDebtToEbitda: -0.5,
      cfoToNetIncome: 1.25,
      fcfMarginPct: 15,
      fcfYieldPct: 9,
      altmanZScore: 5.5,
      mosPct: 35,
      valueTrapRiskLevel: 'CLEAR',
    });

    expect(res.track).toBe('NON_FINANCIALS');
    expect(res.availablePillars).toBe(4);
    expect(res.grade).toBe('S');
    expect(res.score).toBeGreaterThanOrEqual(88);
    expect(res.appliedCaps).toEqual([]);
    expect(res.qarpQuadrant).toBe('PRIME_OPPORTUNITY');
    expect(res.pillars.profitability.weightPct).toBe(30);
    expect(res.pillars.cashFlow.weightPct).toBe(20);
  });

  it('scores an elite Banking stock (BBCA-like) cleanly without ROA double-counting', () => {
    const res = calculateFundamentalQuality({
      sector: 'FINANCIALS',
      currentPrice: 5900,
      eps: 483,
      dps: 336,
      roePct: 22.5,
      roaPct: 3.73,
      netMarginPct: 51.4,
      revenueGrowthPct: 12,
      epsGrowthPct: 18,
      der: null,
      wholesaleDer: 0.02,
      currentRatio: 0.15,
      equityToAssetsPct: 18.2,
      cfoToNetIncome: 1.15,
      cfoPositive: true,
      fcfPositive: true,
      mosPct: 12,
      valueTrapRiskLevel: 'CLEAR',
    });

    expect(res.track).toBe('FINANCIALS');
    expect(res.grade).toBe('S');
    expect(res.pillars.financialHealth.totalMetrics).toBe(2); // Equity/Assets + Wholesale DER (no ROA duplicate)
    expect(res.pillars.financialHealth.score).toBe(100);
    expect(res.pillars.profitability.score).toBe(100);
    expect(res.qarpQuadrant).toBe('QUALITY_FAIR_PRICE');
  });

  it('scores Property/Infra and Cyclicals tracks with tailored weights and leverage scales', () => {
    const prop = calculateFundamentalQuality({
      sector: 'PROPERTY_REAL_ESTATE',
      currentPrice: 1200,
      eps: 120,
      roePct: 15,
      roicPct: 12,
      operatingMarginPct: 22,
      netMarginPct: 16,
      revenueGrowthPct: 12,
      epsGrowthPct: 15,
      der: 0.9,
      netDebtToEbitda: 1.5,
      currentRatio: 1.9,
      cfoToNetIncome: 1.0,
      fcfMarginPct: 10,
      fcfYieldPct: 5,
      altmanZScore: 3.2,
      mosPct: 25,
      valueTrapRiskLevel: 'CLEAR',
    });
    expect(prop.track).toBe('PROPERTY_INFRA');
    expect(prop.pillars.financialHealth.weightPct).toBe(30);
    expect(prop.grade).toBe('A');

    const cyclical = calculateFundamentalQuality({
      sector: 'ENERGY',
      currentPrice: 2000,
      eps: 300,
      roePct: 22,
      roicPct: 18,
      operatingMarginPct: 24,
      netMarginPct: 18,
      revenueGrowthPct: 30,
      epsGrowthPct: 40,
      der: 0.3,
      netDebtToEbitda: 0.2,
      currentRatio: 2.0,
      cfoToNetIncome: 1.1,
      fcfMarginPct: 14,
      fcfYieldPct: 8,
      altmanZScore: 4.0,
      mosPct: 30,
      valueTrapRiskLevel: 'WATCH',
    });
    expect(cyclical.track).toBe('CYCLICALS');
    expect(cyclical.pillars.growth.weightPct).toBe(15);
    expect(cyclical.pillars.financialHealth.weightPct).toBe(35);
    expect(cyclical.grade).toBe('S');
  });

  it('handles Financials cash-flow fallback without free 100 and caps low-ROE banks (<10%)', () => {
    const lowRoeBank = calculateFundamentalQuality({
      sector: 'FINANCIALS',
      currentPrice: 3000,
      eps: 200,
      dps: 180,
      roePct: 8.5,
      roaPct: 1.8,
      netMarginPct: 28,
      revenueGrowthPct: 18,
      epsGrowthPct: 22,
      wholesaleDer: 0.2,
      equityToAssetsPct: 17,
      cfoPositive: true,
      fcfPositive: true,
      mosPct: 25,
      valueTrapRiskLevel: 'CLEAR',
    });
    expect(lowRoeBank.score).toBeLessThanOrEqual(74);
    expect(lowRoeBank.grade).toBe('B');
    expect(lowRoeBank.appliedCaps).toContain('LOW_ROE_OR_REVENUE_CONTRACTION');

    const negCfBank = calculateFundamentalQuality({
      sector: 'FINANCIALS',
      currentPrice: 3000,
      eps: 200,
      dps: 0,
      roePct: 14,
      roaPct: 1.6,
      netMarginPct: 20,
      revenueGrowthPct: 10,
      epsGrowthPct: 6, // rev > 0 and eps > 0, eps < rev => opLev = 65
      wholesaleDer: 1.2,
      equityToAssetsPct: 11,
      cfoPositive: false,
      fcfPositive: false,
      mosPct: 25,
      valueTrapRiskLevel: 'HIGH_RISK',
    });
    expect(negCfBank.pillars.cashFlow.score).toBe(10); // (15*40 + 20*20 + 0*40)/100 = 10
    expect(negCfBank.qarpQuadrant).toBe('VALUE_TRAP_RISK');

    // Deep discount + mediocre quality (50-75) + CLEAR/WATCH risk maps to DEEP_VALUE_TURNAROUND
    const turnaround = calculateFundamentalQuality({
      sector: 'INDUSTRIALS',
      currentPrice: 1000,
      eps: 100,
      roePct: 12,
      roicPct: 9,
      operatingMarginPct: 12,
      netMarginPct: 8,
      revenueGrowthPct: 6,
      epsGrowthPct: 8,
      der: 0.7,
      currentRatio: 1.5,
      netDebtToEbitda: 1.5,
      cfoToNetIncome: 0.9,
      fcfMarginPct: 5,
      fcfYieldPct: 4,
      altmanZScore: 2.8,
      mosPct: 30,
      valueTrapRiskLevel: 'CLEAR',
    });
    expect(turnaround.score).toBeGreaterThanOrEqual(50);
    expect(turnaround.score).toBeLessThan(76);
    expect(turnaround.qarpQuadrant).toBe('DEEP_VALUE_TURNAROUND');
  });

  it('enforces all 7 institutional Weak-Link caps (loss-making, Altman Z distress, weak health, weak CF, HIGH_RISK trap, incomplete pillars, revenue contraction)', () => {
    // 1. Loss-making -> cap 45 (Grade D)
    const lossMaking = calculateFundamentalQuality({
      sector: 'TECHNOLOGY',
      currentPrice: 80,
      eps: -5,
      roePct: 1,
      roicPct: 0.5,
      operatingMarginPct: -2,
      netMarginPct: -3,
      revenueGrowthPct: 24,
      netIncomeGrowthPct: 30,
      der: 0.1,
      currentRatio: 3.0,
      netDebtToEbitda: -2.0,
      cfoPositive: true,
      fcfMarginPct: 12,
      fcfYieldPct: 6,
      mosPct: 40,
      valueTrapRiskLevel: 'CLEAR',
    });
    expect(lossMaking.score).toBe(45);
    expect(lossMaking.grade).toBe('D');
    expect(lossMaking.appliedCaps).toContain('LOSS_MAKING_OR_WEAK_PROFITABILITY');

    // 2. Weak financial health -> cap 50 (Grade C)
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
      der: 4.5,
      currentRatio: 0.6,
      netDebtToEbitda: 7.5,
      cfoToNetIncome: 1.2,
      fcfMarginPct: 16,
      fcfYieldPct: 9,
      altmanZScore: 2.5,
      mosPct: -10,
      valueTrapRiskLevel: 'CLEAR',
    });
    expect(highDebt.score).toBe(50);
    expect(highDebt.appliedCaps).toEqual(['WEAK_FINANCIAL_HEALTH']);
    expect(highDebt.qarpQuadrant).toBe('OVERVALUED_OR_UNRATED');

    // 3. Altman Z distress (< 1.8) -> cap 55 (Grade C)
    const distress = calculateFundamentalQuality({
      sector: 'ENERGY',
      currentPrice: 1000,
      eps: 150,
      roePct: 22,
      roicPct: 18,
      operatingMarginPct: 24,
      netMarginPct: 18,
      revenueGrowthPct: 20,
      epsGrowthPct: 25,
      der: 0.6,
      currentRatio: 1.8,
      netDebtToEbitda: 1.0,
      cfoToNetIncome: 1.2,
      fcfMarginPct: 15,
      fcfYieldPct: 8,
      altmanZScore: 1.1,
      mosPct: 30,
      valueTrapRiskLevel: 'CLEAR',
    });
    expect(distress.score).toBe(55);
    expect(distress.grade).toBe('C');
    expect(distress.appliedCaps).toEqual(['FINANCIAL_DISTRESS_ALTMAN_Z']);

    // 4. Weak cash flow -> cap 58 (Grade C)
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
      altmanZScore: 4.0,
      mosPct: 30,
      valueTrapRiskLevel: 'CLEAR',
    });
    expect(weakCf.score).toBe(58);
    expect(weakCf.appliedCaps).toEqual(['WEAK_CASH_FLOW_QUALITY']);
    expect(weakCf.grade).toBe('C');

    // 5. HIGH_RISK Value Trap -> cap 68 (Grade B)
    const trapStock = calculateFundamentalQuality({
      sector: 'CONSUMER_CYCLICALS',
      currentPrice: 1000,
      eps: 150,
      roePct: 22,
      roicPct: 18,
      operatingMarginPct: 25,
      netMarginPct: 20,
      revenueGrowthPct: 15,
      epsGrowthPct: 20,
      der: 0.2,
      currentRatio: 2.5,
      netDebtToEbitda: -0.5,
      cfoToNetIncome: 1.2,
      fcfMarginPct: 15,
      fcfYieldPct: 8,
      altmanZScore: 4.0,
      mosPct: 35,
      valueTrapRiskLevel: 'HIGH_RISK',
    });
    expect(trapStock.score).toBe(68);
    expect(trapStock.grade).toBe('B');
    expect(trapStock.appliedCaps).toEqual(['HIGH_RISK_VALUE_TRAP']);

    // 6. Revenue contraction < -5% -> cap 74 (Grade B)
    const shrinkingRev = calculateFundamentalQuality({
      sector: 'INDUSTRIALS',
      currentPrice: 1000,
      eps: 150,
      roePct: 24,
      roicPct: 20,
      operatingMarginPct: 26,
      netMarginPct: 22,
      revenueGrowthPct: -12,
      epsGrowthPct: 5,
      der: 0.1,
      currentRatio: 2.5,
      netDebtToEbitda: -1,
      cfoToNetIncome: 1.3,
      fcfMarginPct: 16,
      fcfYieldPct: 9,
      altmanZScore: 4.5,
      mosPct: 30,
      valueTrapRiskLevel: 'CLEAR',
    });
    expect(shrinkingRev.score).toBe(74);
    expect(shrinkingRev.grade).toBe('B');
    expect(shrinkingRev.appliedCaps).toContain('LOW_ROE_OR_REVENUE_CONTRACTION');

    // 7. Deep loss -> Grade E (0), no needless cap fired
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
    expect(deepLoss.grade).toBe('E');
    expect(deepLoss.appliedCaps).toEqual([]);
    expect(deepLoss.qarpQuadrant).toBe('VALUE_TRAP_RISK');
  });

  it('caps incomplete pillar coverage (< 4 pillars) at 74 and returns INSUFFICIENT_DATA when < 2 pillars', () => {
    const partial3 = calculateFundamentalQuality({
      sector: 'CONSUMER_NON_CYCLICALS',
      currentPrice: 1200,
      roePct: 24,
      roicPct: 20,
      operatingMarginPct: 26,
      netMarginPct: 22,
      der: 0.1,
      currentRatio: 2.5,
      netDebtToEbitda: -0.5,
      cfoToNetIncome: 1.3,
      fcfMarginPct: 16,
      fcfYieldPct: 9,
      mosPct: null,
    });
    expect(partial3.availablePillars).toBe(3);
    expect(partial3.score).toBe(74);
    expect(partial3.grade).toBe('B');
    expect(partial3.appliedCaps).toContain('INCOMPLETE_PILLAR_COVERAGE');
    expect(partial3.qarpQuadrant).toBe('OVERVALUED_OR_UNRATED');

    const revOnly = calculateFundamentalQuality({
      sector: 'CONSUMER_CYCLICALS',
      currentPrice: 500,
      revenueGrowthPct: 5,
      epsGrowthPct: -5,
    });
    expect(revOnly.availablePillars).toBe(1);
    expect(revOnly.score).toBeNull();
    expect(revOnly.grade).toBe('INSUFFICIENT_DATA');

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
