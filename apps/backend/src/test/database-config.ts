// Settings shared by the test harness and the global setup. No database connection is made here.
import { fileURLToPath } from 'node:url';

/**
 * A superuser connection to a PostgreSQL 16+ server used only to create throwaway test
 * databases, for example postgres://postgres:postgres@127.0.0.1:5432/postgres. When it is not set
 * the database tests are skipped; CI always sets it.
 */
export const adminUrl: string | undefined =
  process.env.TEST_DATABASE_ADMIN_URL?.trim() || undefined;

/** CI sets this so that a missing database can never turn the database tests into a silent skip. */
export const REQUIRE_DB_TESTS = process.env.REQUIRE_DB_TESTS === '1';

export const ROLES_SQL_PATH = fileURLToPath(
  new URL('../../../../docker/postgres/01-dev-roles.sql', import.meta.url),
);

/** The throwaway passwords defined in docker/postgres/01-dev-roles.sql. */
export const OWNER_ROLE = { name: 'scentiq_owner', password: 'devonly_owner' } as const;
export const APP_ROLE = { name: 'scentiq_app', password: 'devonly_app' } as const;
