# ScentIQ — Architecture Decision Log (Phase 0, accepted 2026-10-09)

All records below were accepted on 2026-10-09 (Phase 0). Each ADR starts with a one-line Arabic summary.

| ADR | Title | Status | Confirms |
|---|---|---|---|
| 0001 | Modular monolith on a single origin (greenfield) | Accepted | D1, D3, D9 |
| 0002 | Vite SPA with a backend-injected SEO shell | Accepted | D2, D11 |
| 0003 | Fastify 5, Zod 4, REST | Accepted | D3, D16 |
| 0004 | PostgreSQL 18 with Drizzle (spike gate in Phase 2) | Accepted, gated | D4 |
| 0005 | Arabic-first search inside PostgreSQL | Accepted | D5 |
| 0006 | on_hand / reserved with atomic reservation | Accepted | D12 |
| 0007 | Order and checkout integrity, abuse control | Accepted | D13, D14 |
| 0008 | Admin auth, 8-role RBAC, audit logs | Accepted (role names adjustable) | D6, D7 |
| 0009 | Media storage and safe uploads | Accepted | D8 |
| 0010 | Hosting and deployment target | Accepted as target; provider locked in Phase 13 | D9 |
| 0011 | Rule-based recommendation engine | Accepted | D14 |
| 0012 | Product data model, collections, brand templates | Accepted | D15, D18 |
| 0013 | Frontend stack | Accepted | D2, D10, D14, D16 |
| 0014 | Tooling, testing, CI, Windows rules | Accepted | D16 |
| 0015 | Seed system and sample-data policy | Accepted | D19 |
| 0016 | Localization and formatting conventions | Accepted | D10, D11 |
| 0017 | Phase plan, scope, working agreement | Accepted | D17, D19 |

## Defaults taken for the three open items from Step 0
- **D7 role names:** the default eight roles in ADR-0008. They can be renamed before Phase 2 starts.
- **D10 English UI:** included in the MVP under `/en`.
- **D15 categories:** the default list in ADR-0012. It is finalized at the start of Phase 3.

---

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

---

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

---

# ADR-0003: Backend — Fastify 5, Zod 4, REST

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D3, D16 (Node version)
- **بالعربي:** Fastify مع Zod وREST تحت `/api/v1`. الـ backend يرجع أكواد أخطاء والـ frontend يترجمها للعربية.

## Context
The backend is the source of truth for price, stock, delivery fee, order total and permissions. It needs strict validation, typed contracts shared with the frontend, and a small dependency footprint.

## Decision
- Node 24 LTS, TypeScript strict, Fastify 5.
- Zod 4 schemas live in `packages/shared` and are used for request validation, response typing and OpenAPI generation (`fastify-type-provider-zod`).
- REST under `/api/v1`, split into `public/*` (cacheable GETs and checkout) and `admin/*` (session cookie plus RBAC).
- Errors follow problem+json with stable error codes. The server returns codes, not display text, and the frontend maps them to Arabic or English.
- `Idempotency-Key` is required on order creation.
- Layering: `routes` (HTTP only) -> `service` (business rules and transactions) -> `repository` (SQL). Routes never touch the database.
- Config comes from env only, validated with Zod at startup (`node --env-file`, no dotenv). Logging uses pino with redaction of phone, address and tokens.

## Options considered
- Express 5: familiar, but needs more glue for validation and typing.
- NestJS: too heavy for this size.
- Hono: viable, but the Node plugin ecosystem for multipart, cookies and rate limiting is stronger on Fastify.
- tRPC or GraphQL: rejected. They couple frontend and backend by code, while the brief requires an isolated backend with an explicit contract.

## Consequences
- One schema gives validation, types and API docs.
- Team members need to learn the Fastify plugin model.

## Revisit when
A second client (mobile app, partner API) needs a versioned public contract. Then freeze `/api/v1` and publish the OpenAPI spec.

---

# ADR-0004: Database — PostgreSQL 18 with Drizzle ORM (gated by a spike)

