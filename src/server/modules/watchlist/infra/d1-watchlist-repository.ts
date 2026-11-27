import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { IdxSector } from '@/shared/domain';
import * as schema from '@/server/shared/db/schema';
import type {
  FundamentalsRecord,
  WatchlistItemRecord,
  WatchlistRepository,
} from '../domain/watchlist.types';

function mapJoinedRow(row: {
  item: typeof schema.watchlistItems.$inferSelect;
  fundamentals: typeof schema.stockFundamentals.$inferSelect | null;
}): WatchlistItemRecord {
  const f = row.fundamentals;
  return {
    id: row.item.id,
    userId: row.item.userId,
    ticker: row.item.ticker,
    companyName: row.item.companyName,
    sector: row.item.sector as IdxSector,
    currentPrice: row.item.currentPrice,
    ownedLots: row.item.ownedLots,
    avgBuyPrice: row.item.avgBuyPrice,
    avgBuyPriceX100: row.item.avgBuyPriceX100,
    holdingTranchesJson: row.item.holdingTranchesJson,
    targetBuyPrice: row.item.targetBuyPrice,
    investmentThesis: row.item.investmentThesis,
    createdAt: row.item.createdAt,
    updatedAt: row.item.updatedAt,
    deletedAt: row.item.deletedAt,
    fundamentals: f
      ? {
          id: f.id,
          watchlistItemId: f.watchlistItemId,
          periodLabel: f.periodLabel,
          eps: f.eps,
          bvps: f.bvps,
          dps: f.dps,
          roeBps: f.roeBps,
          derX100: f.derX100,
          epsGrowthBps: f.epsGrowthBps,
          targetPerX100: f.targetPerX100,
          targetPbvX100: f.targetPbvX100,
          discountRateBps: f.discountRateBps,
          projectionYears: f.projectionYears,
          terminalGrowthBps: f.terminalGrowthBps,
          dividendGrowthBps: f.dividendGrowthBps,
          marketCapIdr: f.marketCapIdr,
          adtvIdr: f.adtvIdr,
          roaBps: f.roaBps,
          roicBps: f.roicBps,
          operatingMarginBps: f.operatingMarginBps,
          netMarginBps: f.netMarginBps,
          revenueGrowthBps: f.revenueGrowthBps,
          netIncomeGrowthBps: f.netIncomeGrowthBps,
          currentRatioX100: f.currentRatioX100,
          netDebtToEbitdaX100: f.netDebtToEbitdaX100,
          equityToAssetsBps: f.equityToAssetsBps,
          wholesaleDerX100: f.wholesaleDerX100,
          cfoToNiX100: f.cfoToNiX100,
          fcfMarginBps: f.fcfMarginBps,
          fcfYieldBps: f.fcfYieldBps,
          cfoPositive: f.cfoPositive,
          fcfPositive: f.fcfPositive,
          piotroskiFScore: f.piotroskiFScore,
          altmanZX100: f.altmanZX100,
          updatedAt: f.updatedAt,
        }
      : {
          id: '',
          watchlistItemId: row.item.id,
          periodLabel: null,
          eps: null,
          bvps: null,
          dps: null,
          roeBps: null,
          derX100: null,
          epsGrowthBps: null,
          targetPerX100: null,
          targetPbvX100: null,
          discountRateBps: 1200,
          projectionYears: 5,
          terminalGrowthBps: 400,
          dividendGrowthBps: null,
          marketCapIdr: null,
          adtvIdr: null,
          roaBps: null,
          roicBps: null,
          operatingMarginBps: null,
          netMarginBps: null,
          revenueGrowthBps: null,
          netIncomeGrowthBps: null,
          currentRatioX100: null,
          netDebtToEbitdaX100: null,
          equityToAssetsBps: null,
          wholesaleDerX100: null,
          cfoToNiX100: null,
          fcfMarginBps: null,
          fcfYieldBps: null,
          cfoPositive: null,
          fcfPositive: null,
          piotroskiFScore: null,
          altmanZX100: null,
          updatedAt: row.item.updatedAt,
        },
  };
}

export class D1WatchlistRepository implements WatchlistRepository {
  constructor(private readonly db: DrizzleD1Database<typeof schema>) {}

