# Database guide

PostgreSQL 18 (the minimum: primary keys default to the built-in `uuidv7()`, which does not exist before 18), Drizzle ORM, plain SQL migrations. Decisions: [ADR-0004](adr/0004-database-postgresql-drizzle.md),
[ADR-0015](adr/0015-seed-and-sample-data-policy.md). Spike result: [spikes/0004-drizzle-postgres18.md](spikes/0004-drizzle-postgres18.md).

**بالعربي:** قاعدة البيانات PostgreSQL. الـ backend وحده يكلمها، والـ frontend ما يعرف عنها شي. نستعمل دورين (role): `scentiq_owner` يغيّر الجداول (migrations)، و`scentiq_app` يقرأ ويكتب الصفوف بس. حتى لو أحد استغل ثغرة SQL injection بالتطبيق، ما يكدر يمسح جدول أو يعطل حماية الـ audit log.

## Where things live

| Path | What it is |
| --- | --- |
| `apps/backend/src/db/schema/` | Table definitions (Drizzle). One file per area. |
| `apps/backend/migrations/` | The SQL that creates the database, in order. Committed to Git. Never edit a migration that has already been applied anywhere: add a new one. |
| `apps/backend/src/db/client.ts` | The only place that creates the connection pool. |
| `apps/backend/src/db/errors.ts` | Reads PostgreSQL error codes (unique, check, still referenced). |
| `apps/backend/src/db/audit.ts` | `recordAudit()`: the one way to write an audit row (removes passwords, tokens, phones and addresses from `details`). |
| `apps/backend/src/db/seed/` | The seed runner and the list of seeders. |
| `docker/postgres/` | Development roles and the development database owner. |

## The two roles

| Role | Used by | Can do | Cannot do |
| --- | --- | --- | --- |
| `scentiq_owner` | `pnpm db:migrate`, `pnpm db:reset` only | Create, change and drop tables, triggers and indexes | Be a superuser |
| `scentiq_app` | The running server, `seed:*`, the sample-data gate | `SELECT`, `INSERT`, `UPDATE`, `DELETE` on rows (not `UPDATE`/`DELETE` on `audit_logs`) | Create, alter or drop anything, disable a trigger, `TRUNCATE` |

Both are `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`. Staging and production **refuse to start** if `DATABASE_URL` points at a role that has any of those powers, and they refuse any URL whose password contains `devonly`. Tests: `rules.db.test.ts`, `env.test.ts`.

## Local development with Docker

```
docker compose up -d          # PostgreSQL 18 on 127.0.0.1:5432, roles and database created on first start
pnpm db:migrate               # create the tables
pnpm dev
docker compose down           # stop (data kept)
docker compose down -v        # stop and wipe all data
```

`apps/backend/.env.example` already holds the matching URLs; copy it to `.env`.

## Local development without Docker (Windows or Linux)

1. Install PostgreSQL 18 from postgresql.org and keep the default port 5432.
2. As the `postgres` user, run the role script and create the database:

```sql
\i 'C:/path/to/scentiq/docker/postgres/01-dev-roles.sql'
CREATE DATABASE scentiq_dev OWNER scentiq_owner TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';
```

3. `pnpm db:migrate`.

Use forward slashes in the `\i` path, also on Windows. The `builtin` locale provider (PostgreSQL 17 and newer) is always available on 18. The migration check below tells you if a database was created with a locale that cannot handle Arabic.

## Why the database locale matters (Arabic search)

