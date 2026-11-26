import { describe, expect, it } from 'vitest';
import {
  formatIdr,
  formatMultiple,
  formatNumber,
  formatPercent,
  formatStockbitPriceInput,
  parseStockbitPriceInput,
} from '../formatters';

describe('Stockbit-standard formatters and price input parsing', () => {
  it('formats IDR, numbers, percentages, and multiples in Stockbit format (comma thousands, dot decimals)', () => {
    expect(formatIdr(4825)).toBe('Rp 4,825');
    expect(formatIdr(4825.67, true)).toBe('Rp 4,825.67');
    expect(formatIdr(-947500)).toBe('-Rp 947,500');
    expect(formatIdr(10_962_500)).toBe('Rp 10,962,500');
    expect(formatIdr(null)).toBe('-');

    expect(formatNumber(4825.67, 2)).toBe('4,825.67');
    expect(formatNumber(10000)).toBe('10,000');
    expect(formatNumber(undefined)).toBe('-');

    expect(formatPercent(-40.8, true)).toBe('-40.80%');
    expect(formatPercent(9.46, true)).toBe('+9.46%');
    expect(formatMultiple(12.5)).toBe('12.50x');
  });

  it('parses Stockbit, Indonesian, and raw typed price strings into canonical numeric values', () => {
    // Decimal prices (average buy price)
    expect(parseStockbitPriceInput('4,825.67', true)).toBe('4825.67');
    expect(parseStockbitPriceInput('Rp 4,825.67', true)).toBe('4825.67');
    expect(parseStockbitPriceInput('4.825,67', true)).toBe('4825.67');
    expect(parseStockbitPriceInput('Rp 4.825,67', true)).toBe('4825.67');
    expect(parseStockbitPriceInput('4825,67', true)).toBe('4825.67');
    expect(parseStockbitPriceInput('4825.', true)).toBe('4825.');
    expect(parseStockbitPriceInput('4825.6789', true)).toBe('4825.67');
    expect(parseStockbitPriceInput('10,000', true)).toBe('10000');
    expect(parseStockbitPriceInput('1.000.000', true)).toBe('1000000');
    expect(parseStockbitPriceInput('4.825', true)).toBe('4825');
    expect(parseStockbitPriceInput('', true)).toBe('');

    // Integer-only prices (IDX market price / target buy price)
    expect(parseStockbitPriceInput('4,825', false)).toBe('4825');
    expect(parseStockbitPriceInput('4,825.67', false)).toBe('4825');
    expect(parseStockbitPriceInput('4.825,67', false)).toBe('4825');
    expect(parseStockbitPriceInput('00150', false)).toBe('150');
  });

  it('auto-formats canonical strings into live Stockbit display strings', () => {
    expect(formatStockbitPriceInput('', true)).toBe('');
    expect(formatStockbitPriceInput('4825', true)).toBe('4,825');
    expect(formatStockbitPriceInput('4825.', true)).toBe('4,825.');
    expect(formatStockbitPriceInput('4825.6', true)).toBe('4,825.6');
    expect(formatStockbitPriceInput('4825.67', true)).toBe('4,825.67');
    expect(formatStockbitPriceInput('20000000', false)).toBe('20,000,000');
  });
});
