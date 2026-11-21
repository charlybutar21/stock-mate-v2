import { and, desc, eq, isNull } from 'drizzle-orm';
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
      const updateFundamentalsStmt = this.db
        .update(schema.stockFundamentals)
        .set(fundamentalsPatch)
        .where(eq(schema.stockFundamentals.watchlistItemId, id));

      await this.db.batch([updateItemStmt, updateFundamentalsStmt]);
    } else {
      await updateItemStmt;
    }
  }

  async softDelete(id: string, userId: string, deletedAtMs: number): Promise<boolean> {
    const existing = await this.findByIdForUser(id, userId);
    if (!existing) return false;

    await this.db
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
      );

    return true;
  }
}
