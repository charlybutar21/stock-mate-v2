import type { AuthUserDto } from '@/shared/contracts';

export interface AppBindings {
  DB: D1Database;
  STOCK_MATE_KV?: KVNamespace;
  SECTORS_API_KEY?: string;
  JWT_SECRET?: string;
  CATALOG_SYNC_SECRET?: string;
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
