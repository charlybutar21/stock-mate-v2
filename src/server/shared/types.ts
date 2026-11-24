import type { AuthUserDto } from '@/shared/contracts';

export interface AppBindings {
  DB: D1Database;
  SECTORS_API_KEY?: string;
}

export interface AppVariables {
  correlationId: string;
  user?: AuthUserDto;
  sessionTokenHash?: string;
}

export interface AppEnv {
  Bindings: AppBindings;
  Variables: AppVariables;
}
