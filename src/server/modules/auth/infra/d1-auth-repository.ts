import { and, desc, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@/server/shared/db/schema';
import type {
  AuthRepository,
  SessionWithUser,
  UserEntity,
} from '../domain/auth.types';

export class D1AuthRepository implements AuthRepository {
  constructor(private readonly db: DrizzleD1Database<typeof schema>) {}

  async findActiveUserByEmail(email: string): Promise<UserEntity | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.email, email), isNull(schema.users.deletedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.passwordHash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }

  async createUser(user: Omit<UserEntity, 'deletedAt'>): Promise<void> {
    await this.db.insert(schema.users).values({
      id: user.id,
      email: user.email,
      name: user.name,
      passwordHash: user.passwordHash,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: null,
    });
  }

  async createSession(session: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: number;
    createdAt: number;
  }): Promise<void> {
    await this.db.insert(schema.sessions).values(session);
  }

  async findValidSessionByTokenHash(
    tokenHash: string,
    nowMs: number,
  ): Promise<SessionWithUser | null> {
    const rows = await this.db
      .select({
        sessionId: schema.sessions.id,
        tokenHash: schema.sessions.tokenHash,
        expiresAt: schema.sessions.expiresAt,
        userId: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
      })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
      .where(
        and(
          eq(schema.sessions.tokenHash, tokenHash),
          gt(schema.sessions.expiresAt, nowMs),
          isNull(schema.users.deletedAt),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      sessionId: row.sessionId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      user: {
        id: row.userId,
        email: row.email,
        name: row.name,
      },
    };
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.tokenHash, tokenHash));
  }

  async deleteExpiredSessionsForUser(userId: string, nowMs: number): Promise<void> {
    await this.db
      .delete(schema.sessions)
      .where(
        and(eq(schema.sessions.userId, userId), lte(schema.sessions.expiresAt, nowMs)),
      );
  }

  async pruneExcessSessionsForUser(userId: string, maxActiveSessions: number): Promise<void> {
    const activeRows = await this.db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId))
      .orderBy(desc(schema.sessions.createdAt));

    if (activeRows.length <= maxActiveSessions) return;
    const idsToDelete = activeRows.slice(maxActiveSessions).map((r) => r.id);
    await this.db.delete(schema.sessions).where(inArray(schema.sessions.id, idsToDelete));
  }
}