- **Status:** Accepted, gated by the Phase 2 spike
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D4
- **بالعربي:** PostgreSQL 18 مع Drizzle. لا نقفل Drizzle نهائياً قبل spike صغير في Phase 2.

## Context
Inventory and order integrity need transactions, row-level atomic updates, CHECK constraints, partial unique indexes, append-only triggers and trigram indexes for fuzzy search.

## Decision
- PostgreSQL 18 (minimum 16). On 2026-10-08 the PostgreSQL project listed 14 to 18 as supported, 18 (18.6) as the latest major, with 18 supported until 2030.
- Drizzle ORM (0.45 stable line), `drizzle-kit` SQL migrations committed to git and editable by hand, `pg` driver.
- Conventions: money as integer IQD (no floats); `timestamptz` in UTC; UUIDv7 primary keys (PostgreSQL 18 should provide `uuidv7()`; the spike confirms it, fallback is application-generated); catalog entities are archived, not deleted; order items are snapshots.
- Database-enforced rules: `on_hand >= 0`, `reserved >= 0`, `reserved <= on_hand`; unique SKU and slug; price > 0; `compare_at > price`; unique idempotency key; append-only `inventory_movements`, `audit_logs`, `order_status_history` (trigger blocks UPDATE and DELETE); RESTRICT foreign keys from orders to catalog.
- **Spike gate (Phase 2, first task):** prove CHECK, partial unique index, GIN trigram index, `FOR UPDATE`, append-only trigger and the hand-edited migration workflow with Drizzle. If any fails, fall back to Prisma 7 with SQL migrations, or Kysely with plain SQL migrations.
- Pin exact versions. Drizzle 1.0 and Prisma 8 were both release candidates on 2026-10-08.

## Options considered
- Prisma: familiar, but CHECK constraints, partial indexes and triggers would live outside its schema and risk drift.
- Kysely plus SQL migrations: maximum control, more boilerplate.
- SQLite or MySQL: lack the concurrency and trigram features needed.

## Consequences
- Stronger integrity guarantees at the database layer.
- Some migrations are hand-written SQL.

## Revisit when
The spike fails, or Drizzle 1.0 ships with a migration format change.

---

# ADR-0005: Arabic-first search inside PostgreSQL

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D5
- **بالعربي:** البحث في v1 داخل PostgreSQL: تطبيع عربي موحد + جدول aliases + pg_trgm، بدون خدمة بحث خارجية.

## Context
Shoppers type Arabic with spelling variants, Iraqi letters, Latin brand names, transliterations and typos. v1 must not depend on a paid or extra search service.

## Decision
- One normalization function in `packages/shared`, used when indexing and when querying: strip tashkeel and tatweel; unify alef forms to `ا`; `ى` to `ي`; `ة` to `ه` (search only, display unchanged); Iraqi and Persian letters `گ`->`ك`, `چ`->`ج`, `پ`->`ب`, `ڤ`->`ف`; Arabic-Indic and Persian digits to ASCII; lowercase Latin; strip punctuation; strip the definite article `ال` at token level. No stemming.
- `search_aliases` table for transliterations and spelling variants (for example ديور / Dior, شانيل / Chanel, عود / oud). Seeded by hand for top brands and notes, managed from Studio, and fed by real zero-result searches.
- Ranking tiers: exact name or brand, prefix, alias, all tokens present (AND), fuzzy via `pg_trgm` `word_similarity`. Ties: in stock first, real popularity, recency.
- A normalized `search_document` column on products, updated in the same transaction as the save, with a GIN trigram index. All SQL is parameterized.
- Autocomplete starts at 2 characters, is debounced, and returns up to 8 results grouped as brands, notes/collections, products.
- Zero-result state suggests the nearest term and available products, and logs the term. "Popular searches" come only from real events above a minimum count and stay hidden until enough data exists.
- A golden relevance set (at least 60 queries, Arabic, English, mixed, typos) gates Phase 5. Real queries from Iraqi shoppers will be requested from the owner.

