import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

function toSqlParams(params: unknown[]): SQLInputValue[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (typeof p === 'number' || typeof p === 'string' || p instanceof Uint8Array) {
      return p;
    }
    return String(p);
  });
}

class MockD1PreparedStatement {
  private boundParams: unknown[] = [];

  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): MockD1PreparedStatement {
    const next = new MockD1PreparedStatement(this.sqlite, this.query);
    next.boundParams = values;
    return next;
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const stmt = this.sqlite.prepare(this.query);
    const row = stmt.get(...toSqlParams(this.boundParams)) as Record<string, unknown> | undefined;
    if (!row) return null;
    if (colName) return (row[colName] as T) ?? null;
    return row as T;
  }

  async all<T = Record<string, unknown>>(): Promise<{
    results: T[];
    success: true;
    meta: Record<string, unknown>;
  }> {
    const stmt = this.sqlite.prepare(this.query);
    const trimmed = this.query.trim().toUpperCase();
    if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA') || trimmed.startsWith('EXPLAIN') || trimmed.includes('RETURNING')) {
      const results = stmt.all(...toSqlParams(this.boundParams)) as T[];
      return { results, success: true, meta: {} };
    }
    const info = stmt.run(...toSqlParams(this.boundParams));
    return {
      results: [],
      success: true,
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
    };
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]> {
    const stmt = this.sqlite.prepare(this.query);
    stmt.setReturnArrays(true);
    const rows = stmt.all(...toSqlParams(this.boundParams)) as T[];
    if (options?.columnNames) {
      const cols = stmt.columns().map((c) => c.name);
      return [cols as unknown as T, ...rows];
    }
    return rows;
  }

  async run(): Promise<{ success: true; meta: Record<string, unknown> }> {
    const stmt = this.sqlite.prepare(this.query);
    const info = stmt.run(...toSqlParams(this.boundParams));
    return {
      success: true,
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
    };
  }
}

export function createTestD1(): { d1: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    sqlite.exec(sql);
  }

  const d1 = {
    prepare(query: string) {
      return new MockD1PreparedStatement(sqlite, query);
    },
    async batch(statements: MockD1PreparedStatement[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const s of statements) {
          results.push(await s.all());
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 1, duration: 0 };
    },
  } as unknown as D1Database;

  return { d1, sqlite };
}
