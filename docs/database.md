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
| `apps/backend/src/db/seed/` | The seed runner, the list of seeders, the reference and sample data (`data/`), and `tracking.ts` (registers sample rows). |
| `apps/backend/src/modules/catalog/` | Catalog services (brands, categories, notes, tags, products, variants, images, collection rules). No HTTP routes yet. |
| `apps/backend/src/modules/media/` | Image library: type detection, safe conversion, storage. No upload endpoint yet. |
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

The catalog depends on this: `products.search_document` (Arabic and English text, normalized) has a trigram index. The normalizer in `packages/shared/src/arabic-search.ts` follows [ADR-0005](adr/0005-arabic-first-search-in-postgres.md) with **two extensions the ADR did not list**, both folding rules of the same kind as the ones it lists:

- Persian `ک` and `ی` (what Persian and Kurdish keyboards type) become `ك` and `ي`.
- Latin accents are removed, so "Chloé" is found by "chloe".

Both are applied to the indexed text and to the shopper's query by the same function, so they cannot disagree. The displayed text never changes.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm db:migrate` | Applies pending migrations in one transaction (uses `MIGRATION_DATABASE_URL`). Safe to run again. |
| `pnpm db:generate` | Development only. After you change `src/db/schema/`, writes a new migration into `migrations/`. Review the SQL. |
| `pnpm db:reset` | Development only. Drops everything and migrates again. Refuses unless `APP_ENV` is `development` or `test` **and** the database is on this computer. "On this computer" is checked on every host the driver could use, including `?host=` and `?hostaddr=` in the URL. |
| `pnpm seed:reference` | Real, production-safe reference data: categories, olfactive families and which ones are close to each other, note groups, starter notes (with search aliases), the tag vocabulary. Repeatable: it only inserts what is missing (by slug), so a name changed in Studio is never overwritten and a slug retired on purpose never comes back. Writes nothing when nothing is missing. The Arabic names are a first draft for the owner to review. |
| `pnpm seed:dev` | Sample data: 5 invented brands and 20 products with placeholder images, built through the real catalog services and media pipeline (16 published, 3 incomplete drafts, 1 archived). Refuses unless `APP_ENV` is `development` or `staging`, and in development also refuses a database that is not on this computer. Records **every row it inserts, in every table** in `sample_data_registry`. Safe to run twice. Images go to `MEDIA_LOCAL_DIR` (default `.data/media`, git-ignored). |
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

| `brands`, `categories`, `families`, `note_groups`, `notes`, `tags`, `collections`, `products` | Slug is Latin lower case with single hyphens, at most 120 characters, and unique | `<table>_slug_format`, `<table>_slug_uq` (`tags_type_slug_uq`: unique per tag type) |
| the same tables | Arabic name is required; every name is 1 to 200 characters after trimming | `<table>_name_ar_valid`, `<table>_name_en_valid` |
| `brands`, `notes` | English name is unique ignoring case | `brands_name_en_uq`, `notes_name_en_uq` |
| `brands` | Country is an ISO code such as `FR`; template key is a plain identifier | `brands_country_code_format`, `brands_template_key_format` |
| `categories` | Not its own parent; at most two levels deep | `categories_not_own_parent`, trigger `categories_max_depth` |
| `family_adjacency` | A pair is stored once, smaller id first; weight 1 to 100 | `family_adjacency_ordered_pair`, `family_adjacency_weight_range` |
| `note_aliases` | 1 to 60 characters; unique per note ignoring case | `note_aliases_alias_valid`, `note_aliases_note_alias_uq` |
| `tags` | Type is `occasion`, `season`, `mood` or `feature` | `tags_type_valid` |
| `products` | Gender, concentration, intensity (1 to 5) and status are from the fixed lists | `products_gender_valid`, `products_concentration_valid`, `products_intensity_range`, `products_status_valid` |
| `products` | A secondary family needs a primary one and must differ from it | `products_families_distinct` |
| `products` | `archived_at` is set exactly when archived; a published product has `published_at` | `products_archived_at_matches_status`, `products_published_has_timestamp` |
| `products` | Cannot be published without Arabic description, category, primary family, SEO title and SEO description | `products_published_required_fields` |
| `products` | Cannot be published without 3 notes, 1 live variant and 1 image with Arabic alt text; cannot be created as published | trigger `products_publish_gate` (constraint name `products_publish_requires_children`) |
| `product_variants` | SKU format and unique; size 1 to 10 000 in `ml`, `g` or `pcs`; price 1 to 100 000 000 IQD; a "before" price is higher than the price; one live variant per size | `product_variants_sku_format`, `product_variants_sku_uq`, `product_variants_size_value_range`, `product_variants_size_unit_valid`, `product_variants_price_range`, `product_variants_compare_at_above_price`, `product_variants_live_size_uq` |
| `product_notes` | A note is added to a product once; position is `top`, `heart` or `base`; prominence 1 to 3 | `product_notes_pk`, `product_notes_position_valid`, `product_notes_prominence_range` |
| `product_images` | An image is added to a product once; at most 20 per product (positions 0 to 19); an image in use cannot be deleted | `product_images_pk`, `product_images_position_range`, foreign key `product_images_media_id_media_assets_id_fk` |
| `media_assets`, `media_variants` | Storage key is a random-looking lower-case path (no dots, no `..`) and unique; width and height 1 to 10 000; only the widths 480, 960 and 1600; dominant colour is `#rrggbb`; alt text 1 to 300 characters | `media_assets_storage_key_format`, `media_assets_storage_key_uq`, `media_assets_dimensions_valid`, `media_variants_width_allowed`, `media_assets_dominant_color_format`, `media_assets_alt_ar_valid`, `media_assets_alt_en_valid` |
| `collections` | Kind is `manual`, `dynamic` or `hybrid`; a manual collection has no rules and the others have a JSON object of at most 8 192 bytes; a schedule ends after it starts; home position 1 to 12 and unique | `collections_kind_valid`, `collections_rules_match_kind`, `collections_rules_object`, `collections_schedule_ordered`, `collections_home_position_range`, `collections_home_position_uq` |
| `collection_products` | A product is pinned (with a position) or excluded (without one), never both | `collection_products_mode_valid`, `collection_products_position_matches_mode` |
| `slug_redirects` | A retired slug points to exactly one entity of a known type | `slug_redirects_old_slug_uq`, `slug_redirects_entity_type_valid` |

