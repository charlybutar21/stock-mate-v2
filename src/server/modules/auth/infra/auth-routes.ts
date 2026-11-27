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
  isSecureRequest,
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
    const secure = isSecureRequest(c);
    const priorRawCookie = getSessionCookieToken(c);
    const priorTokenHash = isValidSessionTokenFormat(priorRawCookie)
      ? await hasher.hashToken(priorRawCookie)
      : undefined;
    const priorAccessCookie = getAccessCookieToken(c);
    if (priorAccessCookie) {
      const priorClaims = await verifyAccessToken(
        priorAccessCookie,
        c.env.JWT_SECRET,
        Date.now(),
        secure,
      );
      if (priorClaims) {
        await revocationStore.revoke(priorClaims.sid, c.env.STOCK_MATE_KV);
      }
    }

    const useCase = new RegisterUseCase(authRepo, hasher);
    const { user, sessionId, rawSessionToken, revokedSessionIds } = await useCase.execute(
      input,
      priorTokenHash,
      c.env.PASSWORD_PEPPER,
    );
    await Promise.all(
      revokedSessionIds.map((sid) => revocationStore.revoke(sid, c.env.STOCK_MATE_KV)),
    );

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
    const secure = isSecureRequest(c);
    const priorRawCookie = getSessionCookieToken(c);
    const priorTokenHash = isValidSessionTokenFormat(priorRawCookie)
      ? await hasher.hashToken(priorRawCookie)
      : undefined;
    const priorAccessCookie = getAccessCookieToken(c);
    if (priorAccessCookie) {
      const priorClaims = await verifyAccessToken(
        priorAccessCookie,
        c.env.JWT_SECRET,
        Date.now(),
        secure,
      );
      if (priorClaims) {
        await revocationStore.revoke(priorClaims.sid, c.env.STOCK_MATE_KV);
      }
    }

    const useCase = new LoginUseCase(authRepo, hasher);
    const { user, sessionId, rawSessionToken, revokedSessionIds } = await useCase.execute(
      input,
      priorTokenHash,
      c.env.PASSWORD_PEPPER,
    );
    await Promise.all(
      revokedSessionIds.map((sid) => revocationStore.revoke(sid, c.env.STOCK_MATE_KV)),
    );

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
    const secure = isSecureRequest(c);
    const rawAccessCookie = getAccessCookieToken(c);
    if (rawAccessCookie) {
      try {
        const claims = await verifyAccessToken(
          rawAccessCookie,
          c.env.JWT_SECRET,
          Date.now(),
          secure,
        );
        if (claims) {
          await revocationStore.revoke(claims.sid, c.env.STOCK_MATE_KV);
        }
      } catch {
        // Still proceed to revoke D1 session & clear cookies
      }
    }

    const rawSessionCookie = getSessionCookieToken(c);
    if (isValidSessionTokenFormat(rawSessionCookie)) {
      const tokenHash = await hasher.hashToken(rawSessionCookie);
      const useCase = new LogoutUseCase(authRepo);
      const deletedSessionId = await useCase.execute(tokenHash);
      if (deletedSessionId) {
        await revocationStore.revoke(deletedSessionId, c.env.STOCK_MATE_KV);
      }
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
