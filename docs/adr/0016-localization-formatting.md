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
