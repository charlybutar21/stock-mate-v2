import { Hono } from 'hono';
import {
  addCustomWatchlistStockSchema,
  catalogQuerySchema,
  createCustomWatchlistSchema,
  createWatchlistSchema,
  ensureWatchlistStockSchema,
  updateCustomWatchlistSchema,
  updateWatchlistSchema,
  watchlistQuerySchema,
} from '@/shared/contracts';
import type { AuthRepository, PasswordHasher } from '@/server/modules/auth/domain/auth.types';
import type { IdxMarketDataProvider } from '@/server/modules/market-data/domain/market-data.types';
import { createAuthMiddleware } from '@/server/shared/http/auth-mw';
import { parseJsonBody } from '@/server/shared/http/json-body';
import { forbiddenError, notFoundError, zodToValidationError } from '@/server/shared/http/problem';
import { createRateLimitMiddleware } from '@/server/shared/http/rate-limit-mw';
import type { SessionRevocationStore } from '@/server/shared/http/session-token';
import type { AppEnv } from '@/server/shared/types';
import type { CatalogSnapshotStore } from './catalog-snapshot-store';
import {
  AddStockToCustomWatchlistUseCase,
  CreateCustomWatchlistUseCase,
  DeleteCustomWatchlistUseCase,
  EnsureWatchlistItemUseCase,
  ListCatalogStocksUseCase,
  ListCustomWatchlistsUseCase,
  ListCustomWatchlistStocksUseCase,
  RemoveStockFromCustomWatchlistUseCase,
  SyncIdxCatalogUseCase,
  UpdateCustomWatchlistUseCase,
} from '../application/watchlist-catalog-use-cases';
import {
  CreateWatchlistItemUseCase,
  GetWatchlistItemUseCase,
  ListWatchlistUseCase,
  SoftDeleteWatchlistItemUseCase,
  SyncAllWatchlistUseCase,
  UpdateWatchlistItemUseCase,
} from '../application/watchlist-use-cases';
import type {
  CustomWatchlistRepository,
  IdxCatalogRepository,
  WatchlistRepository,
} from '../domain/watchlist.types';

const VALID_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const VALID_TICKER_REGEX = /^[A-Za-z]{4}$/;

function assertValidItemId(id: string, label = 'Watchlist item'): string {
  if (!VALID_ID_REGEX.test(id)) {
    throw notFoundError(`${label} not found.`);
  }
  return id;
}

function assertValidTickerParam(ticker: string): string {
  const clean = ticker.trim().toUpperCase();
  if (!VALID_TICKER_REGEX.test(clean)) {
    throw notFoundError('Ticker not found.');
  }
  return clean;
}