## Options considered
- Meilisearch or Typesense self-hosted: good typo tolerance, but an extra service to host and sync.
- Algolia and similar: paid, rejected.

## Consequences
- No extra infrastructure. We own the relevance logic and must test it.

## Revisit when
More than about 20,000 products, or the golden set cannot reach agreed thresholds.

---

# ADR-0006: Inventory model — on_hand / reserved with atomic reservation

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D12
- **بالعربي:** المخزون بنموذج on_hand/reserved، والحجز بتحديث شرطي ذري داخل transaction الطلب، وقيود CHECK، وledger لا يُعدَّل لكل حركة.

## Context
Overselling and negative stock destroy trust and cost money, and concurrent checkouts are the normal case once ads run.

## Decision
- Per variant: `on_hand` (physical), `reserved` (promised to open orders), `available = on_hand - reserved`.
- Lifecycle: order placed -> `reserved += q`; cancelled before shipping -> `reserved -= q`; handed to courier -> `on_hand -= q` and `reserved -= q`; failed delivery or return -> staff chooses restock or write-off; goods received or stock count -> `on_hand` changes with a mandatory reason.
- Every action writes an immutable row to `inventory_movements` (type, deltas, order, actor, reason, time).
- Reservation inside the order transaction uses one conditional atomic `UPDATE ... SET reserved = reserved + q WHERE on_hand - reserved >= q`, checking that exactly one row changed. If any line fails, the whole order rolls back and the customer is told which lines are short. Lines are processed in `variant_id` order to avoid deadlocks. READ COMMITTED is sufficient.
- CHECK constraints are the last line of defence against negative or over-reserved stock.
- The cart does not reserve stock (no timers). The final check happens on submit and shows a clear Arabic message on conflict.
- Scarcity text such as "only X left" is computed from `available` below a configurable threshold. It is never editable text.
- A nightly job verifies `on_hand = sum of movements` and `reserved = sum of open order lines`, and alerts the Owner on drift.
- Unconfirmed orders that hold stock raise an alert in Studio. There is no automatic cancellation.

## Options considered
- Read-then-write in application code: race conditions, rejected.
- `SELECT ... FOR UPDATE` then update: correct, more round trips.
- Full event sourcing: unnecessary complexity.

## Consequences
- Stock can be trusted. Stale unconfirmed orders need human follow-up.

## Revisit when
Multiple warehouses are introduced, or timed cart reservations are required for online payments.

---

# ADR-0007: Order and checkout integrity, and guest-checkout abuse control

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D13, D14
- **بالعربي:** السيرفر يعيد حساب كل الأرقام من DB ولا يقبل مبالغ من العميل. الطلب idempotent ويبدأ بحالة pending_confirmation، مع rate limits متعددة المفاتيح وقائمة هواتف محظورة.

## Context
Cash on delivery with guest checkout invites fake and duplicate orders, and any client-supplied number is attackable.

## Decision
- The client sends only variant ids and quantities, address fields, customer name and phone, and an `Idempotency-Key`. The server loads prices, checks that the product is published and the variant active, enforces quantity limits, and computes subtotal, delivery fee (area -> city -> governorate fallback) and total. It stores snapshots on the order.
- Money fields sent by the client are rejected by a strict schema, not silently ignored.
- Repeating a request with the same key returns the same order.
- Order numbers are random (for example `SQ-8F3K2M`), never sequential. Order tracking requires order number plus phone and is rate limited.
- Phones are normalized to E.164 and validated as Iraqi mobile numbers. The current operator prefixes are verified in Phase 6B.
- Abuse controls: rate limits keyed by IP, phone and combinations (mobile networks often share one IP, so IP alone is never the only key); honeypot field and minimum fill time; duplicate detection (same phone and items within 10 minutes returns the existing order); `blocked_phones` managed in Studio; cap on open orders per phone. Cloudflare Turnstile is available behind an env flag and is off by default.
- Orders start as `pending_confirmation`, and staff confirm by phone.
- Statuses: `pending_confirmation`, `confirmed`, `preparing`, `handed_to_courier`, `delivered`, plus `cancelled`, `failed_delivery`, `returned`. Allowed transitions are a tested matrix. An illegal transition returns 409.
- A separate permission controls access to customer personal data. Logs never contain phone or address. A retention policy is defined in Phase 12.
- Wishlist and recently viewed live in the browser only. There are no customer accounts in v1.

