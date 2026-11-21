import type { AuthUserDto, LoginRequest, RegisterRequest } from '@/shared/contracts';
import { conflictError, unauthorizedError } from '@/server/shared/http/problem';
import type { AuthRepository, PasswordHasher } from '../domain/auth.types';

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days (604800s)
export const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

export interface AuthSessionResult {
  user: AuthUserDto;
  rawSessionToken: string;
}

export class RegisterUseCase {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: RegisterRequest): Promise<AuthSessionResult> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing = await this.authRepo.findActiveUserByEmail(normalizedEmail);
    if (existing) {
      throw conflictError('An account with this email already exists.');
    }

    const now = Date.now();
    const userId = crypto.randomUUID();
    const passwordHash = await this.hasher.hash(input.password);

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
        throw conflictError('An account with this email already exists.');
      }
      throw err;
    }

    const rawSessionToken = this.hasher.generateSessionToken();
    const tokenHash = await this.hasher.hashToken(rawSessionToken);

    await this.authRepo.createSession({
      id: crypto.randomUUID(),
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
      rawSessionToken,
    };
  }
}

export class LoginUseCase {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: LoginRequest): Promise<AuthSessionResult> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.authRepo.findActiveUserByEmail(normalizedEmail);

    if (!user) {
      throw unauthorizedError('Invalid email or password.');
    }

    const valid = await this.hasher.verify(input.password, user.passwordHash);
    if (!valid) {
      throw unauthorizedError('Invalid email or password.');
    }

    const now = Date.now();
    const rawSessionToken = this.hasher.generateSessionToken();
    const tokenHash = await this.hasher.hashToken(rawSessionToken);

    await this.authRepo.createSession({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash,
      expiresAt: now + SESSION_TTL_MS,
      createdAt: now,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      rawSessionToken,
    };
  }
}

export class LogoutUseCase {
  constructor(private readonly authRepo: AuthRepository) {}

  async execute(tokenHash: string): Promise<void> {
    await this.authRepo.deleteSessionByTokenHash(tokenHash);
  }
}
