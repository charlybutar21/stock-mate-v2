import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthRepository, PasswordHasher } from '@/server/modules/auth/domain/auth.types';
import type { IdxCatalogRepository } from '@/server/modules/watchlist/domain/watchlist.types';
import { createAuthMiddleware } from '@/server/shared/http/auth-mw';
import { zodToValidationError } from '@/server/shared/http/problem';
import { createRateLimitMiddleware } from '@/server/shared/http/rate-limit-mw';
import type { SessionRevocationStore } from '@/server/shared/http/session-token';
import type { AppEnv } from '@/server/shared/types';
import { GetIdxQuoteUseCase } from '../application/get-idx-quote-use-case';
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
    revocationStore: SessionRevocationStore;
    idxCatalogRepo: IdxCatalogRepository;
    marketDataProvider: IdxMarketDataProvider;
  },
): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  const requireAuth = createAuthMiddleware(getDeps);
  const marketDataRateLimiter = createRateLimitMiddleware({
    maxRequests: 60,
    windowMs: 60_000,
    keyBy: 'userOrIp',
    keyPrefix: 'market-data:idx',
  });

  router.use('*', requireAuth);

  router.get('/idx/:ticker', marketDataRateLimiter, async (c) => {
    const parsed = tickerParamSchema.safeParse({ ticker: c.req.param('ticker') });
    if (!parsed.success) {
      throw zodToValidationError(parsed.error);
    }

    const { marketDataProvider, idxCatalogRepo } = getDeps(c.env.DB);
    const useCase = new GetIdxQuoteUseCase(marketDataProvider, idxCatalogRepo);
    const quote = await useCase.execute(parsed.data.ticker);

    return c.json({ quote }, 200);
  });

  return router;
}
