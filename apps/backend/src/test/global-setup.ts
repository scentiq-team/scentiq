// Runs once before the whole test run. When a PostgreSQL server is configured it makes sure the
// two roles exist (they belong to the server, not to one database, so they must not be created
// by tests that run in parallel).
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { adminUrl, REQUIRE_DB_TESTS, ROLES_SQL_PATH } from './database-config.js';

export default async function setup(): Promise<void> {
  if (adminUrl === undefined) {
    if (REQUIRE_DB_TESTS) {
      throw new Error(
        'REQUIRE_DB_TESTS=1 but TEST_DATABASE_ADMIN_URL is not set: the database tests would be skipped.',
      );
    }
    console.warn(
      '\n[tests] TEST_DATABASE_ADMIN_URL is not set: database tests are skipped (CI runs them).\n',
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    await pool.query(readFileSync(ROLES_SQL_PATH, 'utf8'));
  } finally {
    await pool.end();
  }
}
