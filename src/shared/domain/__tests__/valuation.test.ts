import { describe, expect, it } from 'vitest';
import { calculateValuation } from '../valuation';

describe('Core-3 2026 valuation engine', () => {
  it('computes Core-3 methods (Relative P/E, Relative P/B, Simple DCF) accurately', () => {
    const result = calculateValuation({
      sector: 'CONSUMER_NON_CYCLICALS',
      currentPrice: 9000,
      eps: 450,
      bvps: 2000,
      dps: 250,
      roePct: 22.5,
      der: 0.6,
      epsGrowthPct: 12.0,
      targetPer: 22.0,
      targetPbv: 4.8,
      discountRatePct: 12.0,
      projectionYears: 5,
      terminalGrowthPct: 4.0,
    });

    expect(result.ratios).toEqual({
      currentPer: 20,
      currentPbv: 4.5,
      dividendYieldPct: 2.78,
      pegRatio: 1.67,
    });

    const byMethod = Object.fromEntries(result.methods.map((m) => [m.method, m]));
    expect(result.methods).toHaveLength(3);
    expect(byMethod.relativePer).toEqual({ method: 'relativePer', fairValue: 9900, status: 'VALID' });
    expect(byMethod.relativePbv).toEqual({ method: 'relativePbv', fairValue: 9600, status: 'VALID' });
    // Reinvestment-adjusted DCF: b_explicit = 12/22.5 (payout 7/15), b_terminal = 4/22.5 (payout 37/45) -> 1050 + 4810 = 5860
    expect(byMethod.simpleDcf).toEqual({ method: 'simpleDcf', fairValue: 5860, status: 'VALID' });

    // Sorted valid: [5860, 9600, 9900] -> median = 9600, mos = (9600 - 9000) / 9600 * 100 = 6.25%
    expect(result.fairValue).toEqual({
      conservative: 5860,
      moderate: 9600,
      optimistic: 9900,
      validCount: 3,
    });
    expect(result.mosPct).toBe(6.25);
    expect(result.valuationStatus).toBe('FAIRLY_VALUED');
    expect(result.qualityFlags).toEqual({
      roeFlag: 'STRONG',
      derFlag: 'HEALTHY',
    });
  });

  it('disables Simple DCF for Banking sector, sets DER=NOT_APPLICABLE_BANKING, and uses even-count median', () => {
    const result = calculateValuation({
      sector: 'FINANCIALS',
      currentPrice: 9500,
      eps: 400,
      bvps: 2000,
      epsGrowthPct: 12, // Still N/A for banking
      targetPer: 15, // 6000
      targetPbv: 2.5, // 5000
      der: 5.5,
      roePct: 14.5,
    });
    expect(result.qualityFlags.derFlag).toBe('NOT_APPLICABLE_BANKING');
    expect(result.qualityFlags.roeFlag).toBe('MODERATE');
    const dcf = result.methods.find((m) => m.method === 'simpleDcf');
    expect(dcf).toEqual({
      method: 'simpleDcf',
      fairValue: null,
      status: 'NA',
      reasonCode: 'NOT_APPLICABLE_FOR_BANKING',
    });
    // 2 valid methods [5000, 6000] -> even median = 5500 -> Overvalued
    expect(result.fairValue).toEqual({
      conservative: 5000,
      moderate: 5500,
      optimistic: 6000,
      validCount: 2,
    });
    expect(result.valuationStatus).toBe('OVERVALUED');
  });

  it('withholds composite Fair Value & MoS on Loss-Making stocks while keeping Relative P/B reference visible', () => {
    const result = calculateValuation({
      sector: 'TECHNOLOGY',
      currentPrice: 50,
      eps: -100,
      bvps: 300,
      dps: 0,
      targetPbv: 0.8,
      roePct: -12,
      der: 2.5,
    });

    const validMethods = result.methods.filter((m) => m.status === 'VALID');
    const naMethods = result.methods.filter((m) => m.status === 'NA');
    expect(validMethods).toHaveLength(1);
    expect(validMethods[0]).toEqual({
      method: 'relativePbv',
      fairValue: 240,
      status: 'VALID',
    });
    expect(naMethods).toHaveLength(2);
    // Composite Fair Value & MoS are withheld so loss-making/FCA stocks cannot rank UNDERVALUED
    expect(result.fairValue).toEqual({
      conservative: null,
      moderate: null,
      optimistic: null,
      validCount: 1,
    });
    expect(result.mosPct).toBeNull();
    expect(result.valuationStatus).toBe('INSUFFICIENT_DATA');
    expect(result.qualityFlags).toEqual({
      roeFlag: 'WEAK',
      derFlag: 'HIGH_LEVERAGE',
    });
    expect(result.valueTrapShield.riskLevel).toBe('HIGH_RISK');
    expect(result.valueTrapShield.warnings).toContain('SHRINKING_EARNINGS_TRAP');
  });

  it('handles Sub-50 IDX stock (Rp 12), default assumptions, and INSUFFICIENT_DATA', () => {
    const sub50 = calculateValuation({
      sector: 'ENERGY',
      currentPrice: 12,
      eps: 2,
      bvps: 10,
      dps: 1,
      epsGrowthPct: 10,
      targetPer: 7,
      der: 1.5,
    });
    expect(sub50.ratios.currentPer).toBe(6);
    expect(sub50.assumptionsUsed).toEqual({
      discountRatePct: 12,
      projectionYears: 5,
      terminalGrowthPct: 4,
    });
    expect(sub50.qualityFlags.derFlag).toBe('MODERATE');
    expect(sub50.qualityFlags.roeFlag).toBe('UNKNOWN');

    const empty = calculateValuation({
      sector: 'HEALTHCARE',
      currentPrice: 1000,
      eps: null,
      bvps: null,
      discountRatePct: 5,
      terminalGrowthPct: 5,
    });
    expect(empty.fairValue).toEqual({
      conservative: null,
      moderate: null,
      optimistic: null,
      validCount: 0,
    });
    expect(empty.mosPct).toBeNull();
    expect(empty.valuationStatus).toBe('INSUFFICIENT_DATA');
    expect(empty.qualityFlags.derFlag).toBe('UNKNOWN');
    expect(empty.valueTrapShield).toEqual({
      riskLevel: 'CLEAR',
      warnings: [],
    });
  });

  it('detects IHSG Value Trap Shield warnings (Cyclical Peak, Shrinking Earnings, Low ROE, High Leverage)', () => {
    // 1. WATCH: Single cyclical peak warning (BASIC_MATERIALS with MoS >= 25% & healthy ROE/growth/DER)
    const cyclicalWatch = calculateValuation({
      sector: 'BASIC_MATERIALS',
      currentPrice: 1000,
      eps: 125, // currentPer = 8 (> 6, so triggered by mosPct >= 25)
      bvps: 1000,
      roePct: 16,
      der: 0.5,
      epsGrowthPct: 10,
      targetPer: 12, // 1500 -> MoS = 33.33%
      targetPbv: 1.5, // 1500
    });
    expect(cyclicalWatch.valueTrapShield).toEqual({
      riskLevel: 'WATCH',
      warnings: ['CYCLICAL_PEAK_WARNING'],
    });

    // 2. WATCH: Low ROE trap only (non-cyclical, positive growth, low DER, ROE < 8%, MoS >= 15%)
    const lowRoeWatch = calculateValuation({
      sector: 'CONSUMER_CYCLICALS',
      currentPrice: 800,
      eps: 80,
      bvps: 1200,
      roePct: 6.5,
      der: 0.4,
      epsGrowthPct: 5,
      targetPer: 13, // 1040 -> MoS = 23.08%
      targetPbv: 1.0, // 1200
    });
    expect(lowRoeWatch.valueTrapShield).toEqual({
      riskLevel: 'WATCH',
      warnings: ['LOW_ROE_VALUE_TRAP'],
    });

    // 3. HIGH_RISK: Shrinking earnings (<= -15%) + High leverage on non-bank stock
    const highRiskTrap = calculateValuation({
      sector: 'PROPERTY_REAL_ESTATE',
      currentPrice: 500,
      eps: 60,
      bvps: 900,
      roePct: 10,
      der: 1.8,
      epsGrowthPct: -15,
      targetPer: 10, // 600
      targetPbv: 0.8, // 720
    });
    expect(highRiskTrap.valueTrapShield).toEqual({
      riskLevel: 'HIGH_RISK',
      warnings: ['SHRINKING_EARNINGS_TRAP', 'HIGH_LEVERAGE_TRAP'],
    });

    // 4. Sector-aware Property ROE floor (5%) & minor YoY dip (-5%) do NOT trigger false-positive Value Trap
    const healthyProperty = calculateValuation({
      sector: 'PROPERTY_REAL_ESTATE',
      currentPrice: 1000,
      eps: 120,
      bvps: 1900,
      roePct: 6.5, // above 5% property landbank floor
      der: 0.35,
      epsGrowthPct: -5, // mild dip above -15% threshold
      targetPer: 12,
      targetPbv: 1.0,
    });
    expect(healthyProperty.valueTrapShield).toEqual({
      riskLevel: 'CLEAR',
      warnings: [],
    });

    // 5. Property stock with ROE < 5% still triggers LOW_ROE_VALUE_TRAP
    const weakProperty = calculateValuation({
      sector: 'PROPERTY_REAL_ESTATE',
      currentPrice: 800,
      eps: 80,
      bvps: 1800,
      roePct: 4.2,
      der: 0.4,
      epsGrowthPct: 2,
      targetPer: 12,
      targetPbv: 1.0,
    });
    expect(weakProperty.valueTrapShield).toEqual({
      riskLevel: 'WATCH',
      warnings: ['LOW_ROE_VALUE_TRAP'],
    });
  });

  it('prevents DCF sign inversion and disables DCF on collapsing earnings (<= -25%)', () => {
    // Severe decline <= -25% -> DCF marked N/A, never produces negative fairValue or false recovery
    const collapsing = calculateValuation({
      sector: 'INDUSTRIALS',
      currentPrice: 500,
      eps: 100,
      epsGrowthPct: -35,
    });
    const dcf = collapsing.methods.find((m) => m.method === 'simpleDcf');
    expect(dcf).toEqual({
      method: 'simpleDcf',
      fairValue: null,
      status: 'NA',
      reasonCode: 'REQUIRES_POSITIVE_EPS_AND_VALID_DCF_RATES',
    });
    expect(collapsing.fairValue.moderate).toBeNull();
    expect(collapsing.mosPct).toBeNull();
    expect(collapsing.valuationStatus).toBe('INSUFFICIENT_DATA');

    // Moderate negative growth (-20%) -> valid DCF with 0% explicit retention and positive fair value
    const moderateNeg = calculateValuation({
      sector: 'INDUSTRIALS',
      currentPrice: 500,
      eps: 100,
      epsGrowthPct: -20,
    });
    const moderateDcf = moderateNeg.methods.find((m) => m.method === 'simpleDcf');
    expect(moderateDcf?.status).toBe('VALID');
    expect(moderateDcf?.fairValue).toBeGreaterThan(0);
    expect(moderateNeg.fairValue.moderate).toBeGreaterThan(0);
  });
});
