# ScentIQ — Architecture Decision Log (Phase 0, accepted 2026-10-09)

All records linked below were accepted on 2026-10-09 (Phase 0). Each ADR starts with a one-line Arabic summary.

| ADR | Title | Status | Confirms |
|---|---|---|---|
| [0001](0001-modular-monolith-single-origin.md) | Modular monolith on a single origin (greenfield) | Accepted | D1, D3, D9 |
| [0002](0002-rendering-seo-spa-with-seo-shell.md) | Vite SPA with a backend-injected SEO shell | Accepted | D2, D11 |
| [0003](0003-backend-fastify-zod-rest.md) | Fastify 5, Zod 4, REST | Accepted | D3, D16 |
| [0004](0004-database-postgresql-drizzle.md) | PostgreSQL 18 with Drizzle | Accepted (Phase 2 spike passed 2026-10-26) | D4 |
| [0005](0005-arabic-first-search-in-postgres.md) | Arabic-first search inside PostgreSQL | Accepted | D5 |
| [0006](0006-inventory-on-hand-reserved.md) | on_hand / reserved with atomic reservation | Accepted | D12 |
| [0007](0007-order-checkout-integrity.md) | Order and checkout integrity, abuse control | Accepted | D13, D14 |
| [0008](0008-admin-auth-rbac-audit.md) | Admin auth, 8-role RBAC, audit logs | Accepted (role names adjustable) | D6, D7 |
| [0009](0009-media-storage-safe-uploads.md) | Media storage and safe uploads | Accepted | D8 |
| [0010](0010-hosting-deployment-target.md) | Hosting and deployment target | Accepted as target; provider locked in Phase 13 | D9 |
| [0011](0011-rule-based-recommendations.md) | Rule-based recommendation engine | Accepted | D14 |
| [0012](0012-product-data-model-collections.md) | Product data model, collections, brand templates | Accepted | D15, D18 |
| [0013](0013-frontend-stack.md) | Frontend stack | Accepted | D2, D10, D14, D16 |
| [0014](0014-tooling-testing-ci-windows.md) | Tooling, testing, CI, Windows rules | Accepted | D16 |
| [0015](0015-seed-and-sample-data-policy.md) | Seed system and sample-data policy | Accepted | D19 |
| [0016](0016-localization-formatting.md) | Localization and formatting conventions | Accepted | D10, D11 |
| [0017](0017-phase-plan-scope-agreement.md) | Phase plan, scope, working agreement | Accepted | D17, D19 |

## Defaults taken for the three open items from Step 0
- **D7 role names:** the default eight roles in ADR-0008. They can be renamed before Phase 2 starts.
- **D10 English UI:** included in the MVP under `/en`.
- **D15 categories:** the default list in ADR-0012. It is finalized at the start of Phase 3.
