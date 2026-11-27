import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';
import { tooManyRequestsError } from './problem';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  maxTrackedKeys?: number;
  keyBy?: 'ip' | 'userOrIp';
  keyPrefix?: string;
}

interface RateBucket {
  count: number;
  resetAtMs: number;
}

function resolveClientIdentifier(
  c: Parameters<MiddlewareHandler<AppEnv>>[0],
  keyBy: 'ip' | 'userOrIp',
): string {
  if (keyBy === 'userOrIp') {
    const userId = c.get('user')?.id;
    if (userId) return `u:${userId}`;
  }
  const cfIp = c.req.header('cf-connecting-ip')?.trim();
  if (cfIp && cfIp.length <= 64) return `ip:${cfIp}`;

  return 'ip:local';
}

/**
 * Distributed-ready fixed-window rate limiter:
 * - Uses Cloudflare KV (STOCK_MATE_KV) when bound for cross-PoP enforcement.
 * - Gracefully falls back to a memory-bounded per-isolate Map when KV is unbound (dev/tests).
 */
export function createRateLimitMiddleware(
  options: RateLimitOptions,
): MiddlewareHandler<AppEnv> {
  const buckets = new Map<string, RateBucket>();
  const maxTrackedKeys = options.maxTrackedKeys ?? 2000;
  const keyBy = options.keyBy ?? 'ip';
  const keyPrefix = options.keyPrefix ?? '';
  const windowSec = Math.max(1, Math.ceil(options.windowMs / 1000));

  const pruneExpired = (nowMs: number) => {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAtMs <= nowMs) {
        buckets.delete(key);
      }
    }
    while (buckets.size >= maxTrackedKeys) {
      const oldestKey = buckets.keys().next().value;
      if (!oldestKey) break;
      buckets.delete(oldestKey);
    }
  };

  return async (c, next) => {
    const nowMs = Date.now();
    const clientId = resolveClientIdentifier(c, keyBy);
    const scope = keyPrefix || new URL(c.req.url).pathname;
    const key = `${clientId}:${scope}`;
    const kv = c.env.STOCK_MATE_KV;

    let count = 0;
    let retryAfterSec = windowSec;

    if (kv) {
      const windowBucket = Math.floor(nowMs / options.windowMs);
      const kvKey = `rl:${scope}:${clientId}:${windowBucket}`;
      const resetAtMs = (windowBucket + 1) * options.windowMs;
      retryAfterSec = Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));

      try {
        const currentRaw = await kv.get(kvKey);
        const current = currentRaw ? Number.parseInt(currentRaw, 10) : 0;
        count = (Number.isFinite(current) ? current : 0) + 1;
        await kv.put(kvKey, String(count), {
          expirationTtl: Math.max(60, windowSec + 10),
        });
      } catch {
        // Fallback to local bucket if KV temporarily fails
        count = 0;
      }
    }

    if (count === 0) {
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAtMs <= nowMs) {
        if (buckets.size >= maxTrackedKeys) {
          pruneExpired(nowMs);
        }
        bucket = {
          count: 0,
          resetAtMs: nowMs + options.windowMs,
        };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      count = bucket.count;
      retryAfterSec = Math.max(1, Math.ceil((bucket.resetAtMs - nowMs) / 1000));
    }

    const remaining = Math.max(0, options.maxRequests - count);
    c.header('X-RateLimit-Limit', String(options.maxRequests));
    c.header('X-RateLimit-Remaining', String(remaining));

    if (count > options.maxRequests) {
      c.header('Retry-After', String(retryAfterSec));
      throw tooManyRequestsError(
        `Too many requests. Please wait ${retryAfterSec} seconds before retrying.`,
      );
    }

    await next();
  };
}
