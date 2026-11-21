import type { PasswordHasher } from '../domain/auth.types';

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;
const SESSION_TOKEN_BYTES = 32;

function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

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
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
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

export class WebCryptoHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = new Uint8Array(SALT_BYTES);
    crypto.getRandomValues(salt);
    const derived = await derivePbkdf2(password, salt, PBKDF2_ITERATIONS);
    return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(derived)}`;
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
    const salt = fromHex(parts[2]!);
    const expected = fromHex(parts[3]!);
    if (!salt || !expected) {
      return false;
    }
    const actual = await derivePbkdf2(password, salt, iterations);
    return constantTimeEqual(actual, expected);
  }

  generateSessionToken(): string {
    const bytes = new Uint8Array(SESSION_TOKEN_BYTES);
    crypto.getRandomValues(bytes);
    return toHex(bytes);
  }

  async hashToken(rawToken: string): Promise<string> {
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(rawToken));
    return toHex(new Uint8Array(digest));
  }
}
