// Harness for the tests that need a real PostgreSQL server. Every test file gets its own empty
// database (created from template0, owned by the owner role) and drops it afterwards, so files
// can run in parallel and never see each other's rows.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { describe } from 'vitest';
import { runMigrations } from '../db/migrate.js';
import { APP_ROLE, adminUrl, OWNER_ROLE } from './database-config.js';

export { adminUrl } from './database-config.js';

export const dbTestsEnabled = adminUrl !== undefined;

/** `describe` for tests that need PostgreSQL; skipped (and reported as skipped) without it. */
export const describeDb = dbTestsEnabled ? describe : describe.skip;

export interface TestDatabase {
  name: string;
  /** Connects as the owner role (runs migrations, changes the schema). */
  ownerUrl: string;
  /** Connects as the least-privilege application role. */
  appUrl: string;
  /** Connects as the server's superuser, to this database. */
  superUrl: string;
  drop(): Promise<void>;
}

export interface CreateTestDatabaseOptions {
  /** Apply every migration (default). Pass false to test the migrations themselves. */
  migrate?: boolean;
  /** `plain-c` creates a database where Arabic letters are not word characters. */
  locale?: 'c-utf8' | 'plain-c';
}

function urlFor(base: string, name: string, role?: { name: string; password: string }): string {
  const url = new URL(base);
  url.pathname = `/${name}`;
  if (role !== undefined) {
    url.username = role.name;
    url.password = role.password;
  }
  return url.toString();
}

export async function createTestDatabase(
  options: CreateTestDatabaseOptions = {},
): Promise<TestDatabase> {
  if (adminUrl === undefined) throw new Error('TEST_DATABASE_ADMIN_URL is not set.');
  const { migrate = true, locale = 'c-utf8' } = options;
  const name = `scentiq_test_${randomBytes(6).toString('hex')}`;

  const localeClause =
    locale === 'c-utf8'
      ? "LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8'"
      : "LOCALE_PROVIDER libc LOCALE 'C'";
  const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    await admin.query(
      `CREATE DATABASE "${name}" OWNER ${OWNER_ROLE.name} TEMPLATE template0 ENCODING 'UTF8' ${localeClause}`,
    );
  } finally {
    await admin.end();
  }

  const database: TestDatabase = {
    name,
    ownerUrl: urlFor(adminUrl, name, OWNER_ROLE),
    appUrl: urlFor(adminUrl, name, APP_ROLE),
    superUrl: urlFor(adminUrl, name),
    async drop() {
      const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
      try {
        await pool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await pool.end();
      }
    },
  };

  if (migrate) {
    try {
      await runMigrations(database.ownerUrl);
    } catch (error) {
      await database.drop();
      throw error;
    }
  }
  return database;
}

/** The constraint that rejected a statement, read from the driver error under Drizzle's wrapper. */
export function constraintOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === 'object' && current !== null; depth++) {
    const constraint = (current as { constraint?: unknown }).constraint;
    if (typeof constraint === 'string') return constraint;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
