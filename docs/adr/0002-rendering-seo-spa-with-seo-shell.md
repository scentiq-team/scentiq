# ADR-0002: Rendering and SEO — Vite SPA with a backend-injected SEO shell

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D2, D11
- **بالعربي:** نعتمد Vite SPA مع SEO shell يحقنه الـ backend (meta وJSON-LD ومحتوى أساسي) ويُقدَّم بنفس الشكل للزائر والـ crawler. الـ SSR الكامل escape hatch موثق.

## Context
A SPA ships an empty initial HTML document. Google can execute JavaScript, but with delay and no guarantee. WhatsApp, Telegram, Facebook and Instagram link previews do not execute JavaScript at all, and sharing product links on WhatsApp is a primary sales channel in Iraq. Google's own guidance calls dynamic rendering a workaround, not a long-term solution, recommends server-side rendering, static rendering or hydration, and accepts differing bot/user output only when the content is equivalent.

## Decision
- Keep the Vite React SPA. The backend serves the built `index.html` and injects, per route, the head tags (title, description, canonical, Open Graph, hreflang, robots), JSON-LD, and a minimal visible content block (H1, brand, price, description, notes, internal links).
- The same HTML is served to everyone. There is no User-Agent sniffing. React takes over with `createRoot`, so there is no hydration mismatch.
- Covered pages: Product, Brand, Collection, Note landing pages and static pages. Studio routes are `noindex`.
- Search results and filter combinations are `noindex,follow` with a canonical to the clean listing.
- Out-of-stock products stay 200 with `OutOfStock`. Unpublished products return 404. Slug changes return 301 through `slug_redirects`.
- `sitemap.xml` is an index generated from the database. `robots.txt` is environment-aware, and staging sends `X-Robots-Tag: noindex`.
- JSON-LD: Product with Offer (real price, currency IQD, real availability), BreadcrumbList, Organization. `aggregateRating` only from real approved reviews.
- Slugs are Latin and transliterated, because Arabic URLs become percent-encoded when shared.

## Options considered
- Pure SPA: rejected (weak previews, unreliable indexing).
- Build-time prerender: rejected for products (every price or stock edit would need a rebuild).
- SSR with React Router framework mode or Vike: documented escape hatch, not chosen now.

## Consequences
- Content exists in two renderings (server template and React), so there is a drift risk. The server block stays minimal and is covered by tests that fetch HTML without JavaScript.
- Hosting must let the backend serve the HTML (see ADR-0010).

## Revisit when
Search Console shows pages not indexed or indexed with incomplete content. Then move to SSR.
