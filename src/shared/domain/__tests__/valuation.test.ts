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
    expect(byMethod.simpleDcf).toEqual({ method: 'simpleDcf', fairValue: 8100, status: 'VALID' });

    // Sorted valid: [8100, 9600, 9900] -> median = 9600, mos = (9600 - 9000) / 9600 * 100 = 6.25%
    expect(result.fairValue).toEqual({
      conservative: 8100,
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

  it('handles Banking sector DER=NOT_APPLICABLE_BANKING and even-count median', () => {
    const result = calculateValuation({
      sector: 'FINANCIALS',
      currentPrice: 9500,
      eps: 400,
      bvps: 2000,
      targetPer: 15, // 6000
      targetPbv: 2.5, // 5000
      der: 5.5,
      roePct: 14.5,
    });
    expect(result.qualityFlags.derFlag).toBe('NOT_APPLICABLE_BANKING');
    expect(result.qualityFlags.roeFlag).toBe('MODERATE');
    // 2 valid methods [5000, 6000] -> even median = 5500 -> Overvalued
    expect(result.fairValue).toEqual({
      conservative: 5000,
      moderate: 5500,
      optimistic: 6000,
      validCount: 2,
    });
    expect(result.valuationStatus).toBe('OVERVALUED');
  });

  it('handles Loss-Making & Zero Dividend gracefully with N/A reasons', () => {
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
    expect(result.fairValue).toEqual({
      conservative: 240,
      moderate: 240,
      optimistic: 240,
      validCount: 1,
    });
    expect(result.mosPct).toBe(79.17);
    expect(result.valuationStatus).toBe('UNDERVALUED');
    expect(result.qualityFlags).toEqual({
      roeFlag: 'WEAK',
      derFlag: 'HIGH_LEVERAGE',
    });
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
  });
});
