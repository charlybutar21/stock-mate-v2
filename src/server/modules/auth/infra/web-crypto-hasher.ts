import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type { PasswordHasher } from '../domain/auth.types';

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;
const SESSION_TOKEN_BYTES = 32;

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

export function constantTimeEqualStrings(a: string, b: string): boolean {
  return constantTimeEqual(sha256(utf8ToBytes(a)), sha256(utf8ToBytes(b)));
}

async function applyPepper(password: string, pepper: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    utf8ToBytes(pepper) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, utf8ToBytes(password) as BufferSource);
  return new Uint8Array(mac);
}

async function derivePbkdf2(
  passwordBytes: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBytes as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    DERIVED_KEY_BYTES * 8,
  );
  return new Uint8Array(derivedBits);
}

/**
 * Audited cryptographic auth adapter:
 * - Password KDF: Native Web Crypto PBKDF2-SHA256 (100k iterations — Cloudflare Workers Web Crypto max)
 *   with optional secret-keyed HMAC-SHA256 peppering (`PASSWORD_PEPPER`) for offline crack hardening
 * - Session Tokens & Hashing: Cure53-audited @noble/hashes (CSPRNG randomBytes, SHA-256, hex encoding)
 * - Verification: Constant-time byte comparison to prevent timing side-channels
 */
export class WebCryptoHasher implements PasswordHasher {
  async hash(password: string, pepper?: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const usePepper = Boolean(pepper && pepper.length >= 16);
    const inputBytes = usePepper ? await applyPepper(password, pepper!) : utf8ToBytes(password);
    const derived = await derivePbkdf2(inputBytes, salt, PBKDF2_ITERATIONS);
    const prefix = usePepper ? 'pbkdf2_sha256_p' : 'pbkdf2_sha256';
    return `${prefix}$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(derived)}`;
  }

  async verify(password: string, storedHash: string, pepper?: string): Promise<boolean> {
    const parts = storedHash.split('$');
    const scheme = parts[0];
    if (parts.length !== 4 || (scheme !== 'pbkdf2_sha256' && scheme !== 'pbkdf2_sha256_p')) {
      return false;
    }
    const iterations = Number.parseInt(parts[1]!, 10);
    if (!Number.isFinite(iterations) || iterations < 10_000) {
      return false;
    }
    let salt: Uint8Array;
    let expected: Uint8Array;
    try {
      salt = hexToBytes(parts[2]!);
      expected = hexToBytes(parts[3]!);
    } catch {
      return false;
    }
    if (scheme === 'pbkdf2_sha256_p' && (!pepper || pepper.length < 16)) {
      return false;
    }
    const inputBytes =
      scheme === 'pbkdf2_sha256_p' ? await applyPepper(password, pepper!) : utf8ToBytes(password);
    const actual = await derivePbkdf2(inputBytes, salt, iterations);
    return constantTimeEqual(actual, expected);
  }

  generateSessionToken(): string {
    return bytesToHex(randomBytes(SESSION_TOKEN_BYTES));
  }

  async hashToken(rawToken: string): Promise<string> {
    return bytesToHex(sha256(utf8ToBytes(rawToken)));
  }
}
