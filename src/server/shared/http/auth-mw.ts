import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AuthUserDto } from '@/shared/contracts';
import type { AuthRepository, PasswordHasher } from '@/server/modules/auth/domain/auth.types';
import { unauthorizedError } from './problem';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  signAccessToken,
  verifyAccessToken,
  type SessionRevocationStore,
} from './session-token';
import type { AppEnv } from '../types';

export const SESSION_COOKIE_NAME = 'sm_session';
export const HOST_SESSION_COOKIE_NAME = '__Host-sm_session';
export const ACCESS_COOKIE_NAME = 'sm_at';
export const HOST_ACCESS_COOKIE_NAME = '__Host-sm_at';

const SESSION_TOKEN_HEX_REGEX = /^[a-f0-9]{64}$/;

export function isValidSessionTokenFormat(token: string | undefined): token is string {
  return typeof token === 'string' && SESSION_TOKEN_HEX_REGEX.test(token);
}

export function isSecureRequest(c: Context<AppEnv>): boolean {
  return (
    c.req.url.startsWith('https://') ||
    c.req.header('x-forwarded-proto')?.toLowerCase() === 'https'
  );
}

export function getSessionCookieToken(c: Context<AppEnv>): string | undefined {
  return getCookie(c, HOST_SESSION_COOKIE_NAME) ?? getCookie(c, SESSION_COOKIE_NAME);
}

export function getAccessCookieToken(c: Context<AppEnv>): string | undefined {
  return getCookie(c, HOST_ACCESS_COOKIE_NAME) ?? getCookie(c, ACCESS_COOKIE_NAME);
}

export async function setAuthCookies(
  c: Context<AppEnv>,
  params: {
    user: AuthUserDto;
    sessionId: string;
    rawSessionToken: string;
    sessionTtlSeconds: number;
  },
): Promise<void> {
  const secure = isSecureRequest(c);
  const sessionName = secure ? HOST_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME;
  const accessName = secure ? HOST_ACCESS_COOKIE_NAME : ACCESS_COOKIE_NAME;

  setCookie(c, sessionName, params.rawSessionToken, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: params.sessionTtlSeconds,
  });

  const accessJwt = await signAccessToken(
    params.user,
    params.sessionId,
    c.env.JWT_SECRET,
    Date.now(),
    secure,
  );
  setCookie(c, accessName, accessJwt, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function clearAuthCookies(c: Context<AppEnv>): void {
  const secure = isSecureRequest(c);
  const names = secure
    ? [HOST_SESSION_COOKIE_NAME, HOST_ACCESS_COOKIE_NAME, SESSION_COOKIE_NAME, ACCESS_COOKIE_NAME]
    : [SESSION_COOKIE_NAME, ACCESS_COOKIE_NAME];

  for (const name of names) {
    deleteCookie(c, name, {
      httpOnly: true,
      secure: name.startsWith('__Host-') ? true : secure,
      sameSite: 'Lax',
      path: '/',
    });
  }
}

export function createAuthMiddleware(
  getDeps: (db: D1Database) => {
    authRepo: AuthRepository;
    hasher: PasswordHasher;
    revocationStore: SessionRevocationStore;
  },
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const { authRepo, hasher, revocationStore } = getDeps(c.env.DB);
    const rawSessionToken = getSessionCookieToken(c);

    // Fast path: verify short-lived signed access cookie with ZERO D1 queries
    const secure = isSecureRequest(c);
    const rawAccessToken = getAccessCookieToken(c);
    if (rawAccessToken) {
      const claims = await verifyAccessToken(rawAccessToken, c.env.JWT_SECRET, Date.now(), secure);
      if (claims) {
        const revoked = await revocationStore.isRevoked(claims.sid, c.env.STOCK_MATE_KV);
        if (!revoked) {
          c.set('user', { id: claims.sub, email: claims.email, name: claims.name });
          c.set('sessionId', claims.sid);
          if (isValidSessionTokenFormat(rawSessionToken)) {
            c.set('sessionTokenHash', await hasher.hashToken(rawSessionToken));
          }
          await next();
          return;
        }
      }
    }

    // Fallback / Refresh path: validate revocable session token in D1 and re-issue short-lived access cookie
    if (!isValidSessionTokenFormat(rawSessionToken)) {
      throw unauthorizedError('Authentication required.');
    }

    const tokenHash = await hasher.hashToken(rawSessionToken);
    const session = await authRepo.findValidSessionByTokenHash(tokenHash, Date.now());
    if (!session) {
      throw unauthorizedError('Session expired or invalid.');
    }

    c.set('user', session.user);
    c.set('sessionId', session.sessionId);
    c.set('sessionTokenHash', tokenHash);

    // Re-issue short-lived stateless access cookie so subsequent reads skip D1
    const accessName = secure ? HOST_ACCESS_COOKIE_NAME : ACCESS_COOKIE_NAME;
    const accessJwt = await signAccessToken(
      session.user,
      session.sessionId,
      c.env.JWT_SECRET,
      Date.now(),
      secure,
    );
    setCookie(c, accessName, accessJwt, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
    });

    await next();
  };
}
