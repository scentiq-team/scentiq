# ADR-0013: Frontend stack

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D2, D10, D14, D16
- **بالعربي:** React 19 مع Vite وTailwind، ومكتبات قليلة لكل واحدة سبب مكتوب.

## Context
Arabic-first, RTL, mobile-first, luxury feel, and no library without a stated reason.

## Decision
- Vite 8 with `@vitejs/plugin-react`; React 19 and TypeScript strict. TypeScript 7 is new, so Phase 1 verifies that the toolchain works on it and falls back to the latest 6.x if not.
- React Router 8 in library (data router) mode with lazy routes. Filter and sort state lives in URL search params so it is shareable.
- TanStack Query 5 for server state (caching, deduplication, loading and error states).
- Zustand 5 with `persist` for cart, wishlist and recently viewed.
- React Hook Form with the Zod resolver, reusing the shared schemas.
- Tailwind CSS 4 with design tokens as CSS variables and logical properties (`ms-`, `ps-`, `start`, `end`) for correct RTL. Custom components, no UI kit.
- i18n: a small typed dictionary plus `Intl` (Arabic default, English under `/en`); i18next only if more languages arrive. Prices and phone numbers use Western digits, and Arabic-Indic digits are accepted on input.
- Page metadata through React 19's native `<title>` and `<meta>`. Native `<dialog>` for drawers and modals. Radix only in Studio and only if needed. `lucide-react` icons. CSS-only motion respecting `prefers-reduced-motion`.
- Feature-based structure (`features/storefront`, `features/studio`, shared `ui/`) with lint rules for import boundaries. Studio is a set of lazy routes under `/studio/*`, `noindex`.
- Target budget: initial JavaScript for storefront routes around 150 KB gzip, enforced in Phase 12.
- Not adding: Redux, axios, moment or date-fns, lodash, react-helmet, framer-motion, CSS-in-JS, UI kits, i18next (for now).

## Options considered
- CSS Modules instead of Tailwind: more files and manual consistency.
- A separate Studio app: possible later because the feature boundary is already enforced.

## Consequences
- Small bundle, consistent RTL behavior. Utility-class verbosity is contained by components.

## Revisit when
Studio bundle size or team size justifies a separate app, or more languages are needed.

## Phase 1 verification (2026-10-19)
- TypeScript 7.0.2 works with `tsc -b`, project references and the Vite and Vitest toolchain, so the fallback to 6.x was not needed.
- Initial JavaScript at the end of Phase 1 is about 136.5 KB gzip against the 150 KB budget.
- Zustand, React Hook Form and `lucide-react` are not installed yet; each arrives in the phase that first needs it, with a row in `docs/dependencies.md`.
