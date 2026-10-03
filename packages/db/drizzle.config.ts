import { defineConfig } from 'drizzle-kit';

// `pnpm --filter @qi/db generate` writes SQL migrations to ./migrations.
// The same migration history is applied to cloud Postgres and desktop PGlite.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
});
