// Used only by `pnpm db:generate` (development). Migrations are applied by src/db/migrate.ts,
// which ships inside drizzle-orm, so production never needs drizzle-kit.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './migrations',
});
