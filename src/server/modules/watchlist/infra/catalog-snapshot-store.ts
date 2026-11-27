import type { CatalogSummaryDto, MarketStockDto } from '@/shared/contracts';
import type { IdxStockRecord } from '../domain/watchlist.types';
import { mapIdxStockToMarketDto } from '../application/watchlist-catalog-use-cases';

export const CATALOG_SNAPSHOT_KV_KEY = 'catalog:v4:latest';
const CATALOG_SNAPSHOT_KV_TTL_SECONDS = 12 * 60 * 60; // 12 hours
const ISOLATE_SNAPSHOT_TTL_MS = 30_000; // 30s hot in-isolate cache

export interface CatalogSnapshotPayload {
  version: 1;
  syncedAtMs: number;
  syncedAt: string;
  etag: string;
  summary: CatalogSummaryDto;
  items: MarketStockDto[];
}

export function buildCatalogSnapshot(
  stocks: IdxStockRecord[],
  syncedAtMs: number,
): CatalogSnapshotPayload {
  const items: MarketStockDto[] = stocks.map((stock) =>
    mapIdxStockToMarketDto(stock, [], syncedAtMs),
  );

  const summary: CatalogSummaryDto = {
    totalStocks: items.length,
    undervalued: 0,
    fairlyValued: 0,
    overvalued: 0,
    insufficientData: 0,
    qualityScored: 0,
    eliteQuality: 0,
    strongQuality: 0,
    primeOpportunities: 0,
    lastSyncedAt: syncedAtMs > 0 ? new Date(syncedAtMs).toISOString() : null,
  };

  for (const item of items) {
    if (item.valuation.valuationStatus === 'UNDERVALUED') summary.undervalued += 1;
    else if (item.valuation.valuationStatus === 'FAIRLY_VALUED') summary.fairlyValued += 1;
    else if (item.valuation.valuationStatus === 'OVERVALUED') summary.overvalued += 1;
    else summary.insufficientData += 1;

    if (item.quality.score !== null) {
      summary.qualityScored += 1;
      if (item.quality.grade === 'S') summary.eliteQuality += 1;
      else if (item.quality.grade === 'A') summary.strongQuality += 1;
    }
    if (item.quality.qarpQuadrant === 'PRIME_OPPORTUNITY') {
      summary.primeOpportunities += 1;
    }
  }

  return {
    version: 1,
    syncedAtMs,
    syncedAt: new Date(syncedAtMs).toISOString(),
    etag: `W/"cat-${syncedAtMs}-${items.length}"`,
    summary,
    items,
  };
}

/**
 * Tiered, stampede-safe catalog snapshot store:
 *   1. Hot in-isolate cache (30s) + single-flight promise coalescing
 *   2. Optional Cloudflare KV namespace (STOCK_MATE_KV) for edge-global 0-D1 reads
 *   3. D1 fallback when KV is unbound or cold
 *
 * Scoped per createApp() instance so isolated tests never leak state across runs.
 */
export class CatalogSnapshotStore {
  private hotSnapshot: { payload: CatalogSnapshotPayload; expiresAtMs: number } | null = null;
  private inFlightLoad: Promise<CatalogSnapshotPayload | null> | null = null;

  async getSnapshot(options: {
    kv?: KVNamespace;
    loadFromD1: () => Promise<{ stocks: IdxStockRecord[]; latestSyncedAt: number | null }>;
  }): Promise<{ snapshot: CatalogSnapshotPayload | null; cacheStatus: 'HOT' | 'KV' | 'D1' | 'EMPTY' }> {
    const now = Date.now();
    if (this.hotSnapshot && this.hotSnapshot.expiresAtMs > now) {
      return { snapshot: this.hotSnapshot.payload, cacheStatus: 'HOT' };
    }

    if (this.inFlightLoad) {
      const coalesced = await this.inFlightLoad;
      return { snapshot: coalesced, cacheStatus: coalesced ? 'HOT' : 'EMPTY' };
    }

    let resolvedSource: 'KV' | 'D1' | 'EMPTY' = 'EMPTY';
    const loadPromise = (async (): Promise<CatalogSnapshotPayload | null> => {
      if (options.kv) {
        try {
          const fromKv = await options.kv.get<CatalogSnapshotPayload>(
            CATALOG_SNAPSHOT_KV_KEY,
            'json',
          );
          if (fromKv && fromKv.version === 1 && Array.isArray(fromKv.items)) {
            this.hotSnapshot = {
              payload: fromKv,
              expiresAtMs: Date.now() + ISOLATE_SNAPSHOT_TTL_MS,
            };
            resolvedSource = 'KV';
            return fromKv;
          }
        } catch {
          // Graceful fallback to D1 when KV read fails
        }
      }

      const { stocks, latestSyncedAt } = await options.loadFromD1();
      if (stocks.length === 0) {
        return null;
      }

      const syncedAtMs = latestSyncedAt ?? Date.now();
      const built = buildCatalogSnapshot(stocks, syncedAtMs);
      this.hotSnapshot = {
        payload: built,
        expiresAtMs: Date.now() + ISOLATE_SNAPSHOT_TTL_MS,
      };
      resolvedSource = 'D1';

      if (options.kv) {
        try {
          await options.kv.put(CATALOG_SNAPSHOT_KV_KEY, JSON.stringify(built), {
            expirationTtl: CATALOG_SNAPSHOT_KV_TTL_SECONDS,
          });
        } catch {
          // Non-fatal: snapshot is already served from D1 & hot cache
        }
      }

      return built;
    })();

    this.inFlightLoad = loadPromise;
    try {
      const snapshot = await loadPromise;
      return { snapshot, cacheStatus: resolvedSource };
    } finally {
      this.inFlightLoad = null;
    }
  }

  async publishSnapshot(
    stocks: IdxStockRecord[],
    syncedAtMs: number,
    kv?: KVNamespace,
  ): Promise<CatalogSnapshotPayload> {
    const built = buildCatalogSnapshot(stocks, syncedAtMs);
    this.hotSnapshot = {
      payload: built,
      expiresAtMs: Date.now() + ISOLATE_SNAPSHOT_TTL_MS,
    };

    if (kv) {
      try {
        await kv.put(CATALOG_SNAPSHOT_KV_KEY, JSON.stringify(built), {
          expirationTtl: CATALOG_SNAPSHOT_KV_TTL_SECONDS,
        });
      } catch {
        // Non-fatal: D1 remains source of truth
      }
    }

    return built;
  }

  invalidateLocal(): void {
    this.hotSnapshot = null;
  }
}
