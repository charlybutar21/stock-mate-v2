import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AuthRepository, PasswordHasher } from '@/server/modules/auth/domain/auth.types';
import { unauthorizedError } from './problem';
import type { AppEnv } from '../types';

export const SESSION_COOKIE_NAME = 'sm_session';

const SESSION_TOKEN_HEX_REGEX = /^[a-f0-9]{64}$/;

export function isValidSessionTokenFormat(token: string | undefined): token is string {
  return typeof token === 'string' && SESSION_TOKEN_HEX_REGEX.test(token);
}

export function createAuthMiddleware(
  getDeps: (db: D1Database) => { authRepo: AuthRepository; hasher: PasswordHasher },
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const rawToken = getCookie(c, SESSION_COOKIE_NAME);
    if (!isValidSessionTokenFormat(rawToken)) {
      throw unauthorizedError('Authentication required.');
    }

    const { authRepo, hasher } = getDeps(c.env.DB);
    const tokenHash = await hasher.hashToken(rawToken);
    const session = await authRepo.findValidSessionByTokenHash(tokenHash, Date.now());
    if (!session) {
      throw unauthorizedError('Session expired or invalid.');
    }

    c.set('user', session.user);
    c.set('sessionTokenHash', tokenHash);
    await next();
  };
}
