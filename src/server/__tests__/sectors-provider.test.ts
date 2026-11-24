import { describe, expect, it } from 'vitest';
import { parseSectorsReportToDto } from '../modules/market-data/infra/sectors-provider';

describe('SectorsIdxProvider parser', () => {
  it('parses Sectors.app company report with peer benchmarks & banking DER rule', () => {
    const dto = parseSectorsReportToDto('bbri', {
      company_name: 'PT Bank Rakyat Indonesia (Persero) Tbk',
      overview: {
        sector: 'Financials',
        last_close_price: 4500,
      },
      valuation: {
        historical_valuation: [
          { year: 2024, pe: 12.1, pb: 2.3, pe_peer_avg: 14.5, pb_peer_avg: 2.4 },
          { year: 2025, pe: 11.25, pb: 2.25, pe_peer_avg: 13.8, pb_peer_avg: 2.2 },
        ],
      },
      financials: {
        roe: 0.195,
        der: 5.2,
        historical_financials: [
          { year: 2024, earnings: 55_000_000_000_000 },
          { year: 2025, earnings: 60_500_000_000_000 },
        ],
      },
      dividend: {
        historical_dividends: [
          { year: 2024, total: 319 },
          { year: 2025, total: 343 },
        ],
      },
    });

    expect(dto.ticker).toBe('BBRI');
    expect(dto.sector).toBe('FINANCIALS');
    expect(dto.currentPrice).toBe(4500);
    expect(dto.source).toBe('sectors_app');
    expect(dto.periodLabel).toBe('TTM (Sectors.app)');
    expect(dto.fundamentals).toEqual({
      eps: 400, // 4500 / 11.25
      bvps: 2000, // 4500 / 2.25
      dps: 343,
      roePct: 19.5,
      der: null, // FINANCIALS banking rule
      epsGrowthPct: 10, // (60.5 - 55) / 55 * 100
      targetPer: 13.8,
      targetPbv: 2.2,
    });
  });

  it('derives DER from total_debt / total_equity and DPS from dividend yield for non-bank', () => {
    const dto = parseSectorsReportToDto('icbp', {
      overview: {
        company_name: 'PT Indofood CBP Sukses Makmur Tbk',
        sector: 'Consumer Non-Cyclicals',
        last_close_price: 9000,
      },
      financials: {
        eps: 450,
        bvps: 2000,
        roe: 22.5,
        total_debt: 60,
        total_equity: 100,
        earnings_growth: 0.12,
      },
      dividend: {
        yield_ttm: 0.03,
      },
    });

    expect(dto.sector).toBe('CONSUMER_NON_CYCLICALS');
    expect(dto.fundamentals.eps).toBe(450);
    expect(dto.fundamentals.bvps).toBe(2000);
    expect(dto.fundamentals.dps).toBe(270); // 9000 * 0.03
    expect(dto.fundamentals.roePct).toBe(22.5);
    expect(dto.fundamentals.der).toBe(0.6);
    expect(dto.fundamentals.epsGrowthPct).toBe(12);
    expect(dto.fundamentals.targetPer).toBe(18); // sector benchmark fallback
    expect(dto.fundamentals.targetPbv).toBe(3.5);
  });
});
