# ADR-0004: Database — PostgreSQL 18 with Drizzle ORM (gated by a spike)

- **Status:** Accepted, gated by the Phase 2 spike
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D4
- **بالعربي:** PostgreSQL 18 مع Drizzle. لا نقفل Drizzle نهائياً قبل spike صغير في Phase 2.

## Context
Inventory and order integrity need transactions, row-level atomic updates, CHECK constraints, partial unique indexes, append-only triggers and trigram indexes for fuzzy search.

## Decision
- PostgreSQL 18 (minimum 16). On 2026-10-08 the PostgreSQL project listed 14 to 18 as supported, 18 (18.6) as the latest major, with 18 supported until 2030.
- Drizzle ORM (0.45 stable line), `drizzle-kit` SQL migrations committed to git and editable by hand, `pg` driver.
- Conventions: money as integer IQD (no floats); `timestamptz` in UTC; UUIDv7 primary keys (PostgreSQL 18 should provide `uuidv7()`; the spike confirms it, fallback is application-generated); catalog entities are archived, not deleted; order items are snapshots.
- Database-enforced rules: `on_hand >= 0`, `reserved >= 0`, `reserved <= on_hand`; unique SKU and slug; price > 0; `compare_at > price`; unique idempotency key; append-only `inventory_movements`, `audit_logs`, `order_status_history` (trigger blocks UPDATE and DELETE); RESTRICT foreign keys from orders to catalog.
- **Spike gate (Phase 2, first task):** prove CHECK, partial unique index, GIN trigram index, `FOR UPDATE`, append-only trigger and the hand-edited migration workflow with Drizzle. If any fails, fall back to Prisma 7 with SQL migrations, or Kysely with plain SQL migrations.
- Pin exact versions. Drizzle 1.0 and Prisma 8 were both release candidates on 2026-10-08.

## Options considered
- Prisma: familiar, but CHECK constraints, partial indexes and triggers would live outside its schema and risk drift.
- Kysely plus SQL migrations: maximum control, more boilerplate.
- SQLite or MySQL: lack the concurrency and trigram features needed.

## Consequences
- Stronger integrity guarantees at the database layer.
- Some migrations are hand-written SQL.

## Revisit when
The spike fails, or Drizzle 1.0 ships with a migration format change.
