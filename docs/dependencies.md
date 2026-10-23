# Dependency register

Rule (ADR-0013, ADR-0014): no dependency without a written reason. Add a row here in the same
change that adds the package. Versions are the ranges in each `package.json`; the exact versions are
in `pnpm-lock.yaml`.

Supply chain: pnpm's `minimumReleaseAge` policy refuses versions that are too new. When it blocked a
version we pinned an older, mature one instead of adding an exclusion: `@fastify/helmet` is pinned to
`13.1.1` and `jsdom` to `30.1.2`. Raise them when the newer versions have aged. The `esbuild`
build script is denied in `pnpm-workspace.yaml` because it ships prebuilt binaries.

Checked on 2026-10-19: `pnpm audit` reports no known vulnerabilities.

## Root (tooling only, nothing ships to users)

| Package | Why |
| --- | --- |
| `@biomejs/biome` | One tool for lint and format instead of ESLint, Prettier and plugins (ADR-0014). |
| `typescript` | Type checking and the backend build. Version 7 works with `tsc -b` and project references; the fallback to 6.x allowed by ADR-0013 was not needed. |

## `packages/shared`

| Package | Why |
| --- | --- |
| `zod` | Schemas for contracts both sides must agree on (error shape, health response). |
| `vitest` (dev) | Unit tests. |

## `apps/backend`

| Package | Why |
| --- | --- |
| `fastify` | HTTP server (ADR-0003): small, fast, first-class JSON schema validation and `inject` for tests. |
| `fastify-type-provider-zod` | Uses the same Zod schemas for request validation and response types. |
| `zod` | Validates environment variables at startup and API input. |
| `@fastify/helmet` (pinned `13.1.1`) | Security headers and the strict Content-Security-Policy. |
| `@fastify/static` | Serves the built frontend files with safe path handling (no hand-written path code). |
| `@scentiq/shared` | Shared contracts and route table. |
| `tsx` (dev) | Runs TypeScript with reload during development. |
| `@types/node`, `vitest` (dev) | Node types and tests. |

## `apps/frontend`

| Package | Why |
| --- | --- |
| `react`, `react-dom` | UI library (ADR-0013). |
| `react-router` | Routing with lazy routes, so Perfume Studio is its own chunk that shoppers never download. |
| `@tanstack/react-query` | Server state: caching, de-duplication, loading and error states. |
| `zod` | Checks API responses at runtime so a wrong backend answer becomes a clean `invalid_response` error instead of a crash. Costs bundle size; see the budget below. |
| `@fontsource/cormorant-garamond`, `@fontsource/el-messiri`, `@fontsource/ibm-plex-sans-arabic` | Self-hosted fonts. The CSP allows only our own origin, and no visitor data goes to a font CDN. Only the files for the weights and scripts we use are referenced. |
| `@scentiq/shared` | Shared contracts, money formatting and the route table. |
| `vite`, `@vitejs/plugin-react` (dev) | Dev server and production build. |
| `tailwindcss`, `@tailwindcss/vite` (dev) | Utility styling with design tokens as CSS variables and logical properties for RTL. |
| `vitest`, `jsdom` (pinned `30.1.2`), `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` (dev) | Component tests in a simulated browser. |
| `@playwright/test` (dev) | End-to-end tests in real browsers against the real backend. |
| `@axe-core/playwright` (dev) | Automated accessibility checks inside the end-to-end tests. |
| `@types/node`, `@types/react`, `@types/react-dom` (dev) | Type definitions. |

Bundle budget: initial JavaScript for storefront routes about 150 KB gzip (ADR-0013). At the end of
Phase 1 it is about 136.5 KB, so there is roughly 13 KB of headroom for the next phases.
`@tanstack/react-query` and `zod` are in that number although the home page does not use them yet
(the style guide does, and Phase 3 will); revisit if the headroom is needed before then.

## Planned, not installed

ADR-0013 and ADR-0004 name libraries that are deliberately not installed yet. Each is added, with a
row above, in the phase that first needs it: Zustand (cart, wishlist), React Hook Form (checkout and
Studio forms), `lucide-react` (icons), PostgreSQL driver and Drizzle (Phase 2, after its spike),
`sharp` (media, Phase 3 or later).
