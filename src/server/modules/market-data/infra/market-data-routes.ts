import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthRepository, PasswordHasher } from '@/server/modules/auth/domain/auth.types';
import { createAuthMiddleware } from '@/server/shared/http/auth-mw';
import { zodToValidationError } from '@/server/shared/http/problem';
import type { AppEnv } from '@/server/shared/types';
import type { IdxMarketDataProvider } from '../domain/market-data.types';

const tickerParamSchema = z.object({
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}$/, 'Must be a 4-letter IDX ticker (e.g. BBCA)'),
});

export function createMarketDataRoutes(
  getDeps: (db: D1Database) => {
    authRepo: AuthRepository;
    hasher: PasswordHasher;
    marketDataProvider: IdxMarketDataProvider;
  },
): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  const requireAuth = createAuthMiddleware(getDeps);

  router.use('*', requireAuth);

  router.get('/idx/:ticker', async (c) => {
    const parsed = tickerParamSchema.safeParse({ ticker: c.req.param('ticker') });
    if (!parsed.success) {
      throw zodToValidationError(parsed.error);
    }

    const { marketDataProvider } = getDeps(c.env.DB);
    const quote = await marketDataProvider.fetchIdxQuote(parsed.data.ticker);

    return c.json({ quote }, 200);
  });

  return router;
}
