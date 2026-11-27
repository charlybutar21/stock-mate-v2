import type { AuthUserDto } from '@/shared/contracts';
import { BoundedTtlCache } from '../cache/bounded-ttl-cache';
import { AppError } from './problem';

export const ACCESS_TOKEN_TTL_SECONDS = 5 * 60; // 5 minutes (minimizes KV propagation window)
const ACCESS_TOKEN_TTL_MS = ACCESS_TOKEN_TTL_SECONDS * 1000;
const MIN_JWT_SECRET_BYTES = 32; // RFC 7518 Section 3.2: >= 256-bit key for HS256
const REVOKED_KV_PREFIX = 'revoked:sid:';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  name: string;
  sid: string;
  exp: number;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Ephemeral per-isolate fallback key used ONLY when JWT_SECRET is not configured (dev/tests).
// Lazily initialized inside a request handler because Cloudflare Workers disallows
// crypto.getRandomValues() in global module scope.
let fallbackSecretBytes: Uint8Array | null = null;

function getFallbackSecretBytes(): Uint8Array {
  if (!fallbackSecretBytes) {
    fallbackSecretBytes = crypto.getRandomValues(new Uint8Array(32));
  }
  return fallbackSecretBytes;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(str)) return null;
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function importHmacKey(
  secret?: string,
  requireStrongSecret: boolean = false,
): Promise<CryptoKey> {
  const encoded = secret ? textEncoder.encode(secret) : null;
  if (encoded && encoded.byteLength >= MIN_JWT_SECRET_BYTES) {
    return crypto.subtle.importKey(
      'raw',
      encoded as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
  }
  if (requireStrongSecret) {
    throw new AppError({
      status: 500,
      type: 'https://stock-mate-v2/errors/server-misconfigured',
      title: 'Server Configuration Error',
      detail: 'Authentication signing secret is not properly configured.',
    });
  }
  return crypto.subtle.importKey(
    'raw',
    getFallbackSecretBytes() as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Signs a compact short-lived (5m) HS256 JWT access token for zero-D1 authenticated reads.
 */
export async function signAccessToken(
  user: AuthUserDto,
  sessionId: string,
  secret?: string,
  nowMs: number = Date.now(),
  requireStrongSecret: boolean = false,
): Promise<string> {
  const headerB64 = toBase64Url(textEncoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const claims: AccessTokenClaims = {
    sub: user.id,
    email: user.email,
    name: user.name,
    sid: sessionId,
    exp: Math.floor((nowMs + ACCESS_TOKEN_TTL_MS) / 1000),
  };
  const payloadB64 = toBase64Url(textEncoder.encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importHmacKey(secret, requireStrongSecret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, textEncoder.encode(signingInput));
  const sigB64 = toBase64Url(new Uint8Array(sigBuf));

  return `${signingInput}.${sigB64}`;
}

export async function verifyAccessToken(
  token: string,
  secret?: string,
  nowMs: number = Date.now(),
  requireStrongSecret: boolean = false,
): Promise<AccessTokenClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  const headerBytes = fromBase64Url(headerB64);
  if (!headerBytes) return null;
  try {
    const header = JSON.parse(textDecoder.decode(headerBytes)) as {
      alg?: unknown;
      typ?: unknown;
    };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return null;
    }
  } catch {
    return null;
  }

  const sigBytes = fromBase64Url(sigB64);
  if (!sigBytes) return null;

  const key = await importHmacKey(secret, requireStrongSecret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes as BufferSource,
    textEncoder.encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) return null;

  const payloadBytes = fromBase64Url(payloadB64);
  if (!payloadBytes) return null;

  try {
    const parsed = JSON.parse(textDecoder.decode(payloadBytes)) as Partial<AccessTokenClaims>;
    if (
      typeof parsed.sub !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.sid !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (parsed.exp <= Math.floor(nowMs / 1000)) {
      return null;
    }
    return parsed as AccessTokenClaims;
  } catch {
    return null;
  }
}

/**
 * Revocation denylist for logged-out or rotated short-lived access tokens.
 * Uses Cloudflare KV when bound, plus an in-isolate bounded TTL cache as instant local guard.
 */
export class SessionRevocationStore {
  private readonly localRevoked = new BoundedTtlCache<string, true>(ACCESS_TOKEN_TTL_MS, 5_000);

  async revoke(sessionId: string, kv?: KVNamespace): Promise<void> {
    this.localRevoked.set(sessionId, true);
    if (kv) {
      try {
        await kv.put(`${REVOKED_KV_PREFIX}${sessionId}`, '1', {
          expirationTtl: ACCESS_TOKEN_TTL_SECONDS + 60,
        });
      } catch {
        // Non-fatal: D1 session is already deleted
      }
    }
  }

  async isRevoked(sessionId: string, kv?: KVNamespace): Promise<boolean> {
    if (this.localRevoked.get(sessionId)) {
      return true;
    }
    if (kv) {
      try {
        const hit = await kv.get(`${REVOKED_KV_PREFIX}${sessionId}`);
        if (hit !== null) {
          this.localRevoked.set(sessionId, true);
          return true;
        }
      } catch {
        // Fail open only for denylist read errors; D1 refresh remains authoritative
      }
    }
    return false;
  }
}
