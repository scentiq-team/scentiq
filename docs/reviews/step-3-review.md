# STEP 3 review: catalog data layer

Branch `step-3/catalog`, reviewed against `step-2/database`. Four passes: code review (security, performance, correctness, maintainability), a hand-run security review of the media library and the SQL builder, a tech-debt pass, and an independent read by a second agent.

**بالعربي:** هذا سجل مراجعة نهاية STEP 3. لقينا عيبين حقيقيين (سباق بين موظفين اثنين) وأصلحناهما باختبار يفشل قبل الإصلاح، والباقي إما سليم أو دين تقني مسجل مع أولويته.

## How the independent read went

A second agent was asked to review the diff cold (no conclusions given). It hit the account usage limit twice. Before the first cut-off it had named three leads (write skew on alt text, a stale search document, category depth); all three were followed up by hand below. It did not finish its pass, so this was **not** a full independent review: the findings below are from the four passes above, and a fresh independent read is still worth doing before STEP 3 is merged.

## Findings

| # | Severity | Finding | Status | Proof |
| --- | --- | --- | --- | --- |
| R1 | Medium | Two staff members clearing the alt text of two different images of one published product at the same moment each saw the other image still described, so both passed and the product ended with no described image. | **Fixed**: `setMediaAlt` takes one advisory lock first (`lockImageDescriptions`). `setProductImages` needs none: its row lock on the image already queues it against `setMediaAlt` (both orders tested). | `catalog.db.test.ts`: three overlap tests; the first was red before the fix and is red again if the lock is removed. |
| R2 | Medium | Moving category X under Y while Y is moved under Z built a third level (the depth trigger saw only committed data). | **Fixed** in the trigger itself (`0005_catalog_rules.sql`), so it holds for every writer, not only our services. Migration 0005 was edited in place because it has not been applied anywhere outside scratch databases. | `db/catalog.db.test.ts`: two-connection test, red before the fix. |
| R3 | Low | The schema comment on `collection_products` said a service checks that a manual collection holds only pinned rows. No collection write service exists yet. | **Comment corrected**; the rule is debt item D1. The read queries ignore rows that do not apply to the collection kind, so a wrong row cannot show a wrong product (tested). | `collection-rules.db.test.ts` ("a dynamic collection ignores pinned and excluded rows"). |
| R4 | Low | A search document can go stale if a note is renamed while another transaction is attaching that note to a product (the rename cannot see the uncommitted link). | **Accepted**, debt item D2 (a reindex command). It self-heals at the next edit of that product. | n/a |

Not defects, checked and found sound: see the sections below.

## Security review

### SQL builder (`collection-rules.ts`)

| Property | How it holds | Test |
| --- | --- | --- |
| No stored or submitted value reaches SQL text | Every id, enum and number is a bound parameter; the only text is table and column names written in the file | `puts no value into the SQL text` |
| A field outside the whitelist is refused, even in a row already stored | The strict Zod schema runs again on read | `a field that is not on the whitelist is refused even when the row already exists` |
| The sort cannot be injected | A fixed map from key to fragment | `every sort has its own ordering` |
| Hand-edited rules with a SQL fragment never run | Refused by the schema; errors name the field path, never the value | `are refused, and a SQL fragment inside them never runs`, `reports which fields are wrong, but never their values` |
| Bounded cost | Lists of at most 30 ids (also keeps a valid rule inside the 8 192-byte column limit), `limit` capped, unique ids required (a duplicate would make "all notes" impossible) | `collection-rules.test.ts` schema cases |
| Placeholders match parameters | Checked by reading the compiled SQL | `the placeholders are numbered in order and match the parameter count` |

### Media library (`modules/media`)

