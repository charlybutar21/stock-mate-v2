import type { IdxMarketQuoteDto } from '@/shared/contracts';
import type { IdxCatalogRepository, IdxStockRecord } from '@/server/modules/watchlist/domain/watchlist.types';
import {
  fromBoolInt,
  fromBps,
  fromX100,
} from '@/server/modules/watchlist/application/watchlist-use-cases';
import {
  computeBankJustifiedPbv,
  SECTOR_BENCHMARK_MULTIPLES,
  type IdxMarketDataProvider,
} from '../domain/market-data.types';

export function mapIdxStockRecordToQuoteDto(stock: IdxStockRecord): IdxMarketQuoteDto {
  const benchmarks = SECTOR_BENCHMARK_MULTIPLES[stock.sector];
  const roePct = fromBps(stock.roeBps);
  const fallbackTargetPbv =
    stock.sector === 'FINANCIALS' ? computeBankJustifiedPbv(roePct) : benchmarks.targetPbv;
  return {
    ticker: stock.ticker,
    companyName: stock.companyName,
    sector: stock.sector,
    currentPrice: stock.currentPrice,
    openPrice: stock.openPrice,
    dailyChange: stock.dailyChange,
    dailyChangePct: fromBps(stock.dailyChangeBps),
    periodLabel: stock.periodLabel ?? 'TTM (IDX Catalog)',
    fundamentals: {
      eps: stock.eps,
      bvps: stock.bvps,
      dps: stock.dps,
      roePct,
      der: fromX100(stock.derX100),
      epsGrowthPct: fromBps(stock.epsGrowthBps),
      targetPer: fromX100(stock.targetPerX100) ?? benchmarks.targetPer,
      targetPbv: fromX100(stock.targetPbvX100) ?? fallbackTargetPbv,
      marketCapIdr: stock.marketCapIdr,
      adtvIdr: stock.adtvIdr,
      roaPct: fromBps(stock.roaBps),
      roicPct: fromBps(stock.roicBps),
      operatingMarginPct: fromBps(stock.operatingMarginBps),
      netMarginPct: fromBps(stock.netMarginBps),
      revenueGrowthPct: fromBps(stock.revenueGrowthBps),
      netIncomeGrowthPct: fromBps(stock.netIncomeGrowthBps),
      currentRatio: fromX100(stock.currentRatioX100),
      netDebtToEbitda: fromX100(stock.netDebtToEbitdaX100),
      equityToAssetsPct: fromBps(stock.equityToAssetsBps),
      wholesaleDer: fromX100(stock.wholesaleDerX100),
      cfoToNetIncome: fromX100(stock.cfoToNiX100),
      fcfMarginPct: fromBps(stock.fcfMarginBps),
      fcfYieldPct: fromBps(stock.fcfYieldBps),
      cfoPositive: fromBoolInt(stock.cfoPositive),
      fcfPositive: fromBoolInt(stock.fcfPositive),
      piotroskiFScore: stock.piotroskiFScore,
      altmanZScore: fromX100(stock.altmanZX100),
    },
    source: 'idx_catalog',
    fetchedAt: new Date(stock.syncedAt).toISOString(),
  };
}

/**
 * Fetches a live IDX quote from TradingView and falls back cleanly to the
 * D1 `idx_stocks` catalog (kept fresh every 5 minutes by Cloudflare Cron)
 * whenever TradingView is unavailable or its circuit breaker is open.
 */
export class GetIdxQuoteUseCase {
  constructor(
    private readonly marketDataProvider: IdxMarketDataProvider,
    private readonly idxCatalogRepo: IdxCatalogRepository,
  ) {}

  async execute(ticker: string): Promise<IdxMarketQuoteDto> {
    const cleanTicker = ticker.trim().toUpperCase();
    try {
      return await this.marketDataProvider.fetchIdxQuote(cleanTicker);
    } catch (upstreamErr) {
      let cachedStock: IdxStockRecord | null = null;
      try {
        cachedStock = await this.idxCatalogRepo.findByTicker(cleanTicker);
      } catch {
        // If D1 fallback lookup also fails, surface the original upstream error
      }
      if (cachedStock) {
        return mapIdxStockRecordToQuoteDto(cachedStock);
      }
      throw upstreamErr;
    }
  }
}
