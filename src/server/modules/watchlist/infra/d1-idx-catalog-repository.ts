import { desc, eq, inArray, lt } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { IdxSector } from '@/shared/domain';
import * as schema from '@/server/shared/db/schema';
import type { IdxCatalogRepository, IdxStockRecord } from '../domain/watchlist.types';

const BATCH_CHUNK_SIZE = 50;

function mapRow(row: typeof schema.idxStocks.$inferSelect): IdxStockRecord {
  return {
    ticker: row.ticker,
    companyName: row.companyName,
    sector: row.sector as IdxSector,
    currentPrice: row.currentPrice,
    periodLabel: row.periodLabel,
    eps: row.eps,
    bvps: row.bvps,
    dps: row.dps,
    roeBps: row.roeBps,
    derX100: row.derX100,
    epsGrowthBps: row.epsGrowthBps,
    targetPerX100: row.targetPerX100,
    targetPbvX100: row.targetPbvX100,
    source: row.source,
    syncedAt: row.syncedAt,
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

  async upsertOne(stock: IdxStockRecord): Promise<void> {
    await this.db
      .insert(schema.idxStocks)
      .values(stock)
      .onConflictDoUpdate({
        target: schema.idxStocks.ticker,
        set: {
          companyName: stock.companyName,
          sector: stock.sector,
          currentPrice: stock.currentPrice,
          periodLabel: stock.periodLabel,
          eps: stock.eps,
          bvps: stock.bvps,
          dps: stock.dps,
          roeBps: stock.roeBps,
          derX100: stock.derX100,
          epsGrowthBps: stock.epsGrowthBps,
          targetPerX100: stock.targetPerX100,
          targetPbvX100: stock.targetPbvX100,
          source: stock.source,
          syncedAt: stock.syncedAt,
        },
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
            set: {
              companyName: stock.companyName,
              sector: stock.sector,
              currentPrice: stock.currentPrice,
              periodLabel: stock.periodLabel,
              eps: stock.eps,
              bvps: stock.bvps,
              dps: stock.dps,
              roeBps: stock.roeBps,
              derX100: stock.derX100,
              epsGrowthBps: stock.epsGrowthBps,
              targetPerX100: stock.targetPerX100,
              targetPbvX100: stock.targetPbvX100,
              source: stock.source,
              syncedAt: stock.syncedAt,
            },
          }),
      );
      await this.db.batch(statements as [typeof statements[0], ...typeof statements]);
    }

    if (pruneBeforeMs !== undefined) {
      await this.db.delete(schema.idxStocks).where(lt(schema.idxStocks.syncedAt, pruneBeforeMs));
    }
  }
}
