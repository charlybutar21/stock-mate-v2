import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import * as schema from './shared/db/schema';
import { AppError, notFoundError, problemResponse } from './shared/http/problem';
import { logJson } from './shared/logger';
import type { AppEnv } from './shared/types';
import { D1AuthRepository } from './modules/auth/infra/d1-auth-repository';
import { WebCryptoHasher } from './modules/auth/infra/web-crypto-hasher';
import { createAuthRoutes } from './modules/auth/infra/auth-routes';
import { D1WatchlistRepository } from './modules/watchlist/infra/d1-watchlist-repository';
import { createWatchlistRoutes } from './modules/watchlist/infra/watchlist-routes';
import type { IdxMarketDataProvider } from './modules/market-data/domain/market-data.types';
import { YahooFinanceIdxProvider } from './modules/market-data/infra/yahoo-finance-provider';
import { createMarketDataRoutes } from './modules/market-data/infra/market-data-routes';

export function createApp(options?: { marketDataProvider?: IdxMarketDataProvider }) {
  const app = new Hono<AppEnv>();
  const hasher = new WebCryptoHasher();
  const marketDataProvider = options?.marketDataProvider ?? new YahooFinanceIdxProvider();

  const getDeps = (d1: D1Database) => {
    const db = drizzle(d1, { schema });
    return {
      authRepo: new D1AuthRepository(db),
      watchlistRepo: new D1WatchlistRepository(db),
      hasher,
      marketDataProvider,
    };
  };

  // Correlation ID & Structured Request Logging (zero PII)
  app.use('/api/*', async (c, next) => {
    const correlationId =
      c.req.header('x-correlation-id') ?? `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    c.set('correlationId', correlationId);
    c.header('x-correlation-id', correlationId);

    const start = Date.now();
    await next();
    const durationMs = Date.now() - start;

    logJson('info', 'http_request', correlationId, {
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      durationMs,
    });
  });

  // Health Check (Liveness & D1 Readiness)
  app.get('/api/v1/health', async (c) => {
    try {
      await c.env.DB.prepare('SELECT 1').first();
      return c.json({ status: 'ok', db: 'ok' }, 200);
    } catch {
      return problemResponse(
        c,
        new AppError({
          status: 503,
          type: 'https://stock-mate-v2/errors/service-unavailable',
          title: 'Service Unavailable',
          detail: 'Database readiness check failed.',
        }),
      );
    }
  });

  // Module Routes
  app.route('/api/v1/auth', createAuthRoutes(getDeps));
  app.route('/api/v1/watchlist', createWatchlistRoutes(getDeps));
  app.route('/api/v1/market-data', createMarketDataRoutes(getDeps));

  // API 404 Handler (RFC 7807)
  app.notFound((c) => {
    if (new URL(c.req.url).pathname.startsWith('/api/')) {
      return problemResponse(c, notFoundError('API endpoint not found.'));
    }
    return c.text('Not Found', 404);
  });

  // Global Error Handler (RFC 7807, zero stack trace leakage)
  app.onError((err, c) => {
    const correlationId = c.get('correlationId') ?? 'req_unknown';
    if (err instanceof AppError) {
      if (err.status >= 500) {
        logJson('error', 'app_error', correlationId, {
          status: err.status,
          type: err.type,
        });
      }
      return problemResponse(c, err);
    }

    logJson('error', 'unhandled_error', correlationId, {
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });

    return problemResponse(
      c,
      new AppError({
        status: 500,
        type: 'https://stock-mate-v2/errors/internal-server-error',
        title: 'Internal Server Error',
        detail: 'An unexpected error occurred.',
      }),
    );
  });

  return app;
}

const app = createApp();

export default app;
