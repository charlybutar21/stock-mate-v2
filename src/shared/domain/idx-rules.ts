export const SHARES_PER_LOT = 100;
export const MIN_IDX_PRICE = 1;
export const DEFAULT_BUY_FEE_PCT = 0.15;
export const DEFAULT_SELL_FEE_PCT = 0.25;
export const STAMP_DUTY_THRESHOLD_IDR = 10_000_000;
export const STAMP_DUTY_IDR = 10_000;
export const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;

export const IDX_SECTORS = [
  'FINANCIALS',
  'CONSUMER_NON_CYCLICALS',
  'CONSUMER_CYCLICALS',
  'ENERGY',
  'BASIC_MATERIALS',
  'INFRASTRUCTURE',
  'HEALTHCARE',
  'TECHNOLOGY',
  'PROPERTY_REAL_ESTATE',
  'INDUSTRIALS',
  'TRANSPORTATION_LOGISTICS',
] as const;

export type IdxSector = (typeof IDX_SECTORS)[number];

export function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function getIdxTickSize(price: number): number {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

export function ceilToIdxTick(rawPrice: number): number {
  const pInt = Math.ceil(rawPrice);
  if (pInt <= MIN_IDX_PRICE) return MIN_IDX_PRICE;
  const tick = getIdxTickSize(pInt);
  return Math.ceil(pInt / tick) * tick;
}

export function floorToIdxTick(rawPrice: number): number {
  const pInt = Math.floor(rawPrice);
  if (pInt <= MIN_IDX_PRICE) return MIN_IDX_PRICE;
  const tick = getIdxTickSize(pInt);
  return Math.max(MIN_IDX_PRICE, Math.floor(pInt / tick) * tick);
}

/**
 * Steps a stock price up or down by exactly one official IDX (BEI) price tick fraction:
 *   < 200      -> ±1
 *   200 - 499  -> ±2
 *   500 - 1999 -> ±5
 *   2000 - 4999 -> ±10
 *   >= 5000    -> ±25
 *
 * Handles bracket boundaries accurately (e.g., 200 down -> 199, 500 down -> 498,
 * 2000 down -> 1995, 5000 down -> 4990) and snaps off-tick inputs to the next valid tick.
 */
export function stepIdxPrice(currentPrice: number, direction: 'up' | 'down'): number {
  const safe = Number.isFinite(currentPrice) ? currentPrice : 0;

  if (direction === 'up') {
    if (safe < MIN_IDX_PRICE) return MIN_IDX_PRICE;
    const base = Math.floor(safe);
    const tick = getIdxTickSize(base);
    return Math.floor(base / tick) * tick + tick;
  }

  if (safe <= MIN_IDX_PRICE) return MIN_IDX_PRICE;
  const base = Math.ceil(safe);
  const tickForDown = getIdxTickSize(base - 1);
  return Math.max(MIN_IDX_PRICE, Math.ceil(base / tickForDown) * tickForDown - tickForDown);
}

export function isStaleTimestamp(updatedAtMs: number, nowMs: number = Date.now()): boolean {
  return nowMs - updatedAtMs > STALE_THRESHOLD_MS;
}
