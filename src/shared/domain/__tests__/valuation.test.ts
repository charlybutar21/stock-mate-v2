import { describe, expect, it } from 'vitest';
import { calculateValuation } from '../valuation';

describe('valuation engine', () => {
  it('matches Golden Case 1 — Full Multi-Method Valuation', () => {
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
      dividendGrowthPct: 5.0,
    });

    expect(result.ratios).toEqual({
      currentPer: 20,
      currentPbv: 4.5,
      dividendYieldPct: 2.78,
      pegRatio: 1.67,
    });

    const byMethod = Object.fromEntries(
      result.methods.map((m) => [m.method, m]),
    );
    expect(byMethod.grahamNumber).toEqual({ method: 'grahamNumber', fairValue: 4500, status: 'VALID' });
    expect(byMethod.relativePer).toEqual({ method: 'relativePer', fairValue: 9900, status: 'VALID' });
    expect(byMethod.relativePbv).toEqual({ method: 'relativePbv', fairValue: 9600, status: 'VALID' });
    expect(byMethod.peterLynch).toEqual({ method: 'peterLynch', fairValue: 6650, status: 'VALID' });
    expect(byMethod.simpleDcf).toEqual({ method: 'simpleDcf', fairValue: 8100, status: 'VALID' });
    expect(byMethod.ddmGordon).toEqual({ method: 'ddmGordon', fairValue: 3750, status: 'VALID' });

    expect(result.fairValue).toEqual({
      conservative: 3750,
      moderate: 7375,
      optimistic: 9900,
      validCount: 6,
    });
    expect(result.mosPct).toBe(-22.03);
    expect(result.valuationStatus).toBe('OVERVALUED');
    expect(result.qualityFlags).toEqual({
      roeFlag: 'STRONG',
      derFlag: 'HEALTHY',
    });
  });

  it('matches Golden Case 2A — Banking sector DER is NOT_APPLICABLE_BANKING', () => {
    const result = calculateValuation({
      sector: 'FINANCIALS',
      currentPrice: 9500,
      der: 5.5,
      roePct: 14.5,
    });
    expect(result.qualityFlags.derFlag).toBe('NOT_APPLICABLE_BANKING');
    expect(result.qualityFlags.roeFlag).toBe('MODERATE');
  });

  it('matches Golden Case 2B — Loss-Making & Zero Dividend graceful N/A', () => {
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
    expect(naMethods).toHaveLength(5);
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

  it('matches Golden Case 2C — Sub-50 IDX stock (Rp 12) & FAIRLY_VALUED / INSUFFICIENT_DATA / fallback assumptions', () => {
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
      effectiveDividendGrowthPct: 8,
    });
    expect(sub50.qualityFlags.derFlag).toBe('MODERATE');
    expect(sub50.qualityFlags.roeFlag).toBe('UNKNOWN');

    // Fairly valued branch (0 <= mosPct < 30)
    const fairlyValued = calculateValuation({
      sector: 'INDUSTRIALS',
      currentPrice: 900,
      bvps: 1000,
      targetPbv: 1.0,
    });
    expect(fairlyValued.mosPct).toBe(10);
    expect(fairlyValued.valuationStatus).toBe('FAIRLY_VALUED');

    // Insufficient data branch (0 valid methods) & invalid DCF/DDM rates
    const empty = calculateValuation({
      sector: 'HEALTHCARE',
      currentPrice: 1000,
      eps: null,
      bvps: null,
      dps: 50,
      discountRatePct: 5,
      terminalGrowthPct: 5,
      dividendGrowthPct: 6,
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
    expect(empty.methods.find((m) => m.method === 'ddmGordon')?.reasonCode).toBe(
      'REQUIRES_POSITIVE_DPS_AND_VALID_DDM_RATES',
    );
  });
});
