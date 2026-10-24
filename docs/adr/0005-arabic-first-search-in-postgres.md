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
