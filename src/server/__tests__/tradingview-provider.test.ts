import { describe, expect, it } from 'vitest';
import { createWatchlistSchema } from '@/shared/contracts';
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
    expect(dto!.fundamentals).toMatchObject({
      eps: 483,
      bvps: 2307,
      dps: 336,
      roePct: 21.2,
      der: null,
      wholesaleDer: 0.02,
      epsGrowthPct: 4.11,
      targetPer: 15,
      targetPbv: 2.5,
    });
  });

  it('parses extended 29-column FQS metrics for Non-Financial (ICBP) and Banking (BBCA) stocks', () => {
    const icbpFull = parseTradingViewRowToDto({
      s: 'IDX:ICBP',
      d: [
        'ICBP',
        'PT Indofood CBP Sukses Makmur Tbk',
        7050,
        'Consumer Non-Durables',
        710.22,
        4744.57,
        265,
        15.83,
        0.91,
        37.17,
        83_382_643_652_344, // market_cap_basic
        9_353_173, // average_volume_30d_calc
        6.0, // roa
        8.26, // roic
        20.06, // opm
        9.98, // npm
        13.15, // rev growth
        37.17, // ni growth
        4.46, // current ratio
        16_996_442_000_000, // net_debt
        18_608_586_000_000, // ebitda
        143_525_285_000_000, // total_assets
        65_723_846_000_000, // total_liabilities
        12_343_256_000_000, // cfo
        10_144_276_000_000, // fcf
        8_282_536_000_000, // net_income
        12.22, // fcf_margin
        8, // piotroski
        2.51, // altman_z
      ],
    });

    expect(icbpFull).not.toBeNull();
    expect(icbpFull!.fundamentals.marketCapIdr).toBe(83_382_643_652_344);
    expect(icbpFull!.fundamentals.adtvIdr).toBe(Math.round(9_353_173 * 7050));
    expect(icbpFull!.fundamentals.roaPct).toBe(6);
    expect(icbpFull!.fundamentals.roicPct).toBe(8.26);
    expect(icbpFull!.fundamentals.operatingMarginPct).toBe(20.06);
    expect(icbpFull!.fundamentals.netMarginPct).toBe(9.98);
    expect(icbpFull!.fundamentals.revenueGrowthPct).toBe(13.15);
    expect(icbpFull!.fundamentals.currentRatio).toBe(4.46);
    expect(icbpFull!.fundamentals.netDebtToEbitda).toBe(0.91);
    expect(icbpFull!.fundamentals.cfoToNetIncome).toBe(1.49);
    expect(icbpFull!.fundamentals.fcfMarginPct).toBe(12.22);
    expect(icbpFull!.fundamentals.fcfYieldPct).toBe(12.17);
    expect(icbpFull!.fundamentals.cfoPositive).toBe(true);
    expect(icbpFull!.fundamentals.fcfPositive).toBe(true);
    expect(icbpFull!.fundamentals.piotroskiFScore).toBe(8);
    expect(icbpFull!.fundamentals.altmanZScore).toBe(2.51);

    const bbcaFull = parseTradingViewRowToDto({
      s: 'IDX:BBCA',
      d: [
        'BBCA',
        'PT Bank Central Asia Tbk',
        5900,
        'Finance',
        483,
        2307,
        336,
        21.2,
        0.021,
        4.11,
        727_322_776_562_500,
        279_628_313,
        3.73,
        21.16,
        63.56,
        51.39,
        2.47,
        3.84,
        0.15, // current ratio ignored for financials
        -73_428_135_000_000,
        null,
        1_641_511_008_000_000,
        1_357_849_973_000_000,
        63_929_145_000_000,
        60_554_713_000_000,
        59_355_699_000_000,
        46.62,
        null,
        null,
      ],
    });
    expect(bbcaFull!.fundamentals.der).toBeNull();
    expect(bbcaFull!.fundamentals.currentRatio).toBeNull();
    expect(bbcaFull!.fundamentals.netDebtToEbitda).toBeNull();
    expect(bbcaFull!.fundamentals.wholesaleDer).toBe(0.02);
    expect(bbcaFull!.fundamentals.equityToAssetsPct).toBe(17.28);
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

  it('handles extreme turnaround YoY EPS growth stocks like IDX:BUMI (+2738%) and passes createWatchlistSchema', () => {
    const bumi = parseTradingViewRowToDto({
      s: 'IDX:BUMI',
      d: [
        'BUMI',
        'PT Bumi Resources Tbk Class A',
        127,
        'Non-Energy Minerals',
        5.4151,
        80.16587,
        0,
        7.3295254929497,
        0.440262269302495,
        2738.1027253668763,
      ],
    });

    expect(bumi).not.toBeNull();
    expect(bumi!.ticker).toBe('BUMI');
    expect(bumi!.currentPrice).toBe(127);
    expect(bumi!.fundamentals.epsGrowthPct).toBe(1000);

    const parsed = createWatchlistSchema.safeParse({
      ticker: bumi!.ticker,
      companyName: bumi!.companyName,
      sector: bumi!.sector,
      currentPrice: bumi!.currentPrice,
      fundamentals: {
        ...bumi!.fundamentals,
        epsGrowthPct: 2738.1, // even if entered manually without clamping
      },
    });
    expect(parsed.success).toBe(true);
  });
});