| Property | How it holds | Test |
| --- | --- | --- |
| Only JPEG, PNG and WebP | Magic bytes decide, never the file name or the declared type; SVG, PDF, GIF, AVIF, HEIC and HTML are named and refused | `detect.test.ts` |
| HEIC refused with its own reason | The server cannot decode HEVC | `refuses an iPhone HEIC photo with its own reason` |
| Polyglots and appended payloads | The image end is found by structure; foreign data after it is refused, harmless camera padding is not; the re-encode never returns the uploaded bytes | `trailing.test.ts`, `never returns the uploaded bytes`, `harmless extra bytes after the image are dropped` |
| Decompression bombs | Size limit before reading, pixel limit from the header before decoding, and again inside the decoder; a header that lies is refused | `refuses a header that declares billions of pixels, without decoding anything`, `the limit is exact` |
| EXIF and GPS stripped, orientation applied | Pixels are re-encoded to WebP; the size check uses the rotated width | `drops EXIF, GPS and the copyright string from every variant`, `applies the EXIF rotation` |
| Animated images refused | Structural check before decoding | `refuses animated images` |
| No decoder text leaks | Refusals carry a reason code only | `never leaks the decoder message` |
| Storage keys cannot leave the root | Keys are random, validated against the same pattern as the database, and resolved inside the root; files are written beside the target then linked (never overwritten) | `storage.test.ts` (traversal keys, planted files, no temp leftovers) |
| Work on the file name is bounded | Only the last 2 048 characters are examined; lone surrogates removed; 200 characters kept | `copes with an enormous name`, `never returns a lone surrogate` |
| A failed upload leaves nothing | Files first, then one transaction; files removed on any failure | `media.db.test.ts` |

Limit: a crash between writing the files and the commit can leave unreferenced files (random keys, never served). Debt item D3.

## Code review (security, performance, correctness, maintainability)

- **Security:** the services report constraint names, never database messages; audit rows pass through the redacting `recordAudit`; no raw SQL outside the compiler and two fixed advisory-lock statements.
- **Performance:** no N+1 on a read path. The common collection rule (brand) is tested to use the index the design relies on. Write paths are per-product: `assertProductsStayValid` runs a handful of small queries per product, which is fine for staff edits (D10).
- **Correctness:** publish is checked twice (service with a precise "what is missing" answer, database trigger as the last line); the completion score and the trigger are tested against each other so they cannot drift.
- **Maintainability:** one transaction per change; services compose through savepoints; the repeated per-table blocks in `slugs.ts` are the main readability cost (D8).

## Tech debt

Priority = (impact + risk) x (6 - effort), each 1 to 5.

| # | Item | Type | Impact | Risk | Effort | Priority | When |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D5 | Arabic names in the reference data (categories, families, note groups, notes, tags) are a draft for the owner to review | Content | 3 | 3 | 1 | 30 | Now, before merge |
| D6 | `test:coverage` is not run in CI, so the 90% target is checked by hand | Test | 2 | 3 | 1 | 25 | Now, before merge |
| D4 | Only the local-disk media driver exists; the S3 / R2 driver is not written | Architecture | 4 | 4 | 3 | 24 | Deployment phase |
| D2 | No search reindex command; a document can go stale after a rare race or a manual database edit (R4) | Code | 2 | 2 | 2 | 16 | Phase 5 (search) |
| D1 | No collection write service; "a manual collection holds only pinned rows" has no enforcement yet (R3) | Code | 3 | 2 | 3 | 15 | Phase 7A (Studio) |
| D9 | A brand or note rename refreshes its products one by one in one `inArray` (fine at catalog size, bounded by the 65 535 parameter limit) | Code | 1 | 2 | 2 | 12 | Phase 5 |
| D7 | HEIC (iPhone) uploads are refused; Studio must say so, or convert on the client | Product | 3 | 2 | 4 | 10 | Phase 7A |
| D3 | No sweep for files left behind by a crash mid-upload | Infrastructure | 1 | 2 | 3 | 9 | Deployment phase |
| D8 | `slugs.ts` repeats one block per table; `withPrefix` loads every slug with the prefix | Code | 1 | 1 | 2 | 8 | Opportunistic |
| D10 | `assertProductsStayValid` runs about six queries per product; an image shared by many products multiplies that | Code | 1 | 1 | 3 | 6 | Only if it shows up in use |

Phased plan: D5 and D6 before STEP 3 is merged (both small); D2 and D9 with search; D1 and D7 with Studio; D4 and D3 with deployment; D8 and D10 only when touched.
