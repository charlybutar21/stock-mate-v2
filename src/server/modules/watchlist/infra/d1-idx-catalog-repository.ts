import { desc, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { IdxSector } from '@/shared/domain';
import * as schema from '@/server/shared/db/schema';
import type { IdxCatalogRepository, IdxStockRecord } from '../domain/watchlist.types';

const BATCH_CHUNK_SIZE = 100;

function mapRow(row: typeof schema.idxStocks.$inferSelect): IdxStockRecord {
  return {
    ticker: row.ticker,
    companyName: row.companyName,
    sector: row.sector as IdxSector,
    currentPrice: row.currentPrice,
    openPrice: row.openPrice,
    dailyChange: row.dailyChange,
    dailyChangeBps: row.dailyChangeBps,
    periodLabel: row.periodLabel,
    eps: row.eps,
    bvps: row.bvps,
    dps: row.dps,
    roeBps: row.roeBps,
    derX100: row.derX100,
    epsGrowthBps: row.epsGrowthBps,
    targetPerX100: row.targetPerX100,
    targetPbvX100: row.targetPbvX100,
    marketCapIdr: row.marketCapIdr,
    adtvIdr: row.adtvIdr,
    roaBps: row.roaBps,
    roicBps: row.roicBps,
    operatingMarginBps: row.operatingMarginBps,
    netMarginBps: row.netMarginBps,
    revenueGrowthBps: row.revenueGrowthBps,
    netIncomeGrowthBps: row.netIncomeGrowthBps,
    currentRatioX100: row.currentRatioX100,
    netDebtToEbitdaX100: row.netDebtToEbitdaX100,
    equityToAssetsBps: row.equityToAssetsBps,
    wholesaleDerX100: row.wholesaleDerX100,
    cfoToNiX100: row.cfoToNiX100,
    fcfMarginBps: row.fcfMarginBps,
    fcfYieldBps: row.fcfYieldBps,
    cfoPositive: row.cfoPositive,
    fcfPositive: row.fcfPositive,
    piotroskiFScore: row.piotroskiFScore,
    altmanZX100: row.altmanZX100,
    source: row.source,
    syncedAt: row.syncedAt,
  };
}

function buildUpsertSet(stock: IdxStockRecord) {
  return {
    companyName: stock.companyName,
    sector: stock.sector,
    currentPrice: stock.currentPrice,
    openPrice: stock.openPrice,
    dailyChange: stock.dailyChange,
    dailyChangeBps: stock.dailyChangeBps,
    periodLabel: stock.periodLabel,
    eps: stock.eps,
    bvps: stock.bvps,
    dps: stock.dps,
    roeBps: stock.roeBps,
    derX100: stock.derX100,
    epsGrowthBps: stock.epsGrowthBps,
    targetPerX100: stock.targetPerX100,
    targetPbvX100: stock.targetPbvX100,
    marketCapIdr: stock.marketCapIdr,
    adtvIdr: stock.adtvIdr,
    roaBps: stock.roaBps,
    roicBps: stock.roicBps,
    operatingMarginBps: stock.operatingMarginBps,
    netMarginBps: stock.netMarginBps,
    revenueGrowthBps: stock.revenueGrowthBps,
    netIncomeGrowthBps: stock.netIncomeGrowthBps,
    currentRatioX100: stock.currentRatioX100,
    netDebtToEbitdaX100: stock.netDebtToEbitdaX100,
    equityToAssetsBps: stock.equityToAssetsBps,
    wholesaleDerX100: stock.wholesaleDerX100,
    cfoToNiX100: stock.cfoToNiX100,
    fcfMarginBps: stock.fcfMarginBps,
    fcfYieldBps: stock.fcfYieldBps,
    cfoPositive: stock.cfoPositive,
    fcfPositive: stock.fcfPositive,
    piotroskiFScore: stock.piotroskiFScore,
    altmanZX100: stock.altmanZX100,
    source: stock.source,
    syncedAt: stock.syncedAt,
  };
}

export class D1IdxCatalogRepository implements IdxCatalogRepository {
  constructor(private readonly db: DrizzleD1Database<typeof schema>) {}

  async listAll(): Promise<IdxStockRecord[]> {
    const rows = await this.db.select().from(schema.idxStocks);
    return rows.map(mapRow);
  }

  async findByTicker(ticker: string): Promise<IdxStockRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.idxStocks)
      .where(eq(schema.idxStocks.ticker, ticker))
      .limit(1);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByTickers(tickers: string[]): Promise<IdxStockRecord[]> {
    if (tickers.length === 0) return [];
    const results: IdxStockRecord[] = [];
    for (let i = 0; i < tickers.length; i += BATCH_CHUNK_SIZE) {
      const slice = tickers.slice(i, i + BATCH_CHUNK_SIZE);
      const rows = await this.db
        .select()
        .from(schema.idxStocks)
        .where(inArray(schema.idxStocks.ticker, slice));
      for (const row of rows) {
        results.push(mapRow(row));
      }
    }
    return results;
  }

  async getLatestSyncedAt(): Promise<number | null> {
    const rows = await this.db
      .select({ syncedAt: schema.idxStocks.syncedAt })
      .from(schema.idxStocks)
      .orderBy(desc(schema.idxStocks.syncedAt))
      .limit(1);
    return rows[0]?.syncedAt ?? null;
  }

  async hasQualityMetrics(): Promise<boolean> {
    const rows = await this.db
      .select({ ticker: schema.idxStocks.ticker })
      .from(schema.idxStocks)
      .where(isNotNull(schema.idxStocks.marketCapIdr))
      .limit(1);
    return rows.length > 0;
  }

  async upsertOne(stock: IdxStockRecord): Promise<void> {
    await this.db
      .insert(schema.idxStocks)
      .values(stock)
      .onConflictDoUpdate({
        target: schema.idxStocks.ticker,
        set: buildUpsertSet(stock),
      });
  }

  async upsertMany(stocks: IdxStockRecord[], pruneBeforeMs?: number): Promise<void> {
    if (stocks.length === 0) return;

    for (let i = 0; i < stocks.length; i += BATCH_CHUNK_SIZE) {
      const chunk = stocks.slice(i, i + BATCH_CHUNK_SIZE);
      const statements = chunk.map((stock) =>
        this.db
          .insert(schema.idxStocks)
          .values(stock)
          .onConflictDoUpdate({
            target: schema.idxStocks.ticker,
            set: buildUpsertSet(stock),
          }),
      );
      await this.db.batch(statements as [typeof statements[0], ...typeof statements]);
    }

    if (pruneBeforeMs !== undefined) {
      await this.db.delete(schema.idxStocks).where(lt(schema.idxStocks.syncedAt, pruneBeforeMs));
    }
  }
}
