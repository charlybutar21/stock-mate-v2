import { Hono } from 'hono';
import {
  createWatchlistSchema,
  updateWatchlistSchema,
  watchlistQuerySchema,
} from '@/shared/contracts';
import type { AuthRepository, PasswordHasher } from '@/server/modules/auth/domain/auth.types';
import type { IdxMarketDataProvider } from '@/server/modules/market-data/domain/market-data.types';
import { createAuthMiddleware } from '@/server/shared/http/auth-mw';
import { parseJsonBody } from '@/server/shared/http/json-body';
import { notFoundError, zodToValidationError } from '@/server/shared/http/problem';
import { createRateLimitMiddleware } from '@/server/shared/http/rate-limit-mw';
import type { AppEnv } from '@/server/shared/types';
import {
  CreateWatchlistItemUseCase,
  GetWatchlistItemUseCase,
  ListWatchlistUseCase,
  SoftDeleteWatchlistItemUseCase,
  SyncAllWatchlistUseCase,
  UpdateWatchlistItemUseCase,
} from '../application/watchlist-use-cases';
import type { WatchlistRepository } from '../domain/watchlist.types';

const VALID_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

function assertValidItemId(id: string): string {
  if (!VALID_ID_REGEX.test(id)) {
    throw notFoundError('Watchlist item not found.');
  }
  return id;
}

export function createWatchlistRoutes(
  getDeps: (
    db: D1Database,
    env?: { SECTORS_API_KEY?: string },
  ) => {
    authRepo: AuthRepository;
    hasher: PasswordHasher;
    watchlistRepo: WatchlistRepository;
    marketDataProvider: IdxMarketDataProvider;
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

  router.use('*', requireAuth);

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
    const { watchlistRepo } = getDeps(c.env.DB);
    const useCase = new ListWatchlistUseCase(watchlistRepo);
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
    const { watchlistRepo, marketDataProvider } = getDeps(c.env.DB, c.env);
    const useCase = new SyncAllWatchlistUseCase(watchlistRepo, marketDataProvider);
    const result = await useCase.execute(user.id);

    return c.json(result, 200);
  });

  router.get('/:id', async (c) => {
    const user = c.get('user')!;
    const id = assertValidItemId(c.req.param('id'));
    const { watchlistRepo } = getDeps(c.env.DB);
    const useCase = new GetWatchlistItemUseCase(watchlistRepo);
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
