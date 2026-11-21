import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { loginRequestSchema, registerRequestSchema } from '@/shared/contracts';
import {
  LoginUseCase,
  LogoutUseCase,
  RegisterUseCase,
  SESSION_TTL_SECONDS,
} from '../application/auth-use-cases';
import type { AuthRepository, PasswordHasher } from '../domain/auth.types';
import { createAuthMiddleware, SESSION_COOKIE_NAME } from '@/server/shared/http/auth-mw';
import { validationError, zodToValidationError } from '@/server/shared/http/problem';
import type { AppEnv } from '@/server/shared/types';

function isSecureRequest(url: string): boolean {
  return url.startsWith('https://');
}

export function createAuthRoutes(
  getDeps: (db: D1Database) => { authRepo: AuthRepository; hasher: PasswordHasher },
): Hono<AppEnv> {
  const router = new Hono<AppEnv>();
  const requireAuth = createAuthMiddleware(getDeps);

  router.post('/register', async (c) => {
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      throw validationError('Request body must be valid JSON.');
    }

    const parsed = registerRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw zodToValidationError(parsed.error);
    }

    const { authRepo, hasher } = getDeps(c.env.DB);
    const useCase = new RegisterUseCase(authRepo, hasher);
    const { user, rawSessionToken } = await useCase.execute(parsed.data);

    setCookie(c, SESSION_COOKIE_NAME, rawSessionToken, {
      httpOnly: true,
      secure: isSecureRequest(c.req.url),
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });

    return c.json({ user }, 201);
  });

  router.post('/login', async (c) => {
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      throw validationError('Request body must be valid JSON.');
    }

    const parsed = loginRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw zodToValidationError(parsed.error);
    }

    const { authRepo, hasher } = getDeps(c.env.DB);
    const useCase = new LoginUseCase(authRepo, hasher);
    const { user, rawSessionToken } = await useCase.execute(parsed.data);

    setCookie(c, SESSION_COOKIE_NAME, rawSessionToken, {
      httpOnly: true,
      secure: isSecureRequest(c.req.url),
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });

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
      secure: isSecureRequest(c.req.url),
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