  async listByUser(userId: string, sector?: IdxSector): Promise<WatchlistItemRecord[]> {
    const conditions = [
      eq(schema.watchlistItems.userId, userId),
      isNull(schema.watchlistItems.deletedAt),
    ];
    if (sector) {
      conditions.push(eq(schema.watchlistItems.sector, sector));
    }

    const rows = await this.db
      .select({
        item: schema.watchlistItems,
        fundamentals: schema.stockFundamentals,
      })
      .from(schema.watchlistItems)
      .leftJoin(
        schema.stockFundamentals,
        eq(schema.stockFundamentals.watchlistItemId, schema.watchlistItems.id),
      )
      .where(and(...conditions))
      .orderBy(desc(schema.watchlistItems.updatedAt));

    return rows.map(mapJoinedRow);
  }

  async countActiveByUser(userId: string): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(schema.watchlistItems)
      .where(
        and(
          eq(schema.watchlistItems.userId, userId),
          isNull(schema.watchlistItems.deletedAt),
        ),
      );

    return Number(rows[0]?.total ?? 0);
  }

  async findByIdForUser(id: string, userId: string): Promise<WatchlistItemRecord | null> {
    const rows = await this.db
      .select({
        item: schema.watchlistItems,
        fundamentals: schema.stockFundamentals,
      })
      .from(schema.watchlistItems)
      .leftJoin(
        schema.stockFundamentals,
        eq(schema.stockFundamentals.watchlistItemId, schema.watchlistItems.id),
      )
      .where(
        and(
          eq(schema.watchlistItems.id, id),
          eq(schema.watchlistItems.userId, userId),
          isNull(schema.watchlistItems.deletedAt),
        ),
      )
      .limit(1);

    const row = rows[0];
    return row ? mapJoinedRow(row) : null;
  }

  async findActiveByUserAndTicker(userId: string, ticker: string): Promise<{ id: string } | null> {
    const rows = await this.db
      .select({ id: schema.watchlistItems.id })
      .from(schema.watchlistItems)
      .where(
        and(
          eq(schema.watchlistItems.userId, userId),
          eq(schema.watchlistItems.ticker, ticker),
          isNull(schema.watchlistItems.deletedAt),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async create(item: Omit<WatchlistItemRecord, 'deletedAt'>): Promise<void> {
    await this.db.batch([
      this.db.insert(schema.watchlistItems).values({
        id: item.id,
        userId: item.userId,
        ticker: item.ticker,
        companyName: item.companyName,
        sector: item.sector,
        currentPrice: item.currentPrice,
        ownedLots: item.ownedLots,
        avgBuyPrice: item.avgBuyPrice,
        avgBuyPriceX100: item.avgBuyPriceX100,
        holdingTranchesJson: item.holdingTranchesJson,
        targetBuyPrice: item.targetBuyPrice,
        investmentThesis: item.investmentThesis,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deletedAt: null,
      }),
      this.db.insert(schema.stockFundamentals).values({
        id: item.fundamentals.id,
        watchlistItemId: item.id,
        periodLabel: item.fundamentals.periodLabel,
        eps: item.fundamentals.eps,
        bvps: item.fundamentals.bvps,
        dps: item.fundamentals.dps,
        roeBps: item.fundamentals.roeBps,
        derX100: item.fundamentals.derX100,
        epsGrowthBps: item.fundamentals.epsGrowthBps,
        targetPerX100: item.fundamentals.targetPerX100,
        targetPbvX100: item.fundamentals.targetPbvX100,
        discountRateBps: item.fundamentals.discountRateBps,
        projectionYears: item.fundamentals.projectionYears,
        terminalGrowthBps: item.fundamentals.terminalGrowthBps,
        dividendGrowthBps: item.fundamentals.dividendGrowthBps,
        marketCapIdr: item.fundamentals.marketCapIdr,
        adtvIdr: item.fundamentals.adtvIdr,
        roaBps: item.fundamentals.roaBps,
        roicBps: item.fundamentals.roicBps,
        operatingMarginBps: item.fundamentals.operatingMarginBps,
        netMarginBps: item.fundamentals.netMarginBps,
        revenueGrowthBps: item.fundamentals.revenueGrowthBps,
        netIncomeGrowthBps: item.fundamentals.netIncomeGrowthBps,
        currentRatioX100: item.fundamentals.currentRatioX100,
        netDebtToEbitdaX100: item.fundamentals.netDebtToEbitdaX100,
        equityToAssetsBps: item.fundamentals.equityToAssetsBps,
        wholesaleDerX100: item.fundamentals.wholesaleDerX100,
        cfoToNiX100: item.fundamentals.cfoToNiX100,
        fcfMarginBps: item.fundamentals.fcfMarginBps,
        fcfYieldBps: item.fundamentals.fcfYieldBps,
        cfoPositive: item.fundamentals.cfoPositive,
        fcfPositive: item.fundamentals.fcfPositive,
        piotroskiFScore: item.fundamentals.piotroskiFScore,
        altmanZX100: item.fundamentals.altmanZX100,
        updatedAt: item.fundamentals.updatedAt,
      }),
    ]);
  }

  async update(
    id: string,
    userId: string,
    itemPatch: Partial<{
      ticker: string;
      companyName: string;
      sector: IdxSector;
      currentPrice: number;
      ownedLots: number;
      avgBuyPrice: number | null;
      avgBuyPriceX100: number | null;
      holdingTranchesJson: string | null;
      targetBuyPrice: number | null;
      investmentThesis: string | null;
      updatedAt: number;
    }>,
    fundamentalsPatch?: Partial<Omit<FundamentalsRecord, 'id' | 'watchlistItemId'>>,
  ): Promise<void> {
    const updateItemStmt = this.db
      .update(schema.watchlistItems)
      .set(itemPatch)
      .where(
        and(
          eq(schema.watchlistItems.id, id),
          eq(schema.watchlistItems.userId, userId),
          isNull(schema.watchlistItems.deletedAt),
        ),
      );

    if (fundamentalsPatch) {
      const ownedItemSubquery = this.db
        .select({ id: schema.watchlistItems.id })
        .from(schema.watchlistItems)
        .where(
          and(
            eq(schema.watchlistItems.id, id),
            eq(schema.watchlistItems.userId, userId),
            isNull(schema.watchlistItems.deletedAt),
          ),
        );

      const updateFundamentalsStmt = this.db
        .update(schema.stockFundamentals)
        .set(fundamentalsPatch)
        .where(inArray(schema.stockFundamentals.watchlistItemId, ownedItemSubquery));

      await this.db.batch([updateItemStmt, updateFundamentalsStmt]);
    } else {
      await updateItemStmt;
    }
  }

  async batchUpdateMarketData(
    userId: string,
    updates: Array<{
      id: string;
      currentPrice: number;
      updatedAt: number;
      fundamentalsPatch: Partial<Omit<FundamentalsRecord, 'id' | 'watchlistItemId'>>;
    }>,
  ): Promise<void> {
    if (updates.length === 0) return;

    // 25 items = 50 statements per D1 batch (eliminates N+1 sequential round-trips)
    const CHUNK_SIZE = 25;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const slice = updates.slice(i, i + CHUNK_SIZE);
      const statements = slice.flatMap((entry) => {
        const ownedItemSubquery = this.db
          .select({ id: schema.watchlistItems.id })
          .from(schema.watchlistItems)
          .where(
            and(
              eq(schema.watchlistItems.id, entry.id),
              eq(schema.watchlistItems.userId, userId),
              isNull(schema.watchlistItems.deletedAt),
            ),
          );

        return [
          this.db
            .update(schema.watchlistItems)
            .set({
              currentPrice: entry.currentPrice,
              updatedAt: entry.updatedAt,
            })
            .where(
              and(
                eq(schema.watchlistItems.id, entry.id),
                eq(schema.watchlistItems.userId, userId),
                isNull(schema.watchlistItems.deletedAt),
              ),
            ),
          this.db
            .update(schema.stockFundamentals)
            .set(entry.fundamentalsPatch)
            .where(inArray(schema.stockFundamentals.watchlistItemId, ownedItemSubquery)),
        ];
      });

      if (statements.length > 0) {
        await this.db.batch(statements as [typeof statements[0], ...typeof statements]);
      }
    }
  }

  async softDelete(id: string, userId: string, deletedAtMs: number): Promise<boolean> {
    const updated = await this.db
      .update(schema.watchlistItems)
      .set({
        deletedAt: deletedAtMs,
        updatedAt: deletedAtMs,
      })
      .where(
        and(
          eq(schema.watchlistItems.id, id),
          eq(schema.watchlistItems.userId, userId),
          isNull(schema.watchlistItems.deletedAt),
        ),
      )
      .returning({ id: schema.watchlistItems.id });

    return updated.length > 0;
  }
}
