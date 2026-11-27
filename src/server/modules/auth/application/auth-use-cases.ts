import type { AuthUserDto, LoginRequest, RegisterRequest } from '@/shared/contracts';
import { unauthorizedError, validationError } from '@/server/shared/http/problem';
import type { AuthRepository, PasswordHasher } from '../domain/auth.types';

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days (604800s)
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
export const MAX_ACTIVE_SESSIONS_PER_USER = 5;

const NEUTRAL_REGISTRATION_ERROR_DETAIL =
  'Unable to complete registration. Please check your details or sign in if you already have an account.';

/**
 * Valid dummy PBKDF2-SHA256 hash (100,000 iterations) used when an email is not found
 * (or already exists during registration) so auth use cases always perform identical
 * cryptographic work, preventing timing-based account enumeration.
 */
const DUMMY_PBKDF2_HASH =
  'pbkdf2_sha256$100000$000102030405060708090a0b0c0d0e0f$9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

export interface AuthSessionResult {
  user: AuthUserDto;
  sessionId: string;
  rawSessionToken: string;
  revokedSessionIds: string[];
}

export class RegisterUseCase {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(
    input: RegisterRequest,
    existingTokenHash?: string,
    pepper?: string,
  ): Promise<AuthSessionResult> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.authRepo.findActiveUserByEmail(normalizedEmail);
    if (existing) {
      // Equalize timing & return neutral message to prevent email enumeration
      await this.hasher.verify(input.password, DUMMY_PBKDF2_HASH);
      throw validationError(NEUTRAL_REGISTRATION_ERROR_DETAIL);
    }

    const now = Date.now();
    const userId = crypto.randomUUID();
    const passwordHash = await this.hasher.hash(input.password, pepper);

    try {
      await this.authRepo.createUser({
        id: userId,
        email: normalizedEmail,
        name: input.name.trim(),
        passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        throw validationError(NEUTRAL_REGISTRATION_ERROR_DETAIL);
      }
      throw err;
    }

    const revokedSessionIds: string[] = [];
    if (existingTokenHash) {
      const deletedId = await this.authRepo.deleteSessionByTokenHash(existingTokenHash);
      if (deletedId) revokedSessionIds.push(deletedId);
    }

    const sessionId = crypto.randomUUID();
    const rawSessionToken = this.hasher.generateSessionToken();
    const tokenHash = await this.hasher.hashToken(rawSessionToken);

    await this.authRepo.createSession({
      id: sessionId,
      userId,
      tokenHash,
      expiresAt: now + SESSION_TTL_MS,
      createdAt: now,
    });

    return {
      user: {
        id: userId,
        email: normalizedEmail,
        name: input.name.trim(),
      },
      sessionId,
      rawSessionToken,
      revokedSessionIds,
    };
  }
}

export class LoginUseCase {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(
    input: LoginRequest,
    existingTokenHash?: string,
    pepper?: string,
  ): Promise<AuthSessionResult> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.authRepo.findActiveUserByEmail(normalizedEmail);

    if (!user) {
      await this.hasher.verify(input.password, DUMMY_PBKDF2_HASH);
      throw unauthorizedError('Invalid email or password.');
    }

    const valid = await this.hasher.verify(input.password, user.passwordHash, pepper);
    if (!valid) {
      throw unauthorizedError('Invalid email or password.');
    }

    const now = Date.now();
    const revokedSessionIds: string[] = [];
    if (existingTokenHash) {
      const deletedId = await this.authRepo.deleteSessionByTokenHash(existingTokenHash);
      if (deletedId) revokedSessionIds.push(deletedId);
    }
    await this.authRepo.deleteExpiredSessionsForUser(user.id, now);

    const sessionId = crypto.randomUUID();
    const rawSessionToken = this.hasher.generateSessionToken();
    const tokenHash = await this.hasher.hashToken(rawSessionToken);

    await this.authRepo.createSession({
      id: sessionId,
      userId: user.id,
      tokenHash,
      expiresAt: now + SESSION_TTL_MS,
      createdAt: now,
    });

    if (this.authRepo.pruneExcessSessionsForUser) {
      const evictedIds = await this.authRepo.pruneExcessSessionsForUser(
        user.id,
        MAX_ACTIVE_SESSIONS_PER_USER,
      );
      revokedSessionIds.push(...evictedIds);
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      sessionId,
      rawSessionToken,
      revokedSessionIds,
    };
  }
}

export class LogoutUseCase {
  constructor(private readonly authRepo: AuthRepository) {}

  async execute(tokenHash: string): Promise<string | null> {
    return this.authRepo.deleteSessionByTokenHash(tokenHash);
  }
}