## Options considered
- SMS OTP at checkout: reliable but adds cost and friction, deferred.
- Mandatory CAPTCHA: friction on every order, kept as a switch.

## Consequences
- Staff effort for confirmation calls. Strong protection against fake orders and tampering.

## Revisit when
Online payments are added, or abuse is observed that the controls above do not stop.

---

# ADR-0008: Admin authentication, RBAC for 8 roles, and audit logs

- **Status:** Accepted (role names are a default proposal, adjustable before Phase 2)
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D6, D7
- **بالعربي:** جلسات DB opaque بـ scrypt، وRBAC بصلاحيات ثابتة في الكود مع deny-by-default واختبار مصفوفة، وaudit غير قابل للتعديل داخل نفس transaction.

## Context
Only staff authenticate. Customers are guests. Permissions must be enforced in the backend, and every administrative change must be traceable.

## Decision
- Server-side sessions in Postgres. The token is 256-bit random, only its hash is stored, and it travels in an `HttpOnly`, `SameSite=Lax` cookie. `Secure` is controlled by an env flag so HTTP development keeps working.
- Passwords use `node:crypto` scrypt, minimum 12 characters. Login has rate limiting and lockout with generic error messages.
- CSRF: `SameSite`, an `Origin` check on every non-GET request, and JSON-only bodies.
- TOTP two-factor for Owner and Admin is required before launch (Phase 12).
- Default roles: Owner, Admin, Catalog Manager, Inventory Manager, Order Manager, Customer Support, Content and SEO Editor, Analyst (read-only). Roles map to permissions through a static map in `packages/shared`.
- Every admin route declares its permission (for example `products:update`). Deny by default. Startup and CI fail if a route has no permission. A matrix test exercises every route with every role.
- Access to customer personal data and to cost prices are separate permissions.
- `audit_logs` records who, what, when, from where, and a before/after diff with sensitive fields masked, in the same transaction as the change. It also records failed logins and denied permissions. It is append-only.

## Options considered
- JWT access and refresh tokens: hard to revoke, role changes are not immediate.
- An auth library (Better Auth, Lucia): acceptable, but adds a dependency and schema coupling for an admin-only login.

## Consequences
- Immediate revocation and permission changes. Session storage and cleanup are our responsibility.

## Revisit when
Customer accounts or single sign-on are introduced.

---

# ADR-0009: Media storage and safe uploads

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D8
- **بالعربي:** الصور في R2 (وdisk محلي للتطوير) خلف interface واحد. كل رفع يُتحقق منه بالـ magic bytes ويُعاد ترميزه بـ sharp، ولا يُقبل SVG.

## Context
Product images drive conversion and Core Web Vitals, and uploads are a classic attack surface.

## Decision
- A `MediaStorage` interface with two drivers: local disk (development, tests) and S3-compatible (Cloudflare R2 in production). On 2026-10-08 R2's free tier was 10 GB-month, 1 million Class A and 10 million Class B operations per month, with no egress charge.
- Public serving from a separate cookieless domain with immutable cache headers and `X-Content-Type-Options: nosniff`.
- Upload rules: authenticated and permitted (`media:upload`); size and count caps and per-user quota; type detected from magic bytes, never from extension or Content-Type; allow-list JPEG, PNG, WebP (HEIC only if sharp supports it, verified in Phase 3); SVG and PDF rejected; always decode and re-encode with sharp (strips EXIF, GPS and hidden payloads), with `limitInputPixels` against decompression bombs; random storage keys, and the original filename kept only as a sanitized display label.
- Generate fixed variants (480, 960, 1600 px wide, WebP) and a dominant-color placeholder at upload time.
- Arabic alt text is required to publish (English optional).
- No antivirus scanner: re-encoding gives the protection we need without the operational cost.

