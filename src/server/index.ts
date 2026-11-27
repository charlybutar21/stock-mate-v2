import { drizzle } from 'drizzle-orm/d1';
import { Hono, type Context } from 'hono';
import { csrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import * as schema from './shared/db/schema';
import {
  ACCESS_COOKIE_NAME,
  HOST_ACCESS_COOKIE_NAME,
  HOST_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from './shared/http/auth-mw';
import { MAX_JSON_BODY_BYTES } from './shared/http/json-body';
import {
  AppError,
  forbiddenError,
  notFoundError,
  payloadTooLargeError,
  problemResponse,
  unsupportedMediaTypeError,
} from './shared/http/problem';
import { SessionRevocationStore } from './shared/http/session-token';
import { logJson } from './shared/logger';
import type { AppBindings, AppEnv } from './shared/types';
import { D1AuthRepository } from './modules/auth/infra/d1-auth-repository';
import { WebCryptoHasher } from './modules/auth/infra/web-crypto-hasher';
import { createAuthRoutes } from './modules/auth/infra/auth-routes';
import { D1WatchlistRepository } from './modules/watchlist/infra/d1-watchlist-repository';
import { D1IdxCatalogRepository } from './modules/watchlist/infra/d1-idx-catalog-repository';
import { D1CustomWatchlistRepository } from './modules/watchlist/infra/d1-custom-watchlist-repository';
import { CatalogSnapshotStore } from './modules/watchlist/infra/catalog-snapshot-store';
import { SyncIdxCatalogUseCase } from './modules/watchlist/application/watchlist-catalog-use-cases';
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
  '/api/v1/watchlist/catalog/sync',
]);
const EDGE_SNAPSHOT_CACHE_CONTROL = 'public, max-age=60, s-maxage=120, stale-while-revalidate=300';

function extractOriginFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function hasAuthCookie(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;
  return (
    cookieHeader.includes(`${SESSION_COOKIE_NAME}=`) ||
    cookieHeader.includes(`${HOST_SESSION_COOKIE_NAME}=`) ||
    cookieHeader.includes(`${ACCESS_COOKIE_NAME}=`) ||
    cookieHeader.includes(`${HOST_ACCESS_COOKIE_NAME}=`)
  );
}