Fuzzy search uses PostgreSQL trigrams (`pg_trgm`). In a database created with the plain `C` locale, Arabic letters are not treated as letters and the trigram index finds **nothing, silently** (found by the spike). Migration `0000_extensions.sql` therefore fails with a clear message if the database cannot index Arabic. Create the database with `C.UTF-8` as shown above, or with a UTF-8 locale of your operating system.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm db:migrate` | Applies pending migrations in one transaction (uses `MIGRATION_DATABASE_URL`). Safe to run again. |
| `pnpm db:generate` | Development only. After you change `src/db/schema/`, writes a new migration into `migrations/`. Review the SQL. |
| `pnpm db:reset` | Development only. Drops everything and migrates again. Refuses unless `APP_ENV` is `development` or `test` **and** the database is on this computer. "On this computer" is checked on every host the driver could use, including `?host=` and `?hostaddr=` in the URL. |
| `pnpm seed:reference` | Real, production-safe reference data. Must be repeatable. |
| `pnpm seed:dev` | Sample data. Refuses unless `APP_ENV` is `development` or `staging`, and in development also refuses a database that is not on this computer. Records every row in `sample_data_registry`. |
| `pnpm db:assert-no-sample-data` | Deployment gate: exits with an error if `sample_data_registry` has rows. Run it against production before and after every release. |

In production the migration step runs the compiled file, so `drizzle-kit` (a development tool) is not needed there:

```
node apps/backend/dist/db/cli/migrate.js
```

## Writing a migration

1. Change the schema in `apps/backend/src/db/schema/`.
2. `pnpm db:generate`, then read the SQL it wrote.
3. Things Drizzle cannot express (extensions, triggers, grants, data fixes) go into a hand-written file: `pnpm --filter @scentiq/backend exec drizzle-kit generate --custom --name what_it_does`, then write the SQL in the new file.
4. Add a test that fails if the rule is removed (see `rules.db.test.ts`: it checks the **name** of the constraint that rejected the statement).
5. Commit the SQL **and** the `meta/` folder together.

CI runs `pnpm db:generate` and fails if it writes anything, so a schema change without its migration cannot be merged.

Conventions (ADR-0004): money is an integer number of IQD; timestamps are `timestamptz`; primary keys are UUIDv7 from `uuidv7()`; catalog rows are archived, not deleted; order items are snapshots; every table the app writes gets its rules as `CHECK` constraints, not only as code.

## Rules the database enforces today

| Table | Rule | Constraint |
| --- | --- | --- |
| `audit_logs` | Cannot be updated, deleted or truncated, by anyone | Triggers `audit_logs_append_only`, `audit_logs_no_truncate`; no `UPDATE`/`DELETE` privilege for `scentiq_app` |
| `audit_logs` | Actor is `system`, `staff` or `guest`; a staff row names its staff id and the others do not | `audit_logs_actor_type_valid`, `audit_logs_staff_has_actor` |
| `audit_logs` | Action looks like `product.price_changed` (lower case, dotted, at most 100 characters) | `audit_logs_action_format` |
| `audit_logs` | Entity type and id are both set or both empty | `audit_logs_entity_pair` |
| `audit_logs` | `details` is a JSON object of at most 16 KB | `audit_logs_details_object`, `audit_logs_details_size` |
| `sample_data_registry` | A row is registered once; the table name is a plain identifier | `sample_data_registry_row_uq`, `sample_data_registry_table_name_format` |

The trigger function `forbid_mutation()` is reusable: `inventory_movements` and `order_status_history` (Phase 6A) attach it too.

## Production setup (once per environment)

Whoever runs the database server does this, with real passwords from a password manager (never in Git, never in chat):

```sql
CREATE ROLE scentiq_owner LOGIN PASSWORD '<strong password>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE scentiq_app   LOGIN PASSWORD '<other strong password>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE DATABASE scentiq OWNER scentiq_owner TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8';
```

Then run the migration step with `MIGRATION_DATABASE_URL` (owner), start the server with `DATABASE_URL` (app role) only, and use TLS between them if the database is on another machine (`?sslmode=verify-full` in the URL). Migrations assume one deployment at a time: do not run two `db:migrate` at once. Back-ups and restore tests belong to Phase 13.

## Tests

Tests that need a real PostgreSQL (`*.db.test.ts`) run when `TEST_DATABASE_ADMIN_URL` points at a server where you are a superuser. Every test file creates its own empty database and drops it afterwards.

```
# Docker database from this repository
TEST_DATABASE_ADMIN_URL=postgres://postgres:devonly_admin@127.0.0.1:5432/postgres pnpm test
```

On Windows PowerShell: `$env:TEST_DATABASE_ADMIN_URL="postgres://postgres:devonly_admin@127.0.0.1:5432/postgres"; pnpm test`.

Without it those tests are skipped and the run says so. CI sets `REQUIRE_DB_TESTS=1`, so a missing database fails the run instead of skipping.

## Troubleshooting

| Message | Meaning and fix |
| --- | --- |
| `This database does not treat Arabic letters as word characters` | The database was created with the plain `C` locale. Drop it and create it again as shown above. |
| `role "scentiq_app" does not exist` during `db:migrate` | The roles were not created before the first migration. Run `docker/postgres/01-dev-roles.sql` (or the production script). This is intentional: a missing role is never skipped silently. |
| `password authentication failed` | The password in `.env` is not the one the role has. For development use the values in `.env.example`. |
| `/readyz` answers 503 | The database does not answer. `/healthz` stays 200 on purpose, so the platform does not restart a healthy process. Check the database, the URL and the pool size. |
| Server refuses to start: "role with dangerous privileges" | `DATABASE_URL` uses a superuser (or similar). Use `scentiq_app`. |
| Server refuses to start in staging or production: "database is not reachable, so its role cannot be checked" | At startup the server tries five times, two seconds apart, to read its own role. If the database never answers it stops instead of running unchecked; the platform restarts it. Development only warns. |