## Options considered
- Local disk only: simplest, but needs its own backup and ties media to the server.
- Cloudinary or similar: on-the-fly transforms, but free-tier limits and vendor lock-in.
- Images in the database: rejected.

## Consequences
- Cheap, fast, safe media. Brand logos must be uploaded as raster images.

## Revisit when
On-the-fly image transforms are needed, or R2 usage exceeds the free tier.

---

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

## Revisit when
Operations burden becomes a problem, or one VPS is no longer enough.

---

# ADR-0011: Rule-based recommendation engine with truthful Arabic explanations

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D14
- **بالعربي:** توصيات rule-based بـ scoring مرجّح وأكواد أسباب تُترجم بقوالب عربية مشتقة من المطابقة الفعلية، بدون AI مدفوع.

## Context
Discovery must work from day one with no sales history, with no paid AI API, and every claim shown to the shopper must be true.

## Decision
- Candidates: published products with stock available, excluding the source product.
- Initial weights (tunable, covered by golden tests, versioned): note overlap 35% (base > heart > top), olfactive family 20% (same 1.0, adjacent 0.5 via `family_adjacency`), price proximity 12% (logarithmic, compared at similar sizes), gender fit 8%, concentration and intensity 8%, occasion and season 7%, same brand 5% (only in "similar"), plus explicit pin or exclude from Studio.
- Modes: similar (highest score); budget alternative (score above a minimum and price at most 70% of the source); luxury alternative (score above a minimum and price at least 130%); "picked for your taste" computed from up to 10 recently viewed product ids sent by the browser, with no account and no stored personal data.
- Explanations: every influential factor has a reason code and an Arabic template filled from the actual match. The top 2 to 3 reasons are shown, for example "يشاركه نفس القلب العطري: عود وعنبر" or "أوفر بحوالي 35% وبنفس الطابع". Wording never says clone or imitation; it says similar or close to.
- Missing note data falls back to family, brand and price tier, and the explanation says so honestly.
- Computed on demand with an in-memory cache invalidated when the catalog changes. A precomputed `product_similarity` table is added only if measurements require it.
- Recently viewed and wishlist are stored in the browser (Zustand `persist`) and hydrated by ids from the server.

## Options considered
- Collaborative filtering from orders: needs data, may be added later as an extra signal from real orders only.
- Embeddings or LLMs: excluded (paid APIs forbidden).

## Consequences
- Transparent and testable. Quality depends on complete notes and family data, which the completion score enforces.

## Revisit when
There are enough real orders to add a "customers also bought" signal.

---

# ADR-0012: Product data model, collections, and brand templates

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D15, D18
- **بالعربي:** Notes وfamilies وtags كيانات مضبوطة، وVariant = الحجم، وcollections بثلاثة أنواع بقواعد whitelist مترجمة لـ SQL parameterized، وbrand templates مجرد عمود محجوز.

## Context
Notes, families and tags drive filters, search, recommendations and SEO landing pages, so they must be clean, structured data rather than free text.