function getEdgeCache(): Cache | null {
  try {
    const cfCaches = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
    return cfCaches?.default ?? null;
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
  const revocationStore = new SessionRevocationStore();
  const snapshotStore = new CatalogSnapshotStore();
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
      idxCatalogRepo: new D1IdxCatalogRepository(db),
      customWatchlistRepo: new D1CustomWatchlistRepository(db),
      hasher,
      revocationStore,
      snapshotStore,
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

  // 2. Hardened Security Headers (HSTS, CSP, COOP, CORP, X-Frame-Options: DENY, nosniff, Permissions-Policy)
  app.use(
    '/api/*',
    secureHeaders({
      xFrameOptions: 'DENY',
      referrerPolicy: 'strict-origin-when-cross-origin',
      crossOriginOpenerPolicy: 'same-origin',
      crossOriginResourcePolicy: 'same-origin',
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

  // 3. Defense-in-Depth Same-Origin CSRF (Origin + Referer + Fetch Metadata + Custom Header), Size & Media-Type Guard
  app.use('/api/*', async (c, next) => {
    const method = c.req.method.toUpperCase();
    const isMutating =
      method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

    if (isMutating) {
      const expectedOrigin = new URL(c.req.url).origin;
      const originHeader = c.req.header('origin');
      const refererOrigin = extractOriginFromReferer(c.req.header('referer'));
      const fetchSite = c.req.header('sec-fetch-site')?.toLowerCase();
      const requestedWith = c.req.header('x-requested-with');

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

      // Close headerless CSRF gap on cookie-authenticated mutating requests (e.g. body-free POST /logout)
      if (hasAuthCookie(c.req.header('cookie'))) {
        const hasSameOriginProof =
          originHeader === expectedOrigin ||
          refererOrigin === expectedOrigin ||
          fetchSite === 'same-origin' ||
          requestedWith === 'StockMate';
        if (!hasSameOriginProof) {
          throw forbiddenError(
            'Missing same-origin verification header on cookie-authenticated mutating request.',
          );
        }
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

  // Liveness Check (Zero D1 hit — safe for high-frequency probes)
  app.get('/api/v1/health/live', (c) => {
    return c.json({ status: 'ok' }, 200);
  });

  // Readiness Check (D1 connectivity)
  const handleReadiness = async (c: Context<AppEnv>) => {
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
  };

  app.get('/api/v1/health', handleReadiness);
  app.get('/api/v1/health/ready', handleReadiness);

  // Shared Edge-Cached IHSG Catalog Snapshot (0 D1 hits at 100k concurrent users)
  app.get('/api/v1/catalog/snapshot', async (c) => {
    const edgeCache = getEdgeCache();
    const cacheKey = new Request(new URL('/api/v1/catalog/snapshot', c.req.url).toString(), {
      method: 'GET',
    });

    if (edgeCache) {
      const cachedRes = await edgeCache.match(cacheKey);
      if (cachedRes) {
        const cachedEtag = cachedRes.headers.get('etag');
        if (cachedEtag && c.req.header('if-none-match') === cachedEtag) {
          return new Response(null, {
            status: 304,
            headers: {
              ETag: cachedEtag,
              'Cache-Control': EDGE_SNAPSHOT_CACHE_CONTROL,
              'X-Catalog-Cache': 'EDGE-HIT',
            },
          });
        }
        const cloned = new Response(cachedRes.body, cachedRes);
        cloned.headers.set('X-Catalog-Cache', 'EDGE-HIT');
        return cloned;
      }
    }

    const { idxCatalogRepo, snapshotStore: store } = getDeps(c.env.DB, c.env);
    const { snapshot, cacheStatus } = await store.getSnapshot({
      kv: c.env.STOCK_MATE_KV,
      loadFromD1: async () => {
        const [stocks, latestSyncedAt] = await Promise.all([
          idxCatalogRepo.listAll(),
          idxCatalogRepo.getLatestSyncedAt(),
        ]);
        return { stocks, latestSyncedAt };
      },
    });

    if (!snapshot) {
      return c.json(
        {
          version: 1,
          syncedAt: null,
          summary: {
            totalStocks: 0,
            undervalued: 0,
            fairlyValued: 0,
            overvalued: 0,
            insufficientData: 0,
            qualityScored: 0,
            eliteQuality: 0,
            strongQuality: 0,
            primeOpportunities: 0,
            lastSyncedAt: null,
          },
          items: [],
        },
        200,
        {
          'Cache-Control': 'public, max-age=15, s-maxage=30',
          'X-Catalog-Cache': 'EMPTY',
        },
      );
    }

    // Stale-while-revalidate backup: if snapshot is >5m old or missing intraday openPrice,
    // trigger a single KV-locked background refresh without blocking the user response.
    const needsBgRefresh =
      Date.now() - snapshot.syncedAtMs >= CATALOG_SWR_MAX_AGE_MS ||
      (snapshot.items.length > 0 && snapshot.items[0]!.openPrice === null);
    if (needsBgRefresh) {
      try {
        c.executionCtx.waitUntil(triggerGuardedBackgroundSync(c.env));
      } catch {
        // Test environment without Cloudflare ExecutionContext
      }
    }

    if (c.req.header('if-none-match') === snapshot.etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: snapshot.etag,
          'Cache-Control': EDGE_SNAPSHOT_CACHE_CONTROL,
          'X-Catalog-Cache': `${cacheStatus}-304`,
        },
      });
    }

    const response = c.json(snapshot, 200, {
      ETag: snapshot.etag,
      'Cache-Control': EDGE_SNAPSHOT_CACHE_CONTROL,
      'X-Catalog-Cache': cacheStatus,
    });

    if (edgeCache) {
      const putPromise = edgeCache.put(cacheKey, response.clone());
      try {
        c.executionCtx.waitUntil(putPromise);
      } catch {
        // Ignore when running outside Workers ExecutionContext (tests)
      }
    }

    return response;
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

export async function runScheduledCatalogSync(env: AppBindings): Promise<void> {
  const correlationId = `cron_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const start = Date.now();
  const db = drizzle(env.DB, { schema });
  const tradingViewProvider = new TradingViewIdxProvider();
  const yahooProvider = new YahooFinanceIdxProvider();
  const freeProvider = new CompositeIdxMarketDataProvider(tradingViewProvider, yahooProvider);
  const marketDataProvider: IdxMarketDataProvider = env.SECTORS_API_KEY
    ? new CompositeIdxMarketDataProvider(new SectorsIdxProvider(env.SECTORS_API_KEY), freeProvider)
    : freeProvider;

  const snapshotStore = new CatalogSnapshotStore();
  const useCase = new SyncIdxCatalogUseCase(
    new D1IdxCatalogRepository(db),
    new D1WatchlistRepository(db),
    marketDataProvider,
    snapshotStore,
  );

  try {
    const result = await useCase.execute(undefined, env.STOCK_MATE_KV);
    logJson('info', 'cron_catalog_sync_completed', correlationId, {
      syncedCount: result.syncedCount,
      durationMs: Date.now() - start,
      kvEnabled: Boolean(env.STOCK_MATE_KV),
    });
  } catch (err) {
    logJson('error', 'cron_catalog_sync_failed', correlationId, {
      errorName: err instanceof Error ? err.name : 'UnknownError',
      errorMessage: err instanceof Error ? err.message.slice(0, 160) : 'Unknown error',
      durationMs: Date.now() - start,
    });
  }
}

const CATALOG_SWR_MAX_AGE_MS = 5 * 60 * 1000;
const CATALOG_SYNC_LOCK_KEY = 'catalog:sync:lock';

async function triggerGuardedBackgroundSync(env: AppBindings): Promise<void> {
  if (env.STOCK_MATE_KV) {
    try {
      const existingLock = await env.STOCK_MATE_KV.get(CATALOG_SYNC_LOCK_KEY);
      if (existingLock) return;
      await env.STOCK_MATE_KV.put(CATALOG_SYNC_LOCK_KEY, String(Date.now()), {
        expirationTtl: 240,
      });
    } catch {
      // Proceed even if KV lock read/write fails
    }
  }
  await runScheduledCatalogSync(env);
}

export { CATALOG_SWR_MAX_AGE_MS, triggerGuardedBackgroundSync };

export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: AppBindings, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledCatalogSync(env));
  },
} satisfies ExportedHandler<AppBindings>;
