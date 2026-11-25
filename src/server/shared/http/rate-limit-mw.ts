import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';
import { tooManyRequestsError } from './problem';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  maxTrackedKeys?: number;
}

interface RateBucket {
  count: number;
  resetAtMs: number;
}

/**
 * Bounded in-memory fixed-window rate limiter for Cloudflare Worker isolates.
 * Protects PBKDF2 authentication endpoints against brute-force and credential stuffing
 * while bounding internal Map size to prevent memory-exhaustion DoS.
 */
export function createRateLimitMiddleware(
  options: RateLimitOptions,
): MiddlewareHandler<AppEnv> {
  const buckets = new Map<string, RateBucket>();
  const maxTrackedKeys = options.maxTrackedKeys ?? 2000;

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
    const clientIp =
      c.req.header('cf-connecting-ip') ??
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      'local';
    const path = new URL(c.req.url).pathname;
    const key = `${clientIp}:${path}`;

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
    const remaining = Math.max(0, options.maxRequests - bucket.count);
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAtMs - nowMs) / 1000));

    c.header('X-RateLimit-Limit', String(options.maxRequests));
    c.header('X-RateLimit-Remaining', String(remaining));

    if (bucket.count > options.maxRequests) {
      c.header('Retry-After', String(retryAfterSec));
      throw tooManyRequestsError(
        `Too many requests. Please wait ${retryAfterSec} seconds before retrying.`,
      );
    }

    await next();
  };
}
