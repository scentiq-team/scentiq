-- The application connects as the least-privilege role `scentiq_app`: it can read and write rows
-- but cannot create, alter or drop anything, and it cannot disable triggers. The role is created
-- before the first migration (docker/postgres/01-dev-roles.sql in development, the hosting
-- setup in production, see docs/database.md). If it does not exist this migration fails loudly,
-- which is intended: a missing role must never be skipped silently.
GRANT USAGE ON SCHEMA public TO scentiq_app;
--> statement-breakpoint
-- Tables created later by the migrating role are readable and writable by the application role.
-- TRUNCATE, REFERENCES and TRIGGER are deliberately not granted.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scentiq_app;
