# ADR-0004: Database — PostgreSQL 18 with Drizzle ORM (gated by a spike)

- **Status:** Accepted. The Phase 2 spike passed on 2026-10-26 (see `docs/spikes/0004-drizzle-postgres18.md`).
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D4
- **بالعربي:** PostgreSQL 18 مع Drizzle. الـ spike نجح (18 من 18)، فـ Drizzle ثابت.

## Context
Inventory and order integrity need transactions, row-level atomic updates, CHECK constraints, partial unique indexes, append-only triggers and trigram indexes for fuzzy search.

## Decision
- PostgreSQL 18 (minimum 16). On 2026-10-08 the PostgreSQL project listed 14 to 18 as supported, 18 (18.6) as the latest major, with 18 supported until 2030.
- Drizzle ORM (0.45 stable line), `drizzle-kit` SQL migrations committed to git and editable by hand, `pg` driver.
- Conventions: money as integer IQD (no floats); `timestamptz` in UTC; UUIDv7 primary keys (PostgreSQL 18 should provide `uuidv7()`; the spike confirms it, fallback is application-generated); catalog entities are archived, not deleted; order items are snapshots.
- Database-enforced rules: `on_hand >= 0`, `reserved >= 0`, `reserved <= on_hand`; unique SKU and slug; price > 0; `compare_at > price`; unique idempotency key; append-only `inventory_movements`, `audit_logs`, `order_status_history` (trigger blocks UPDATE and DELETE); RESTRICT foreign keys from orders to catalog.
- **Spike gate (passed 2026-10-26):** CHECK, partial unique index, GIN trigram index on Arabic text, `FOR UPDATE`, append-only trigger, `uuidv7()` default and the hand-edited migration workflow all work with Drizzle on PostgreSQL 18.4. Fallbacks (Prisma 7 with SQL migrations, Kysely with plain SQL migrations) are not needed.
- Pinned versions: `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11, `pg` 8.23.1. Drizzle 1.0 and Prisma 8 were both release candidates on 2026-10-08.
- **Rules learned from the spike:**
  - The database must be created with a UTF-8 locale that treats Arabic letters as word characters (`C.UTF-8`, not plain `C`), or trigram search on Arabic finds nothing. A test checks this.
  - Migrations are plain SQL files run by the Drizzle migrator that ships inside `drizzle-orm` (a production dependency). `drizzle-kit` is a development tool that only generates them, so production never needs it.
  - Two database roles: an owner that runs migrations, and a least-privilege application role that only reads and writes rows. It cannot drop tables or disable the append-only triggers.
  - Driver errors are classified by one helper, because Drizzle wraps them (`error.cause.code`) and `RESTRICT` reports `23001`, not `23503`.

## Options considered
- Prisma: familiar, but CHECK constraints, partial indexes and triggers would live outside its schema and risk drift.
- Kysely plus SQL migrations: maximum control, more boilerplate.
- SQLite or MySQL: lack the concurrency and trigram features needed.

## Consequences
- Stronger integrity guarantees at the database layer.
- Some migrations are hand-written SQL.

## Revisit when
Drizzle 1.0 ships with a migration format change.
