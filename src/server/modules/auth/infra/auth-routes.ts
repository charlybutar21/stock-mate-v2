import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { loginRequestSchema, registerRequestSchema } from '@/shared/contracts';
import {
  LoginUseCase,
  LogoutUseCase,
  RegisterUseCase,
  SESSION_TTL_SECONDS,
} from '../application/auth-use-cases';
import type { AuthRepository, PasswordHasher } from '../domain/auth.types';
import {
  createAuthMiddleware,
  isValidSessionTokenFormat,
  SESSION_COOKIE_NAME,
} from '@/server/shared/http/auth-mw';
import { parseJsonBody } from '@/server/shared/http/json-body';
import { createRateLimitMiddleware } from '@/server/shared/http/rate-limit-mw';
import type { AppEnv } from '@/server/shared/types';

function isSecureRequest(c: Context<AppEnv>): boolean {
  return (
    c.req.url.startsWith('https://') ||
    c.req.header('x-forwarded-proto')?.toLowerCase() === 'https'
  );
}

function setSessionCookie(c: Context<AppEnv>, rawSessionToken: string): void {
  setCookie(c, SESSION_COOKIE_NAME, rawSessionToken, {
    httpOnly: true,
    secure: isSecureRequest(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function createAuthRoutes(
  getDeps: (db: D1Database) => { authRepo: AuthRepository; hasher: PasswordHasher },
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
    const { authRepo, hasher } = getDeps(c.env.DB);
    const priorRawCookie = getCookie(c, SESSION_COOKIE_NAME);
    const priorTokenHash = isValidSessionTokenFormat(priorRawCookie)
      ? await hasher.hashToken(priorRawCookie)
      : undefined;

    const useCase = new RegisterUseCase(authRepo, hasher);
    const { user, rawSessionToken } = await useCase.execute(input, priorTokenHash);

    setSessionCookie(c, rawSessionToken);
    return c.json({ user }, 201);
  });

  router.post('/login', authRateLimiter, async (c) => {
    const input = await parseJsonBody(c, loginRequestSchema);
    const { authRepo, hasher } = getDeps(c.env.DB);
    const priorRawCookie = getCookie(c, SESSION_COOKIE_NAME);
    const priorTokenHash = isValidSessionTokenFormat(priorRawCookie)
      ? await hasher.hashToken(priorRawCookie)
      : undefined;

    const useCase = new LoginUseCase(authRepo, hasher);
    const { user, rawSessionToken } = await useCase.execute(input, priorTokenHash);

    setSessionCookie(c, rawSessionToken);
    return c.json({ user }, 200);
  });

  router.post('/logout', requireAuth, async (c) => {
    const tokenHash = c.get('sessionTokenHash');
    if (tokenHash) {
      const { authRepo } = getDeps(c.env.DB);
      const useCase = new LogoutUseCase(authRepo);
      await useCase.execute(tokenHash);
    }

    deleteCookie(c, SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: isSecureRequest(c),
      sameSite: 'Lax',
      path: '/',
    });

    return c.body(null, 204);
  });

  router.get('/me', requireAuth, (c) => {
    const user = c.get('user')!;
    return c.json({ user }, 200);
  });

  return router;
}
