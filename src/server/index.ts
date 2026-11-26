import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import * as schema from './shared/db/schema';
import { MAX_JSON_BODY_BYTES } from './shared/http/json-body';
import {
  AppError,
  forbiddenError,
  notFoundError,
  payloadTooLargeError,
  problemResponse,
  unsupportedMediaTypeError,
} from './shared/http/problem';
import { logJson } from './shared/logger';
import type { AppEnv } from './shared/types';
import { D1AuthRepository } from './modules/auth/infra/d1-auth-repository';
import { WebCryptoHasher } from './modules/auth/infra/web-crypto-hasher';
import { createAuthRoutes } from './modules/auth/infra/auth-routes';
import { D1WatchlistRepository } from './modules/watchlist/infra/d1-watchlist-repository';
import { createWatchlistRoutes } from './modules/watchlist/infra/watchlist-routes';
import type { IdxMarketDataProvider } from './modules/market-data/domain/market-data.types';
import {
  CompositeIdxMarketDataProvider,
  SectorsIdxProvider,
} from './modules/market-data/infra/sectors-provider';
import { TradingViewIdxProvider } from './modules/market-data/infra/tradingview-provider';
import { YahooFinanceIdxProvider } from './modules/market-data/infra/yahoo-finance-provider';
import { createMarketDataRoutes } from './modules/market-data/infra/market-data-routes';

const SAFE_CORRELATION_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const JSON_BODY_FREE_POST_PATHS = new Set([
  '/api/v1/auth/logout',
  '/api/v1/watchlist/sync-all',
]);

function extractOriginFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function createApp(options?: {
  marketDataProvider?: IdxMarketDataProvider;
  authRateLimitMax?: number;
  authRateLimitWindowMs?: number;
}) {
  const app = new Hono<AppEnv>();
  const hasher = new WebCryptoHasher();
  const tradingViewProvider = new TradingViewIdxProvider();
  const yahooProvider = new YahooFinanceIdxProvider();
  const defaultFreeProvider = new CompositeIdxMarketDataProvider(
    tradingViewProvider,
    yahooProvider,
  );

  const getDeps = (d1: D1Database, env?: { SECTORS_API_KEY?: string }) => {
    const db = drizzle(d1, { schema });
    const marketDataProvider: IdxMarketDataProvider =
      options?.marketDataProvider ??
      (env?.SECTORS_API_KEY
        ? new CompositeIdxMarketDataProvider(
            new SectorsIdxProvider(env.SECTORS_API_KEY),
            defaultFreeProvider,
          )
        : defaultFreeProvider);

    return {
      authRepo: new D1AuthRepository(db),
      watchlistRepo: new D1WatchlistRepository(db),
      hasher,
      marketDataProvider,
    };
  };

  // 1. Correlation ID Sanitization & Structured Request Logging (zero PII, anti-log-injection)
  app.use('/api/*', async (c, next) => {
    const incomingId = c.req.header('x-correlation-id');
    const correlationId =
      incomingId && SAFE_CORRELATION_ID_REGEX.test(incomingId)
        ? incomingId
        : `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    c.set('correlationId', correlationId);
    c.header('x-correlation-id', correlationId);
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');

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

  // 2. Hardened Security Headers (HSTS, CSP, X-Frame-Options: DENY, nosniff, Permissions-Policy)
  app.use(
    '/api/*',
    secureHeaders({
      xFrameOptions: 'DENY',
      referrerPolicy: 'strict-origin-when-cross-origin',
      strictTransportSecurity: 'max-age=31536000; includeSubDomains',
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
      },
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    }),
  );

  // 3. Defense-in-Depth Same-Origin CSRF (Origin + Referer + Fetch Metadata), Size & Media-Type Guard
  app.use('/api/*', async (c, next) => {
    const method = c.req.method.toUpperCase();
    const isMutating =
      method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

    if (isMutating) {
      const expectedOrigin = new URL(c.req.url).origin;
      const originHeader = c.req.header('origin');
      const refererOrigin = extractOriginFromReferer(c.req.header('referer'));
      const fetchSite = c.req.header('sec-fetch-site')?.toLowerCase();

      if (originHeader && originHeader !== expectedOrigin) {
        throw forbiddenError('Cross-origin state-changing request blocked by CSRF policy.');
      }
      if (!originHeader && refererOrigin && refererOrigin !== expectedOrigin) {
        throw forbiddenError('Cross-origin referer blocked by CSRF policy.');
      }
      if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
        throw forbiddenError('Cross-site request blocked by Fetch Metadata policy.');
      }
      if (originHeader) {
        await csrf({
          origin: (origin) => origin === expectedOrigin,
        })(c, async () => {});
      }
    }

    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      const contentLengthHeader = c.req.header('content-length');
      if (contentLengthHeader) {
        const contentLength = Number.parseInt(contentLengthHeader, 10);
        if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
          throw payloadTooLargeError();
        }
      }

      const pathname = new URL(c.req.url).pathname;
      if (!JSON_BODY_FREE_POST_PATHS.has(pathname)) {
        const contentType = c.req.header('content-type') ?? '';
        if (!contentType.toLowerCase().includes('application/json')) {
          throw unsupportedMediaTypeError();
        }
      }
    }

    await next();
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
  app.route(
    '/api/v1/auth',
    createAuthRoutes(getDeps, {
      rateLimitMaxRequests: options?.authRateLimitMax,
      rateLimitWindowMs: options?.authRateLimitWindowMs,
    }),
  );
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

    if (err instanceof HTTPException) {
      return problemResponse(
        c,
        new AppError({
          status: err.status,
          type: 'https://stock-mate-v2/errors/http-error',
          title: err.status === 403 ? 'Forbidden' : 'Request Error',
          detail: err.message || 'Request rejected by security policy.',
        }),
      );
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
