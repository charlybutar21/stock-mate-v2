import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@/server/shared/db/schema';
import type {
  CustomWatchlistRecord,
  CustomWatchlistRepository,
} from '../domain/watchlist.types';

export class D1CustomWatchlistRepository implements CustomWatchlistRepository {
  constructor(private readonly db: DrizzleD1Database<typeof schema>) {}

  async listByUser(userId: string): Promise<CustomWatchlistRecord[]> {
    const groups = await this.db
      .select()
      .from(schema.customWatchlists)
      .where(
        and(
          eq(schema.customWatchlists.userId, userId),
          isNull(schema.customWatchlists.deletedAt),
        ),
      )
      .orderBy(asc(schema.customWatchlists.createdAt));

    if (groups.length === 0) return [];

    const groupIds = groups.map((g) => g.id);
    const links = await this.db
      .select()
      .from(schema.customWatchlistStocks)
      .where(inArray(schema.customWatchlistStocks.watchlistId, groupIds))
      .orderBy(asc(schema.customWatchlistStocks.addedAt));

    const tickersByGroup = new Map<string, string[]>();
    for (const link of links) {
      const existing = tickersByGroup.get(link.watchlistId) ?? [];
      existing.push(link.ticker);
      tickersByGroup.set(link.watchlistId, existing);
    }

    return groups.map((g) => ({
      id: g.id,
      userId: g.userId,
      name: g.name,
      description: g.description,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      deletedAt: g.deletedAt,
      tickers: tickersByGroup.get(g.id) ?? [],
    }));
  }

  async countActiveByUser(userId: string): Promise<number> {
    const rows = await this.db
      .select({ total: count() })
      .from(schema.customWatchlists)
      .where(
        and(
          eq(schema.customWatchlists.userId, userId),
          isNull(schema.customWatchlists.deletedAt),
        ),
      );
    return Number(rows[0]?.total ?? 0);
  }

  async findByIdForUser(id: string, userId: string): Promise<CustomWatchlistRecord | null> {
    const rows = await this.db
      .select()
      .from(schema.customWatchlists)
      .where(
        and(
          eq(schema.customWatchlists.id, id),
          eq(schema.customWatchlists.userId, userId),
          isNull(schema.customWatchlists.deletedAt),
        ),
      )
      .limit(1);

    const group = rows[0];
    if (!group) return null;

    const links = await this.db
      .select({ ticker: schema.customWatchlistStocks.ticker })
      .from(schema.customWatchlistStocks)
      .where(eq(schema.customWatchlistStocks.watchlistId, group.id))
      .orderBy(asc(schema.customWatchlistStocks.addedAt));

    return {
      id: group.id,
      userId: group.userId,
      name: group.name,
      description: group.description,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      deletedAt: group.deletedAt,
      tickers: links.map((l) => l.ticker),
    };
  }

  async findActiveByUserAndName(userId: string, name: string): Promise<{ id: string } | null> {
    const rows = await this.db
      .select({ id: schema.customWatchlists.id })
      .from(schema.customWatchlists)
      .where(
        and(
          eq(schema.customWatchlists.userId, userId),
          isNull(schema.customWatchlists.deletedAt),
          sql`lower(${schema.customWatchlists.name}) = lower(${name})`,
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async create(
    group: Omit<CustomWatchlistRecord, 'deletedAt'>,
    addedAtMs: number,
  ): Promise<void> {
    const insertGroup = this.db.insert(schema.customWatchlists).values({
      id: group.id,
      userId: group.userId,
      name: group.name,
      description: group.description,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      deletedAt: null,
    });

    if (group.tickers.length === 0) {
      await insertGroup;
      return;
    }

    const insertLinks = group.tickers.map((ticker, idx) =>
      this.db
        .insert(schema.customWatchlistStocks)
        .values({
          watchlistId: group.id,
          ticker,
          addedAt: addedAtMs + idx,
        })
        .onConflictDoNothing(),
    );

    // Chunk batch statements safely for D1
    const firstChunk = insertLinks.slice(0, 49);
    await this.db.batch([insertGroup, ...firstChunk]);

    for (let i = 49; i < insertLinks.length; i += 50) {
      const slice = insertLinks.slice(i, i + 50);
      await this.db.batch(slice as [typeof slice[0], ...typeof slice]);
    }
  }

  async update(
    id: string,
    userId: string,
    patch: { name?: string; description?: string | null; updatedAt: number },
  ): Promise<void> {
    await this.db
      .update(schema.customWatchlists)
      .set(patch)
      .where(
        and(
          eq(schema.customWatchlists.id, id),
          eq(schema.customWatchlists.userId, userId),
          isNull(schema.customWatchlists.deletedAt),
        ),
      );
  }

  async softDelete(id: string, userId: string, deletedAtMs: number): Promise<boolean> {
    const existing = await this.findByIdForUser(id, userId);
    if (!existing) return false;

    await this.db
      .update(schema.customWatchlists)
      .set({
        deletedAt: deletedAtMs,
        updatedAt: deletedAtMs,
      })
      .where(
        and(
          eq(schema.customWatchlists.id, id),
          eq(schema.customWatchlists.userId, userId),
          isNull(schema.customWatchlists.deletedAt),
        ),
      );

    return true;
  }

  async addTicker(watchlistId: string, ticker: string, addedAtMs: number): Promise<boolean> {
    const existing = await this.db
      .select({ ticker: schema.customWatchlistStocks.ticker })
      .from(schema.customWatchlistStocks)
      .where(
        and(
          eq(schema.customWatchlistStocks.watchlistId, watchlistId),
          eq(schema.customWatchlistStocks.ticker, ticker),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return false;
    }

    await this.db.batch([
      this.db
        .insert(schema.customWatchlistStocks)
        .values({ watchlistId, ticker, addedAt: addedAtMs }),
      this.db
        .update(schema.customWatchlists)
        .set({ updatedAt: addedAtMs })
        .where(eq(schema.customWatchlists.id, watchlistId)),
    ]);

    return true;
  }

  async removeTicker(watchlistId: string, ticker: string): Promise<boolean> {
    const existing = await this.db
      .select({ ticker: schema.customWatchlistStocks.ticker })
      .from(schema.customWatchlistStocks)
      .where(
        and(
          eq(schema.customWatchlistStocks.watchlistId, watchlistId),
          eq(schema.customWatchlistStocks.ticker, ticker),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      return false;
    }

    await this.db.batch([
      this.db
        .delete(schema.customWatchlistStocks)
        .where(
          and(
            eq(schema.customWatchlistStocks.watchlistId, watchlistId),
            eq(schema.customWatchlistStocks.ticker, ticker),
          ),
        ),
      this.db
        .update(schema.customWatchlists)
        .set({ updatedAt: Date.now() })
        .where(eq(schema.customWatchlists.id, watchlistId)),
    ]);

    return true;
  }
}
