# ADR-0014: Tooling, testing, CI, and Windows rules

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D16
- **بالعربي:** pnpm وBiome وVitest وPlaywright، وCI على Windows وUbuntu، وكل السكربتات بـ Node حتى تعمل على Windows.

## Context
Commands and setup must work on Windows, and the toolchain must stay small.

## Decision
- pnpm workspaces (no Turborepo or Nx), Node 24 LTS pinned in `.node-version`. On 2026-10-08 the Node project listed v24 and v22 as LTS and v26 as Current.
- Biome 2 for lint and format (one tool instead of ESLint, Prettier and plugins).
- `tsx` for development, `tsc -b` with project references for builds.
- Vitest 5 and Testing Library for unit and component tests; Fastify `inject` with a real PostgreSQL test database for backend integration; Playwright for end to end (Chromium, WebKit and a mobile profile) with `@axe-core/playwright` for accessibility. No Docker is required for tests.
- All scripts are Node scripts, not bash. `.gitattributes` forces LF. No reliance on symlinks. Paths go through `node:path`. Env via `node --env-file` plus Zod validation.
- CI on GitHub Actions: a matrix of `windows-latest` and `ubuntu-latest` for install, lint, typecheck, unit tests and build; database tests on Ubuntu with a Postgres service.
- Dependency register in `docs/dependencies.md`: each dependency has a written reason.
- Test targets: at least 90% coverage on pure domain logic (money, inventory, scoring, normalization, permissions). Other areas are covered by flow tests rather than a global percentage.

## Options considered
- npm workspaces and ESLint with Prettier: acceptable alternatives, more dependencies and configuration.

## Consequences
- Fast, small toolchain. Windows regressions are caught in CI.

## Revisit when
Build times or monorepo size justify a task runner, or Biome lacks a needed rule.