export function createWatchlistRoutes(
  getDeps: (
    db: D1Database,
    env?: { SECTORS_API_KEY?: string },
  ) => {
    authRepo: AuthRepository;
    hasher: PasswordHasher;
    revocationStore: SessionRevocationStore;
    watchlistRepo: WatchlistRepository;
    idxCatalogRepo: IdxCatalogRepository;
    customWatchlistRepo: CustomWatchlistRepository;
    marketDataProvider: IdxMarketDataProvider;
    snapshotStore: CatalogSnapshotStore;
  },
): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  const requireAuth = createAuthMiddleware(getDeps);
  const syncAllRateLimiter = createRateLimitMiddleware({
    maxRequests: 6,
    windowMs: 60_000,
    keyBy: 'userOrIp',
    keyPrefix: 'watchlist:sync-all',
  });
  const catalogSyncRateLimiter = createRateLimitMiddleware({
    maxRequests: 4,
    windowMs: 60_000,
    keyBy: 'userOrIp',
    keyPrefix: 'watchlist:catalog-sync',
  });

  router.use('*', requireAuth);

  // --- Personal Watchlist Items (My Stocks / Positions / Saved Benchmarks) ---

  router.get('/', async (c) => {
    const rawQuery = {
      search: c.req.query('search') || undefined,
      sector: c.req.query('sector') || undefined,
      sort: c.req.query('sort') || undefined,
    };
    const parsed = watchlistQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw zodToValidationError(parsed.error);
    }

    const user = c.get('user')!;
    const { watchlistRepo, idxCatalogRepo } = getDeps(c.env.DB);
    const useCase = new ListWatchlistUseCase(watchlistRepo, idxCatalogRepo);
    const items = await useCase.execute(user.id, parsed.data);

    return c.json({ items }, 200);
  });

  router.post('/', async (c) => {
    const input = await parseJsonBody(c, createWatchlistSchema);
    const user = c.get('user')!;
    const { watchlistRepo } = getDeps(c.env.DB);
    const useCase = new CreateWatchlistItemUseCase(watchlistRepo);
    const item = await useCase.execute(user.id, input);

    return c.json({ item }, 201);
  });

  router.post('/sync-all', syncAllRateLimiter, async (c) => {
    const user = c.get('user')!;
    const { watchlistRepo, idxCatalogRepo, marketDataProvider } = getDeps(c.env.DB, c.env);
    const useCase = new SyncAllWatchlistUseCase(watchlistRepo, marketDataProvider, idxCatalogRepo);
    const result = await useCase.execute(user.id);

    return c.json(result, 200);
  });

  router.post('/ensure', async (c) => {
    const input = await parseJsonBody(c, ensureWatchlistStockSchema);
    const user = c.get('user')!;
    const { watchlistRepo, idxCatalogRepo, marketDataProvider } = getDeps(c.env.DB, c.env);
    const useCase = new EnsureWatchlistItemUseCase(
      watchlistRepo,
      idxCatalogRepo,
      marketDataProvider,
    );
    const result = await useCase.execute(user.id, input.ticker);

    return c.json({ item: result.item }, result.created ? 201 : 200);
  });

  // --- All Stocks (Synced Active IHSG Constituents) ---

  router.get('/catalog', async (c) => {
    const rawQuery = {
      search: c.req.query('search') || undefined,
      sector: c.req.query('sector') || undefined,
      valuationStatus: c.req.query('valuationStatus') || undefined,
      minMos: c.req.query('minMos'),
      maxMos: c.req.query('maxMos'),
      qualityGrade: c.req.query('qualityGrade') || undefined,
      qarpQuadrant: c.req.query('qarpQuadrant') || undefined,
      minFqs: c.req.query('minFqs'),
      maxFqs: c.req.query('maxFqs'),
      minProfitability: c.req.query('minProfitability'),
      minGrowth: c.req.query('minGrowth'),
      minHealth: c.req.query('minHealth'),
      minCashFlow: c.req.query('minCashFlow'),
      minAdtvBillion: c.req.query('minAdtvBillion'),
      minPiotroski: c.req.query('minPiotroski'),
      excludeHighRiskTrap: c.req.query('excludeHighRiskTrap'),
      sort: c.req.query('sort') || undefined,
      page: c.req.query('page'),
      pageSize: c.req.query('pageSize'),
    };
    const parsed = catalogQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw zodToValidationError(parsed.error);
    }

    const user = c.get('user')!;
    const {
      idxCatalogRepo,
      watchlistRepo,
      customWatchlistRepo,
      marketDataProvider,
      snapshotStore,
    } = getDeps(c.env.DB, c.env);
    const useCase = new ListCatalogStocksUseCase(
      idxCatalogRepo,
      watchlistRepo,
      customWatchlistRepo,
      marketDataProvider,
      snapshotStore,
    );
    const result = await useCase.execute(user.id, parsed.data, c.env.STOCK_MATE_KV);

    return c.json(result, 200);
  });

  router.post('/catalog/sync', catalogSyncRateLimiter, async (c) => {
    // When CATALOG_SYNC_SECRET is configured in production, restrict global TradingView scrape
    // to background Cron/Admin callers to eliminate public write-amplification DoS.
    if (c.env.CATALOG_SYNC_SECRET) {
      const authHeader = c.req.header('authorization') ?? '';
      if (authHeader !== `Bearer ${c.env.CATALOG_SYNC_SECRET}`) {
        throw forbiddenError(
          'Global IHSG catalog sync runs automatically in background. Admin authorization required.',
        );
      }
    }

    const user = c.get('user')!;
    const { idxCatalogRepo, watchlistRepo, marketDataProvider, snapshotStore } = getDeps(
      c.env.DB,
      c.env,
    );
    const useCase = new SyncIdxCatalogUseCase(
      idxCatalogRepo,
      watchlistRepo,
      marketDataProvider,
      snapshotStore,
    );
    const result = await useCase.execute(user.id, c.env.STOCK_MATE_KV);

    return c.json(result, 200);
  });

  // --- Custom Watchlist Groups ---

  router.get('/groups', async (c) => {
    const user = c.get('user')!;
    const { customWatchlistRepo } = getDeps(c.env.DB);
    const useCase = new ListCustomWatchlistsUseCase(customWatchlistRepo);
    const groups = await useCase.execute(user.id);

    return c.json({ groups }, 200);
  });

  router.post('/groups', async (c) => {
    const input = await parseJsonBody(c, createCustomWatchlistSchema);
    const user = c.get('user')!;
    const { customWatchlistRepo, idxCatalogRepo, watchlistRepo, marketDataProvider } = getDeps(
      c.env.DB,
      c.env,
    );
    const useCase = new CreateCustomWatchlistUseCase(
      customWatchlistRepo,
      idxCatalogRepo,
      watchlistRepo,
      marketDataProvider,
    );
    const group = await useCase.execute(user.id, input);

    return c.json({ group }, 201);
  });

  router.patch('/groups/:groupId', async (c) => {
    const groupId = assertValidItemId(c.req.param('groupId'), 'Custom watchlist');
    const input = await parseJsonBody(c, updateCustomWatchlistSchema);
    const user = c.get('user')!;
    const { customWatchlistRepo } = getDeps(c.env.DB);
    const useCase = new UpdateCustomWatchlistUseCase(customWatchlistRepo);
    const group = await useCase.execute(user.id, groupId, input);

    return c.json({ group }, 200);
  });

  router.delete('/groups/:groupId', async (c) => {
    const groupId = assertValidItemId(c.req.param('groupId'), 'Custom watchlist');
    const user = c.get('user')!;
    const { customWatchlistRepo } = getDeps(c.env.DB);
    const useCase = new DeleteCustomWatchlistUseCase(customWatchlistRepo);
    await useCase.execute(user.id, groupId);

    return c.body(null, 204);
  });

  router.get('/groups/:groupId/stocks', async (c) => {
    const groupId = assertValidItemId(c.req.param('groupId'), 'Custom watchlist');
    const rawQuery = {
      search: c.req.query('search') || undefined,
      sector: c.req.query('sector') || undefined,
      valuationStatus: c.req.query('valuationStatus') || undefined,
      qualityGrade: c.req.query('qualityGrade') || undefined,
      minFqs: c.req.query('minFqs'),
      maxFqs: c.req.query('maxFqs'),
      minMos: c.req.query('minMos'),
      maxMos: c.req.query('maxMos'),
      sort: c.req.query('sort') || undefined,
      page: 1,
      pageSize: 100,
    };
    const parsed = catalogQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw zodToValidationError(parsed.error);
    }

    const user = c.get('user')!;
    const { customWatchlistRepo, idxCatalogRepo, watchlistRepo } = getDeps(c.env.DB);
    const useCase = new ListCustomWatchlistStocksUseCase(
      customWatchlistRepo,
      idxCatalogRepo,
      watchlistRepo,
    );
    const result = await useCase.execute(user.id, groupId, parsed.data);

    return c.json(result, 200);
  });

  router.post('/groups/:groupId/stocks', async (c) => {
    const groupId = assertValidItemId(c.req.param('groupId'), 'Custom watchlist');
    const input = await parseJsonBody(c, addCustomWatchlistStockSchema);
    const user = c.get('user')!;
    const { customWatchlistRepo, idxCatalogRepo, watchlistRepo, marketDataProvider } = getDeps(
      c.env.DB,
      c.env,
    );
    const useCase = new AddStockToCustomWatchlistUseCase(
      customWatchlistRepo,
      idxCatalogRepo,
      watchlistRepo,
      marketDataProvider,
    );
    const item = await useCase.execute(user.id, groupId, input);

    return c.json({ item }, 201);
  });

  router.delete('/groups/:groupId/stocks/:ticker', async (c) => {
    const groupId = assertValidItemId(c.req.param('groupId'), 'Custom watchlist');
    const ticker = assertValidTickerParam(c.req.param('ticker'));
    const user = c.get('user')!;
    const { customWatchlistRepo } = getDeps(c.env.DB);
    const useCase = new RemoveStockFromCustomWatchlistUseCase(customWatchlistRepo);
    await useCase.execute(user.id, groupId, ticker);

    return c.body(null, 204);
  });

  // --- Single Personal Watchlist Item Routes (registered after static prefixes) ---

  router.get('/:id', async (c) => {
    const user = c.get('user')!;
    const id = assertValidItemId(c.req.param('id'));
    const { watchlistRepo, idxCatalogRepo } = getDeps(c.env.DB);
    const useCase = new GetWatchlistItemUseCase(watchlistRepo, idxCatalogRepo);
    const item = await useCase.execute(user.id, id);

    return c.json({ item }, 200);
  });

  router.patch('/:id', async (c) => {
    const id = assertValidItemId(c.req.param('id'));
    const input = await parseJsonBody(c, updateWatchlistSchema);
    const user = c.get('user')!;
    const { watchlistRepo } = getDeps(c.env.DB);
    const useCase = new UpdateWatchlistItemUseCase(watchlistRepo);
    const item = await useCase.execute(user.id, id, input);

    return c.json({ item }, 200);
  });

  router.delete('/:id', async (c) => {
    const user = c.get('user')!;
    const id = assertValidItemId(c.req.param('id'));
    const { watchlistRepo } = getDeps(c.env.DB);
    const useCase = new SoftDeleteWatchlistItemUseCase(watchlistRepo);
    await useCase.execute(user.id, id);

    return c.body(null, 204);
  });

  return router;
}
