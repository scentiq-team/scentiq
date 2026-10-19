# ADR-0017: Phase plan, scope, and working agreement

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D17, D19
- **بالعربي:** الخطة 16 خطوة بعد تقسيم 6 و7، وكل phase تُنفَّذ وتُراجَع وتُقدَّم بتقرير ثابت قبل الانتقال للتالية.

## Context
The original plan had 14 phases. Two were too large to verify as a unit.

## Decision
- Phases: 0 decisions, 1 foundation, 2 database and backend core, 3 catalog data layer, 4 storefront core, 5 search and filters, 6A inventory and delivery engine, 6B cart, checkout and orders, 7A Studio shell and daily operations, 7B Studio catalog tools, 8 recommendations, 9 reviews and trust, 10 analytics, insights and SEO manager, 11 import, 12 hardening, 13 documentation and deployment.
- The SEO shell is spiked in Phase 1 so Phase 4 builds on a proven path. The "SEO manager" (editing overrides and redirects) stays in Phase 10.
- Milestones with a tech-debt review: M1 after Phase 3, M2 after Phase 7B (store is sellable), M3 after Phase 11, M4 in Phase 12.
- MVP includes reviews collection from launch day, basic analytics, import and the SEO manager basics. Online payments, customer accounts, automatic notifications and promotions are outside MVP.
- Execution loop for every phase: open with "STEP X" and a ready-to-use prompt, wait for confirmation, load the phase's skills, keep a short task list, build in small verified increments, run type-check, lint, build, tests and a manual flow check, debug with systematic-debugging first on any failure, run code review (and security review for auth, uploads, orders, admin APIs), check the Definition of Done, then report as: what was built, files created or modified, tests performed, issues found, issues fixed, what remains.
- Quality gates apply to every phase: each feature tied to a business reason, validation on client and server (the server decides), designed empty states, RTL and mobile checks with no horizontal scroll, subtle microinteractions, no secrets in Git, `.env.example` maintained, and Windows-compatible commands.

## Options considered
- Keeping 14 phases: rejected, 6 and 7 are too big to verify as one unit.

## Consequences
- More checkpoints, smaller verifiable increments.

## Revisit when
A milestone review shows a different order would reduce risk.
