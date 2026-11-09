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

## Verification (STEP 3, 2026-11-10)
Built and tested against PostgreSQL 18 (`apps/backend/migrations/0004` and `0005`; rule list in `docs/database.md`).
- **Categories:** the default proposal was kept (perfumes, oud and oud oil, bakhoor and home fragrance, gift sets, body and hair mists), depth at most 2, enforced by a trigger.
- **Completion score and publish gate agree:** the score's required checks and the database gate demand the same things, in both directions (tested), and a published product can never lose a required piece (the service refuses the change).
- **Collections:** rules are a strict whitelist validated by Zod and compiled to parameterized SQL; a value never reaches the SQL text, and a column or sort outside the whitelist cannot. A list holds at most 30 ids so a valid rule always fits the 8 192-byte limit. `manual` returns the pinned products; `dynamic` the matching ones; `hybrid` the pinned ones first, then the matching ones without the pinned and excluded, with `limit` counting matching products only. The in-stock-only rule is **not available yet**: it needs the stock ledger (Phase 6A), and the rule is rejected until then.
- **Search document:** built by the one normalizer (ADR-0005) in the same transaction as every change to a product, and whenever a brand, category, note or tag it uses is changed (there is no family-editing service yet).
- **Known limits:** two simultaneous creates of the same name can both pick the same slug; the second gets a clear conflict (staff-only, accepted). Two category edits at the same time could, in theory, produce a third level; the trigger blocks the common case and the race is accepted for a staff-only action.
