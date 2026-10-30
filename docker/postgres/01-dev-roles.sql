-- DEVELOPMENT AND CI ONLY. The passwords below are throwaway values for a database that listens
-- on 127.0.0.1 and holds no real data. The word "devonly" in them is deliberate: the backend
-- refuses to start in staging or production with a password that contains it.
--
-- Production roles are created by whoever sets up the database server, with real passwords
-- (docs/database.md). The names and privileges stay the same:
--   scentiq_owner  owns the database and runs migrations (pnpm db:migrate). Never used by the server.
--   scentiq_app    what the running server uses: reads and writes rows, cannot change the schema.
--
-- Safe to run more than once.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'scentiq_owner') THEN
    CREATE ROLE scentiq_owner LOGIN PASSWORD 'devonly_owner'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'scentiq_app') THEN
    CREATE ROLE scentiq_app LOGIN PASSWORD 'devonly_app'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;
