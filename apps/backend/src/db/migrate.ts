// Applies the SQL files in apps/backend/migrations in order, all in one transaction. It uses the
// migrator that ships inside drizzle-orm, so a production deployment does not need drizzle-kit
// (which is a development tool for generating migrations).
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/** Same relative position from src/db (tests, tsx) and from dist/db (production). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations', import.meta.url));

/** Connect as the owner role (MIGRATION_DATABASE_URL), never as the application role. */
export async function runMigrations(
  url: string,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1, application_name: 'scentiq-migrate' });
  pool.on('error', () => undefined); // surfaced by the failing query instead
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}