`updated_at` is kept by one trigger function, `set_updated_at()`, on the tables staff edit.

The services repeat the rules that need a friendly message (and the one the database cannot see: a published product can never lose a note, its last variant or its last image with alt text). When a service is refused by the database it reports the **name of the constraint**, never the database message, and the tests check that name.

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

## Images (ADR-0009)

The media library (`apps/backend/src/modules/media/`) has no HTTP endpoint yet; Studio (Phase 7) adds it. What it does with every uploaded file:

1. Refuses files over 10 MB or empty.
2. Decides the type from the **first bytes**, never from the file name or the `Content-Type` the sender claims. Only JPEG, PNG and WebP pass. SVG, PDF, HTML, GIF, AVIF and anything unknown are refused; SVG can carry script, so it is never accepted.
3. Looks at the structure: another format hiding after the end of the image (a "polyglot" such as a JPEG that is also a PDF or a ZIP) is refused, and so is an animated PNG or WebP.
4. Reads the header without decoding: more than 50 million pixels is refused (a 40 KB file can declare billions of pixels), and so is a width under 480 px (images are never enlarged).
5. Decodes and **re-encodes to WebP** at 480, 960 and 1600 px wide (only the widths the source is at least as wide as), applying the EXIF rotation to the pixels. The uploaded bytes are never stored or served, so EXIF, GPS, comments, trailing data and anything else that was not pixels is gone.

Files are written first, then the database rows and the audit entry in one transaction; if anything fails the files are removed. A crash between the two steps can leave files without rows; a cleanup sweep belongs to the deployment phase. Deleting an image is refused while a product, brand or collection uses it.

**HEIC (iPhone photos):** recognised and refused with its own reason, `heic_not_supported`. Verified on sharp 0.35.5 (libvips 8.18.7, libheif 1.23.5): HEIC metadata can be read but pixels cannot be decoded ("HEVC decoder not built in"), while AVIF decodes. The uploader is asked for JPEG (iPhone: Settings, Camera, Formats, Most Compatible). Supporting HEIC would need a different libvips build or a converter; that is a decision for when real photos arrive, not for now.

Storage is the `MediaStorage` interface. The local-disk driver (development and tests) keeps files under `MEDIA_LOCAL_DIR`; the Cloudflare R2 driver arrives with the deployment phase behind the same interface. Keys are random and validated, and a key is written once.

## Seeds and sample data

Two levels, one runner ([ADR-0015](adr/0015-seed-and-sample-data-policy.md)): `seed:reference` (real data, safe anywhere) and `seed:dev` (fake data, development and staging only). The sample rows of `seed:dev` are found by the production gate because **every** row it inserts is registered: `tracking.ts` snapshots the primary keys of every table in `public` before and after the seeder runs and registers whatever is new (join tables by their key columns joined with `:`). A table nobody remembered cannot hide sample data, and a new table is covered automatically. The test compares, table by table, the rows added with the rows registered, counting independently of the tracker.

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
