# ScentIQ

متجر عطور فاخرة، عربي أولاً (RTL) وللموبايل أولاً وللعراق أولاً. بائع واحد، الدفع عند الاستلام، الشراء كضيف، والعملة الدينار العراقي (IQD).

A luxury perfume store: Arabic-first, RTL, mobile-first, Iraq-first. Single vendor, Cash on Delivery,
guest checkout, IQD. The admin area is called **Perfume Studio**.

**Status:** Phase 1 (Foundation) is finished and waiting for review. There is no catalog, cart or checkout yet.
The phase plan is in [docs/adr/0017-phase-plan-scope-agreement.md](docs/adr/0017-phase-plan-scope-agreement.md).

## Layout

| Folder | What it is |
| --- | --- |
| `apps/frontend` | React 19 + Vite + Tailwind. Storefront routes, plus the lazy `/studio/*` placeholder. |
| `apps/backend` | Fastify API. Also serves the built frontend and fills the SEO shell for every page. |
| `packages/shared` | Contracts and pure helpers used by both sides (money, locale, routes, error shape). No database types. |
| `docs/` | Decisions ([adr](docs/adr/README.md)), [Windows setup](docs/setup-windows.md), [dependency register](docs/dependencies.md). |
| `scripts/` | Node scripts (not bash, so they run on Windows): import boundaries, production bundle check, clean. |

## Quick start

You need Node 24 LTS and pnpm 12 (see [docs/setup-windows.md](docs/setup-windows.md) for Windows).

```
pnpm install
cp apps/backend/.env.example apps/backend/.env   # Windows: copy apps\backend\.env.example apps\backend\.env
pnpm dev                                         # frontend on :5173, backend on :3000
```

Open `http://localhost:5173`. The developer style guide is at `/dev/style-guide` (development only).

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Builds `shared`, then runs the frontend and the backend with reload. |
| `pnpm lint` | Biome (lint and format check) and the import-boundary check. |
| `pnpm typecheck` | `tsc -b` for all projects, plus the test files. |
| `pnpm test` | Unit and component tests (Vitest) for every package. |
| `pnpm build` | Production build of `shared`, `backend` and `frontend`. |
| `pnpm check:bundle` | Fails if developer pages leaked into the production frontend build. |
| `pnpm test:e2e` | Playwright against the real backend and an "e2e" frontend build. Needs `pnpm --filter @scentiq/frontend exec playwright install chromium` once. |
| `pnpm check` | Lint, typecheck, test, build and bundle check, in that order. |
| `pnpm start` | Runs the built backend, which also serves the built frontend on `http://localhost:3000`. |
| `pnpm format` | Fixes formatting with Biome. |

## Ground rules

- The backend decides price, stock, delivery fee, order total and permissions. The frontend only displays them.
- No invented reviews, orders, customers, ratings, sales or scarcity in production. Sample data exists only in development, test and staging.
- Secrets never go to Git. Only `*.env.example` files are committed, and every new variable is added to them.
- No dependency without a written reason in [docs/dependencies.md](docs/dependencies.md).
- Every user-facing string has an Arabic and an English version; empty states are designed, not blank.
