import { Hono } from 'hono';
import {
  createWatchlistSchema,
  updateWatchlistSchema,
  watchlistQuerySchema,
} from '@/shared/contracts';
import type { AuthRepository, PasswordHasher } from '@/server/modules/auth/domain/auth.types';
import { createAuthMiddleware } from '@/server/shared/http/auth-mw';
import { validationError, zodToValidationError } from '@/server/shared/http/problem';
import type { AppEnv } from '@/server/shared/types';
import {
  CreateWatchlistItemUseCase,
  GetWatchlistItemUseCase,
  ListWatchlistUseCase,
  SoftDeleteWatchlistItemUseCase,
  UpdateWatchlistItemUseCase,
} from '../application/watchlist-use-cases';
import type { WatchlistRepository } from '../domain/watchlist.types';

export function createWatchlistRoutes(
  getDeps: (db: D1Database) => {
    authRepo: AuthRepository;
    hasher: PasswordHasher;
    watchlistRepo: WatchlistRepository;
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

  router.get('/:id', async (c) => {
    const user = c.get('user')!;
    const id = c.req.param('id');
    const { watchlistRepo } = getDeps(c.env.DB);
    const useCase = new GetWatchlistItemUseCase(watchlistRepo);
    const item = await useCase.execute(user.id, id);

    return c.json({ item }, 200);
  });

  router.patch('/:id', async (c) => {
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
    const id = c.req.param('id');
    const { watchlistRepo } = getDeps(c.env.DB);
    const useCase = new UpdateWatchlistItemUseCase(watchlistRepo);
    const item = await useCase.execute(user.id, id, parsed.data);

    return c.json({ item }, 200);
  });

  router.delete('/:id', async (c) => {
    const user = c.get('user')!;
    const id = c.req.param('id');
    const { watchlistRepo } = getDeps(c.env.DB);
    const useCase = new SoftDeleteWatchlistItemUseCase(watchlistRepo);
    await useCase.execute(user.id, id);

    return c.body(null, 204);
  });

  return router;
}
