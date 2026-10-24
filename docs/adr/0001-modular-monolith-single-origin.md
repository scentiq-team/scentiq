# ADR-0001: Modular monolith on a single origin (greenfield)

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D1, D3 (shape only), D9 (single-origin assumption)
- **بالعربي:** بناء جديد من الصفر. backend واحد مقسّم إلى modules، وكل شيء يُخدم من origin واحد في الإنتاج.

## Context
ScentIQ is a single-vendor luxury perfume store for Iraq. Assumed scale: about 100 products at launch growing to a few thousand, and tens to hundreds of orders per day. One developer. It must run comfortably on Windows, and the backend must be a separate, clearly isolated part of the project.

## Decision
- Greenfield pnpm monorepo: `apps/frontend`, `apps/backend`, `packages/shared`. It is a new build on the new stack, not a migration of any earlier code.
- The backend is one Fastify process organised as a modular monolith. Each module follows `routes -> service -> repository`. Isolation is by code boundary and API contract (REST plus shared Zod schemas), not by separate deployables.
- In production everything is served from one origin: Cloudflare -> Caddy -> static assets, `/api/v1/*`, and the SEO shell. In development a Vite proxy mimics this.
- No microservices, Redis, message queue or search cluster in v1. Background jobs run in-process guarded by Postgres advisory locks. Rate limiting is in-memory plus Cloudflare rules.

## Options considered
- Microservices: rejected. Operating cost with no scaling need.
- Static frontend host plus a separate API origin: rejected. It breaks the SEO shell and adds CORS and cross-site cookie problems.
- Modular monolith, single origin: chosen.

## Consequences
- Simple operations and testing, with one deployable unit.
- Free static frontend hosts cannot be used for the storefront.
- The in-memory rate limiter assumes a single backend instance.

## Revisit when
More than one backend instance is needed, or sustained load exceeds one small VPS.
