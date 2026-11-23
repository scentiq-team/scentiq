# Dependency register

Rule (ADR-0013, ADR-0014): no dependency without a written reason. Add a row here in the same
change that adds the package. Versions are the ranges in each `package.json`; the exact versions are
in `pnpm-lock.yaml`.

Supply chain: pnpm's `minimumReleaseAge` policy refuses versions that are too new. When it blocked a
version we pinned an older, mature one instead of adding an exclusion: `@fastify/helmet` is pinned to
`13.1.1` and `jsdom` to `30.1.2`. Raise them when the newer versions have aged. The `esbuild`
build script is denied in `pnpm-workspace.yaml` because it ships prebuilt binaries.

Override (added 2026-10-27): `@esbuild-kit/core-utils>esbuild` is pinned to `0.25.12` in `pnpm-workspace.yaml`. `drizzle-kit` 0.31.11 depends on a deprecated loader that pulls `esbuild` 0.18.20, which has advisory GHSA-67mh-4wv8-2f99 (esbuild's development server, which nobody runs here). `0.25.12` is the version `drizzle-kit` itself already uses. Remove the override when `drizzle-kit` drops `@esbuild-kit/*`. `pnpm db:generate` ("No schema changes") proves the tool still loads.

Checked on 2026-10-24: `pnpm audit` reports no known vulnerabilities. It had reported 11 after new
advisories appeared (undici through jsdom, fast-uri through fastify); the lockfile now resolves the
patched `undici` 8.12.3, `fast-uri` 3.1.9 and `fast-uri` 4.2.3 with no override. CI runs
`pnpm audit --audit-level high` on every push, so a new high advisory shows up as a red check.

## Root (tooling only, nothing ships to users)

| Package | Why |
| --- | --- |
| `@biomejs/biome` | One tool for lint and format instead of ESLint, Prettier and plugins (ADR-0014). |
| `typescript` | Type checking and the backend build. Version 7 works with `tsc -b` and project references; the fallback to 6.x allowed by ADR-0013 was not needed. |
| `@vitest/coverage-v8` (dev, pinned `5.0.4`) | Measures the ADR-0014 target (at least 90% on pure domain logic). Added in STEP 3 with `pnpm --filter @scentiq/shared test:coverage`, which fails below 90%. It must match the `vitest` version exactly, so it is pinned and moves together with it. |

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
| `drizzle-orm` (pinned `0.45.4`) | Typed queries and the SQL migrator that production runs (ADR-0004). Chosen over Prisma and Kysely by the spike, which proved CHECK, partial unique indexes, trigram, `FOR UPDATE`, triggers and hand-edited migrations. 1.0 is still a release candidate, so the stable 0.45 line is pinned. |
| `pg` (pinned `8.23.1`) | PostgreSQL driver used by Drizzle. One pool, created in `src/db/client.ts`. |
| `tsx` (dev) | Runs TypeScript with reload during development, and runs the database command line tools. |
| `drizzle-kit` (dev, pinned `0.31.11`) | Writes migration files after a schema change (`pnpm db:generate`). Never runs in production. Pulls a deprecated `@esbuild-kit/*` loader, see the override note below. |
| `@types/pg` (dev, pinned `8.23.1`) | Types for `pg`. |
| `sharp` (`^0.35.5`) | The only image decoder and encoder (ADR-0009, added in STEP 3). Every upload is decoded and re-encoded to WebP, which removes EXIF/GPS and anything hidden in the file; `limitInputPixels` stops decompression bombs. Chosen because it is the standard native (libvips) image library for Node, fast, and has a built-in pixel limit and a bytes-in, bytes-out API that fits this pipeline; shelling out to ImageMagick would add a process boundary and a larger attack surface. It ships prebuilt binaries as optional packages, so there is no build script to allow. Its libvips binaries are LGPL-3.0: we link them dynamically as shipped and do not modify them. Verified on 0.35.5: JPEG, PNG, WebP and AVIF decode; **HEIC/HEVC does not** (libheif reads the file's metadata but has no HEVC decoder), so iPhone HEIC uploads are refused with their own reason and the uploader is asked for JPEG (`docs/database.md`, media). |
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
Studio forms), `lucide-react` (icons).