## Decision
- **Notes** are entities with a group (citrus, floral, woody and so on), Arabic and English names, and aliases. `product_notes` carries position (top, heart, base) and prominence.
- **Families:** one primary and optional secondary family per product, with a `family_adjacency` table of weights.
- **Tags:** controlled vocabulary with types (occasion, season, mood, feature). New values are added from Studio with permission. No free-form tags.
- **Brand:** logo, story, country, and a nullable `template_key`. Brand templates are future-ready only: no table and no UI in v1.
- **Categories:** tree with depth at most 2. Default proposal, adjustable before Phase 3: perfumes, oud and oud oil, bakhoor and home fragrance, gift sets, body and hair mists. Gender is an attribute, not a category.
- **Product and variant:** the product is the perfume. A variant is a size with its own SKU, price and stock. Concentration (EDP, EDT, Parfum) is a product attribute because it is a different formulation.
- **Collections:** `manual` (ordered list), `dynamic` (rules built from a whitelist: brands, families, notes any/all, tags, gender, price range, in-stock-only, concentration, sort, limit) and `hybrid` (rules plus pinned minus excluded). Rules are validated by a Zod discriminated union and compiled to parameterized SQL by a typed builder. Raw JSON is never executed. Optional schedule window and home placement.
- **Slugs:** unique Latin slugs with `slug_redirects`.
- **Completion score:** visible rules (name, brand, family, at least 3 notes, an image with alt text, a variant with price, description, SEO fields). Publishing requires the mandatory fields.
- **Search document:** a normalized column updated in the same transaction as the save (ADR-0005).

## Options considered
- Free-text notes and tags: rejected (inconsistent, unusable for recommendations).
- A translations table: unnecessary for two languages, columns `*_ar` and `*_en` are used instead.

## Consequences
- Higher data-entry discipline, supported by the wizard, completion score and import validation.

## Revisit when
A third language is added, or brand pages need per-brand layouts.

---

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

---

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

---

# ADR-0015: Seed system and sample-data policy

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D19
- **بالعربي:** بيانات العينة في التطوير فقط، والإنتاج يرفض أي صف عينة. لا مراجعات ولا طلبات ولا تقييمات ولا scarcity وهمية.

## Context
The brief forbids fake reviews, orders, customers, ratings, sales and scarcity in production, while development and staging need realistic data.

## Decision
- Three seed levels: `seed:reference` (governorates, roles, note groups, families; real data, production-safe), `seed:dev` (fake brands, products, orders; refuses to run unless `APP_ENV` is `development` or `staging`), and `seed:owner` (creates the first Owner with a password entered at run time).
- `seed:dev` records every row it inserts in `sample_data_registry`. The deployment gate `assert-no-sample-data` fails if the registry is not empty in production.
- Review collection begins at launch through invitations sent after delivery (Phase 9). No review, rating or count is displayed until real approved reviews exist.
- Scarcity and "popular" indicators come only from real stock and real events (ADR-0006, ADR-0005).

## Options considered
- An `is_sample` column on every table: pollutes the schema, rejected.

## Consequences
- A single, checkable guarantee that production contains no sample data.

## Revisit when
New entity types are added: they must register their sample rows too.

---

# ADR-0016: Localization and formatting conventions

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** Hussien (owner), Claude (Lead Technical Owner)
- **Confirms:** D10, D11
- **بالعربي:** العربية افتراضية RTL، والإنجليزية تحت `/en` ضمن MVP، وأرقام Western للأسعار والهواتف، وslugs لاتينية.

## Context
Arabic-first for Iraq, with an English option, and shareable URLs on WhatsApp.

## Decision
- Arabic is the default language at the root URLs with `dir="rtl"`. English lives under `/en/...` with `hreflang` links, and is part of the MVP.
- Prices (IQD, whole dinars, integer storage) and phone numbers are shown with Western digits. Arabic-Indic and Persian digits are accepted on input and normalized.
- Mixed-direction text (Latin brand names, numbers inside Arabic sentences) uses `dir="auto"` or `<bdi>`.
- Content columns are `*_ar` and `*_en`; Arabic is required to publish, English is optional and tracked in the completion score.
- Slugs are Latin and transliterated.
- The exact currency display format (for example the Arabic currency label) is fixed with the design tokens in Phase 1 and applied in Phase 4.

## Options considered
- Arabic only in MVP: smaller, but the structure would still need to exist from Phase 1.
- Arabic-Indic digits: possible, but Western digits are the common convention for prices and phones in commerce here.

## Consequences
- Every UI string needs an Arabic entry first; English can follow before launch.

## Revisit when
A third language is requested, or user research shows a preference for Arabic-Indic digits.

---

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
