import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type { PasswordHasher } from '../domain/auth.types';

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;
const SESSION_TOKEN_BYTES = 32;

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

async function derivePbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    utf8ToBytes(password) as BufferSource,
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
 * - Password KDF: Native Web Crypto PBKDF2-SHA256 (100k iterations, C++ V8, 10ms Cloudflare-safe)
 * - Session Tokens & Hashing: Cure53-audited @noble/hashes (CSPRNG randomBytes, SHA-256, hex encoding)
 * - Verification: Constant-time byte comparison to prevent timing side-channels
 */
export class WebCryptoHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const derived = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);
    return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(derived)}`;
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const parts = storedHash.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') {
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
    const actual = await derivePbkdf2(password, salt, iterations);
    return constantTimeEqual(actual, expected);
  }

  generateSessionToken(): string {
    return bytesToHex(randomBytes(SESSION_TOKEN_BYTES));
  }

  async hashToken(rawToken: string): Promise<string> {
    return bytesToHex(sha256(utf8ToBytes(rawToken)));
  }
}
