import type { AuthUserDto } from '@/shared/contracts';

export interface AppBindings {
  DB: D1Database;
  STOCK_MATE_KV?: KVNamespace;
  JWT_SECRET?: string;
  CATALOG_SYNC_SECRET?: string;
  PASSWORD_PEPPER?: string;
}

export interface AppVariables {
  correlationId: string;
  user?: AuthUserDto;
  sessionId?: string;
  sessionTokenHash?: string;
}

export interface AppEnv {
  Bindings: AppBindings;
  Variables: AppVariables;
}
