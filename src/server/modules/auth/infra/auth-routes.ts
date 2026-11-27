import { Hono } from 'hono';
import { loginRequestSchema, registerRequestSchema } from '@/shared/contracts';
import {
  LoginUseCase,
  LogoutUseCase,
  RegisterUseCase,
  SESSION_TTL_SECONDS,
} from '../application/auth-use-cases';
import type { AuthRepository, PasswordHasher } from '../domain/auth.types';
import {
  clearAuthCookies,
  createAuthMiddleware,
  getAccessCookieToken,
  getSessionCookieToken,
  isValidSessionTokenFormat,
  setAuthCookies,
} from '@/server/shared/http/auth-mw';
import { parseJsonBody } from '@/server/shared/http/json-body';
import { createRateLimitMiddleware } from '@/server/shared/http/rate-limit-mw';
import { verifyAccessToken, type SessionRevocationStore } from '@/server/shared/http/session-token';
import type { AppEnv } from '@/server/shared/types';

export function createAuthRoutes(
  getDeps: (db: D1Database) => {
    authRepo: AuthRepository;
    hasher: PasswordHasher;
    revocationStore: SessionRevocationStore;
  },
  options?: { rateLimitMaxRequests?: number; rateLimitWindowMs?: number },
): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  const requireAuth = createAuthMiddleware(getDeps);
  const authRateLimiter = createRateLimitMiddleware({
    maxRequests: options?.rateLimitMaxRequests ?? 15,
    windowMs: options?.rateLimitWindowMs ?? 60_000,
  });

  router.post('/register', authRateLimiter, async (c) => {
    const input = await parseJsonBody(c, registerRequestSchema);
    const { authRepo, hasher, revocationStore } = getDeps(c.env.DB);
    const priorRawCookie = getSessionCookieToken(c);
    const priorTokenHash = isValidSessionTokenFormat(priorRawCookie)
      ? await hasher.hashToken(priorRawCookie)
      : undefined;
    const priorAccessCookie = getAccessCookieToken(c);
    if (priorAccessCookie) {
      const priorClaims = await verifyAccessToken(priorAccessCookie, c.env.JWT_SECRET);
      if (priorClaims) {
        await revocationStore.revoke(priorClaims.sid, c.env.STOCK_MATE_KV);
      }
    }

    const useCase = new RegisterUseCase(authRepo, hasher);
    const { user, sessionId, rawSessionToken } = await useCase.execute(input, priorTokenHash);

    await setAuthCookies(c, {
      user,
      sessionId,
      rawSessionToken,
      sessionTtlSeconds: SESSION_TTL_SECONDS,
    });
    return c.json({ user }, 201);
  });

  router.post('/login', authRateLimiter, async (c) => {
    const input = await parseJsonBody(c, loginRequestSchema);
    const { authRepo, hasher, revocationStore } = getDeps(c.env.DB);
    const priorRawCookie = getSessionCookieToken(c);
    const priorTokenHash = isValidSessionTokenFormat(priorRawCookie)
      ? await hasher.hashToken(priorRawCookie)
      : undefined;
    const priorAccessCookie = getAccessCookieToken(c);
    if (priorAccessCookie) {
      const priorClaims = await verifyAccessToken(priorAccessCookie, c.env.JWT_SECRET);
      if (priorClaims) {
        await revocationStore.revoke(priorClaims.sid, c.env.STOCK_MATE_KV);
      }
    }

    const useCase = new LoginUseCase(authRepo, hasher);
    const { user, sessionId, rawSessionToken } = await useCase.execute(input, priorTokenHash);

    await setAuthCookies(c, {
      user,
      sessionId,
      rawSessionToken,
      sessionTtlSeconds: SESSION_TTL_SECONDS,
    });
    return c.json({ user }, 200);
  });

  router.post('/logout', async (c) => {
    const { authRepo, hasher, revocationStore } = getDeps(c.env.DB);
    const rawAccessCookie = getAccessCookieToken(c);
    if (rawAccessCookie) {
      const claims = await verifyAccessToken(rawAccessCookie, c.env.JWT_SECRET);
      if (claims) {
        await revocationStore.revoke(claims.sid, c.env.STOCK_MATE_KV);
      }
    }

    const rawSessionCookie = getSessionCookieToken(c);
    if (isValidSessionTokenFormat(rawSessionCookie)) {
      const tokenHash = await hasher.hashToken(rawSessionCookie);
      const useCase = new LogoutUseCase(authRepo);
      await useCase.execute(tokenHash);
    }

    clearAuthCookies(c);
    return c.body(null, 204);
  });

  router.get('/me', requireAuth, (c) => {
    const user = c.get('user')!;
    return c.json({ user }, 200);
  });

  return router;
}
