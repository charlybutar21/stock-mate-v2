import { describe, expect, it } from 'vitest';
import { parseTradingViewRowToDto } from '../modules/market-data/infra/tradingview-provider';

describe('TradingViewIdxProvider parser', () => {
  it('parses Banking stock (IDX:BBCA) with banking DER=null rule', () => {
    const dto = parseTradingViewRowToDto({
      s: 'IDX:BBCA',
      d: [
        'BBCA',
        'PT Bank Central Asia Tbk',
        5800,
        'Finance',
        482.8022,
        2307.1906,
        336,
        21.2047,
        0.0213,
        4.1143,
      ],
    });

    expect(dto).not.toBeNull();
    expect(dto!.ticker).toBe('BBCA');
    expect(dto!.sector).toBe('FINANCIALS');
    expect(dto!.currentPrice).toBe(5800);
    expect(dto!.source).toBe('tradingview');
    expect(dto!.periodLabel).toBe('TTM (TradingView)');
    expect(dto!.fundamentals).toEqual({
      eps: 483,
      bvps: 2307,
      dps: 336,
      roePct: 21.2,
      der: null,
      epsGrowthPct: 4.11,
      targetPer: 15,
      targetPbv: 2.5,
    });
  });

  it('parses Consumer Non-Durables (IDX:ICBP) and loss-making stock accurately', () => {
    const icbp = parseTradingViewRowToDto({
      s: 'IDX:ICBP',
      d: [
        'ICBP',
        'PT Indofood CBP Sukses Makmur Tbk',
        7250,
        'Consumer Non-Durables',
        710.22,
        4744.57,
        265,
        15.832,
        0.9135,
        37.166,
      ],
    });

    expect(icbp!.sector).toBe('CONSUMER_NON_CYCLICALS');
    expect(icbp!.fundamentals.der).toBe(0.91);
    expect(icbp!.fundamentals.eps).toBe(710);

    const lossMaking = parseTradingViewRowToDto({
      s: 'IDX:LOSS',
      d: ['LOSS', 'PT Rugi Tbk', 85, 'Process Industries', -48.72, 57.56, null, -8.19, 0.64, -109.69],
    });
    expect(lossMaking!.sector).toBe('BASIC_MATERIALS');
    expect(lossMaking!.fundamentals.eps).toBe(-49);
    expect(lossMaking!.fundamentals.bvps).toBe(58);
    expect(lossMaking!.fundamentals.dps).toBeNull();
    expect(lossMaking!.fundamentals.roePct).toBe(-8.19);
    expect(lossMaking!.fundamentals.der).toBe(0.64);
  });
});
