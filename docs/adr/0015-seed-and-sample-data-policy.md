# ADR-0015: Seed system and sample-data policy

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D19
- **بالعربي:** بيانات العينة في التطوير فقط، والإنتاج يرفض أي صف عينة. لا مراجعات ولا طلبات ولا تقييمات ولا scarcity وهمية.

## Context
The brief forbids fake reviews, orders, customers, ratings, sales and scarcity in production, while development and staging need realistic data.

## Decision
- Three seed levels: `seed:reference` (governorates, roles, note groups, families; real data, production-safe), `seed:dev` (fake brands, products, orders; refuses to run unless `APP_ENV` is `development` or `staging`), and `seed:owner` (creates the first Owner with a password entered at run time).
- `seed:dev` records every row it inserts in `sample_data_registry`. The deployment gate `assert-no-sample-data` fails if the registry is not empty in production.
- Review collection begins at launch through invitations sent after delivery (Phase 9). No review, rating or count is displayed until real approved reviews exist.
- Scarcity and "popular" indicators come only from real stock and real events (ADR-0006, ADR-0005).

## Options considered
- An `is_sample` column on every table: pollutes the schema, rejected.

## Consequences
- A single, checkable guarantee that production contains no sample data.

## Revisit when
New entity types are added: they must register their sample rows too.
