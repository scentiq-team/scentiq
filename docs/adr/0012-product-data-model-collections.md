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
