# ADR-0010: Hosting and deployment target

- **Status:** Accepted as target; provider is locked in Phase 13
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D9
- **بالعربي:** نختار VPS واحد خلف Cloudflare كهدف إنتاج (single origin)، مع كود قابل للنقل. الاختيار النهائي للمزود يُقفل في Phase 13.

## Context
Minimum cost, always-on, and compatible with the single-origin SEO shell (ADR-0002).

## Decision
- Target: one small VPS running Caddy, the backend and PostgreSQL (Docker Compose or systemd), with Cloudflare (free) in front, R2 for media, and a nightly encrypted `pg_dump` to R2. Staging uses the same pattern on a second small VPS with `noindex`.
- The code stays portable: Dockerfile and env-only configuration. Development already uses single-origin routing through the Vite proxy.
- Deploys run from GitHub Actions by manual trigger (`workflow_dispatch`). A restore drill is mandatory before launch (Phase 13). Uptime monitoring pings `/readyz`.
- Facts checked on 2026-10-08:
  - Neon free plan: 100 CU-hours and 1 GB per project, compute suspends after 5 minutes of inactivity. This makes it suitable for staging at most.
  - R2 free tier as in ADR-0009.
  - Hetzner's public pages listed plans but showed no prices, and some plans showed as unavailable. A price of roughly 4 to 6 EUR per month for small plans came only from a third-party listing and is **unverified**. Verify at purchase time.

## Options considered
- Split PaaS (frontend host plus backend host plus managed Postgres): less operations work, but the frontend host cannot inject the SEO shell, cold starts hurt a store, and cost grows.
- Cloudflare Workers with D1: cheap, but not Postgres, which the integrity model needs.

## Consequences
- Lowest running cost and no cold starts. The owner is responsible for OS patches, backups and monitoring, supported by runbooks.
- **Compression is the reverse proxy's job.** The Node server sends files uncompressed. Caddy (or Cloudflare) must compress text responses (`encode zstd gzip` in Caddy). Measured at the end of Phase 1 with Lighthouse mobile: the main script is 430 KB raw and 133 KB gzip; performance scored 78 without compression and 94 to 97 (three runs) with gzip. The Phase 13 deployment runbook must include this and a check that `content-encoding` is present.

## Revisit when
Operations burden becomes a problem, or one VPS is no longer enough.
