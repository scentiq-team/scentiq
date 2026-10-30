-- Trigram index support for fuzzy search (Phase 5).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- Guard (spike 2026-10-26): in a database created with the plain "C" locale, Arabic letters are
-- not word characters and a trigram index finds nothing, silently. Fail the migration loudly
-- instead. Create the database with a UTF-8 locale, for example C.UTF-8.
DO $$
BEGIN
  IF cardinality(show_trgm('عود')) = 0 THEN
    RAISE EXCEPTION 'This database does not treat Arabic letters as word characters. Create it with a UTF-8 locale such as C.UTF-8 (see docs/database.md).';
  END IF;
END
$$;
