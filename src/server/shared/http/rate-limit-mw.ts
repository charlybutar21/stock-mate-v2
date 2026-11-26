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

function resolveClientIdentifier(c: Parameters<MiddlewareHandler<AppEnv>>[0], keyBy: 'ip' | 'userOrIp'): string {
  if (keyBy === 'userOrIp') {
    const userId = c.get('user')?.id;
    if (userId) return `u:${userId}`;
  }
  const cfIp = c.req.header('cf-connecting-ip')?.trim();
  if (cfIp && cfIp.length <= 64) return `ip:${cfIp}`;

  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded && forwarded.length <= 64) return `ip:${forwarded}`;

  return 'ip:local';
}

/**
 * Bounded in-memory fixed-window rate limiter for Cloudflare Worker isolates.
 * Protects authentication and external-fetch endpoints against brute-force and abuse
 * while bounding internal Map size to prevent memory-exhaustion DoS.
 */
export function createRateLimitMiddleware(
  options: RateLimitOptions,
): MiddlewareHandler<AppEnv> {
  const buckets = new Map<string, RateBucket>();
  const maxTrackedKeys = options.maxTrackedKeys ?? 2000;
  const keyBy = options.keyBy ?? 'ip';
  const keyPrefix = options.keyPrefix ?? '';

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
