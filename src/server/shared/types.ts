import type { AuthUserDto } from '@/shared/contracts';

export interface AppBindings {
  DB: D1Database;
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
