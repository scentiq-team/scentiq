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
