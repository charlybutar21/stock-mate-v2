import { describe, expect, it } from 'vitest';
import {
  ceilToIdxTick,
  DEFAULT_BUY_FEE_PCT,
  DEFAULT_SELL_FEE_PCT,
  getIdxTickSize,
  IDX_SECTORS,
  isStaleTimestamp,
  MIN_IDX_PRICE,
  round2,
  SHARES_PER_LOT,
  STALE_THRESHOLD_MS,
  STAMP_DUTY_IDR,
  STAMP_DUTY_THRESHOLD_IDR,
} from '../idx-rules';

describe('idx-rules', () => {
  it('defines exact 2026 IDX constants', () => {
    expect(SHARES_PER_LOT).toBe(100);
    expect(MIN_IDX_PRICE).toBe(1);
    expect(DEFAULT_BUY_FEE_PCT).toBe(0.15);
    expect(DEFAULT_SELL_FEE_PCT).toBe(0.25);
    expect(STAMP_DUTY_THRESHOLD_IDR).toBe(10_000_000);
    expect(STAMP_DUTY_IDR).toBe(10_000);
    expect(IDX_SECTORS).toHaveLength(11);
  });

  it('rounds to 2 decimal places without -0', () => {
    expect(round2(-0.001)).toBe(0);
    expect(Object.is(round2(-0.001), -0)).toBe(false);
    expect(round2(12.345)).toBe(12.35);
    expect(round2(-22.0339)).toBe(-22.03);
  });

  it('returns correct IDX tick sizes across all brackets', () => {
    expect(getIdxTickSize(1)).toBe(1);
    expect(getIdxTickSize(199)).toBe(1);
    expect(getIdxTickSize(200)).toBe(2);
    expect(getIdxTickSize(499)).toBe(2);
    expect(getIdxTickSize(500)).toBe(5);
    expect(getIdxTickSize(1999)).toBe(5);
    expect(getIdxTickSize(2000)).toBe(10);
    expect(getIdxTickSize(4999)).toBe(10);
    expect(getIdxTickSize(5000)).toBe(25);
    expect(getIdxTickSize(12000)).toBe(25);
  });

  it('matches Golden Case 5 — IDX Tick Boundary Edges (ceilToIdxTick)', () => {
    const cases: Array<[number, number]> = [
      [0, 1],
      [0.4, 1],
      [1, 1],
      [199.1, 200],
      [200.1, 202],
      [499.1, 500],
      [501, 505],
      [1996, 2000],
      [2001, 2010],
      [4991, 5000],
      [5001, 5025],
    ];
    for (const [input, expected] of cases) {
      expect(ceilToIdxTick(input)).toBe(expected);
    }
  });

  it('evaluates 14-day staleness correctly', () => {
    const now = 1_800_000_000_000;
    expect(isStaleTimestamp(now - STALE_THRESHOLD_MS, now)).toBe(false);
    expect(isStaleTimestamp(now - STALE_THRESHOLD_MS - 1, now)).toBe(true);
    expect(isStaleTimestamp(Date.now())).toBe(false);
  });
});
