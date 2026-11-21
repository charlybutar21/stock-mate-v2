export interface UserEntity {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface SessionWithUser {
  sessionId: string;
  tokenHash: string;
  expiresAt: number;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, storedHash: string): Promise<boolean>;
  generateSessionToken(): string;
  hashToken(rawToken: string): Promise<string>;
}

export interface AuthRepository {
  findActiveUserByEmail(email: string): Promise<UserEntity | null>;
  createUser(user: Omit<UserEntity, 'deletedAt'>): Promise<void>;
  createSession(session: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: number;
    createdAt: number;
  }): Promise<void>;
  findValidSessionByTokenHash(tokenHash: string, nowMs: number): Promise<SessionWithUser | null>;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
}
