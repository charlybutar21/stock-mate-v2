import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/server/shared/db/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
});
