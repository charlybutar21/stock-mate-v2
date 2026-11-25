import { Hono } from 'hono';
import {
  createWatchlistSchema,
  updateWatchlistSchema,
  watchlistQuerySchema,
} from '@/shared/contracts';
import type { AuthRepository, PasswordHasher } from '@/server/modules/auth/domain/auth.types';
import type { IdxMarketDataProvider } from '@/server/modules/market-data/domain/market-data.types';
import { createAuthMiddleware } from '@/server/shared/http/auth-mw';
import {
  notFoundError,
  validationError,
  zodToValidationError,
} from '@/server/shared/http/problem';
import type { AppEnv } from '@/server/shared/types';
import {
  CreateWatchlistItemUseCase,
  GetWatchlistItemUseCase,
  ListWatchlistUseCase,
  SoftDeleteWatchlistItemUseCase,
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
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      throw validationError('Request body must be valid JSON.');
    }

    const parsed = createWatchlistSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw zodToValidationError(parsed.error);
    }

    const user = c.get('user')!;
    const { watchlistRepo } = getDeps(c.env.DB);
    const useCase = new CreateWatchlistItemUseCase(watchlistRepo);
    const item = await useCase.execute(user.id, parsed.data);

    return c.json({ item }, 201);
  });

  router.post('/sync-all', async (c) => {
    const user = c.get('user')!;
    const { watchlistRepo, marketDataProvider } = getDeps(c.env.DB, c.env);
    const records = await watchlistRepo.listByUser(user.id);

    if (records.length === 0) {
      return c.json({ updatedCount: 0 }, 200);
    }

    const tickers = records.map((r) => r.ticker);
    const quotesMap = marketDataProvider.fetchIdxQuotesBatch
      ? await marketDataProvider.fetchIdxQuotesBatch(tickers)
      : new Map();

    const updateUseCase = new UpdateWatchlistItemUseCase(watchlistRepo);
    let updatedCount = 0;

    for (const record of records) {
      const quote = quotesMap.get(record.ticker);
      if (!quote) continue;
      await updateUseCase.execute(user.id, record.id, {
        currentPrice: quote.currentPrice,
        fundamentals: {
          periodLabel: quote.periodLabel,
          eps: quote.fundamentals.eps,
          bvps: quote.fundamentals.bvps,
          dps: quote.fundamentals.dps,
          roePct: quote.fundamentals.roePct,
          der: quote.fundamentals.der,
          epsGrowthPct: quote.fundamentals.epsGrowthPct,
        },
      });
      updatedCount++;
    }

    return c.json({ updatedCount }, 200);
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
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      throw validationError('Request body must be valid JSON.');
    }

    const parsed = updateWatchlistSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw zodToValidationError(parsed.error);
    }

    const user = c.get('user')!;
    const { watchlistRepo } = getDeps(c.env.DB);
    const useCase = new UpdateWatchlistItemUseCase(watchlistRepo);
    const item = await useCase.execute(user.id, id, parsed.data);

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
