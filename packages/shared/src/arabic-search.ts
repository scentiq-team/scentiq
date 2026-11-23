// Arabic-first search text (ADR-0005). ONE normalization function, used both when a product's
// `search_document` is built and when a shopper's query is read, so the two always agree.
//
// Following the ADR: strip tashkeel and tatweel; unify alef forms to ا; ى to ي; ة to ه (search only,
// the displayed text never changes); Iraqi and Persian letters گ→ك چ→ج پ→ب ڤ→ف; Arabic-Indic and
// Persian digits to ASCII; lower-case Latin; strip punctuation; strip the definite article ال at
// token level. No stemming.
//
// Two small extensions beyond the ADR text, both the same kind of rule (documented in
// docs/database.md): Persian ک and ی (what Persian and Kurdish keyboards type) fold to ك and ي, and
// Latin accents are removed ("Chloé" is found by "chloe"). Pure: no database, no environment.

const TASHKEEL_AND_TATWEEL = /[ـً-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/g;

const LETTER_FOLDS: Readonly<Record<string, string>> = {
  // alef forms
  آ: 'ا',
  أ: 'ا',
  إ: 'ا',
  ٱ: 'ا',
  // alef maqsura, teh marbuta
  ى: 'ي',
  ة: 'ه',
  // Iraqi and Persian letters (ADR-0005)
  گ: 'ك',
  چ: 'ج',
  پ: 'ب',
  ڤ: 'ف',
  // Persian forms of kaf and yeh (extension)
  ک: 'ك',
  ی: 'ي',
};
const FOLDED_LETTERS = new RegExp(`[${Object.keys(LETTER_FOLDS).join('')}]`, 'g');

/**
 * The article is only stripped when at least two letters remain, so "ال" and "الي" stay as they are.
 * A word such as "الله" does lose its article ("له"); that is harmless because the index and the query
 * go through this same function, so both sides end up with the same token.
 */
const MIN_LENGTH_FOR_ARTICLE = 4;

function foldDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Splits already-normalized text into its words. */
export function tokenizeSearchText(normalized: string): string[] {
  return normalized.split(' ').filter(Boolean);
}

/**
 * The text that is stored and compared: tokens joined by single spaces. An empty or symbol-only input
 * gives an empty string.
 */
export function normalizeSearchText(input: string): string {
  let text = input.normalize('NFKC');
  text = text.replace(TASHKEEL_AND_TATWEEL, '');
  text = foldDigits(text);
  text = text.replace(FOLDED_LETTERS, (letter) => LETTER_FOLDS[letter] ?? letter);
  text = text.toLowerCase();
  // Latin accents only. NFD on Arabic text would merge hamza seats, which the ADR does not ask for.
  text = text.replace(/[À-ɏ]+/g, (segment) => segment.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  // Every character that is not a letter or a digit separates words, apostrophes and hyphens
  // included: "L'Homme" gives the tokens "l" and "homme", "No.5" gives "no" and "5". Fuzzy matching
  // in Phase 5 covers a shopper who types "lhomme" without the apostrophe.
  text = text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  return tokenizeSearchText(text)
    .map((token) =>
      token.startsWith('ال') && token.length >= MIN_LENGTH_FOR_ARTICLE ? token.slice(2) : token,
    )
    .join(' ');
}

/** One note of a product as search sees it: both names and every alias. */
export interface SearchNote {
  nameAr: string;
  nameEn?: string | null;
  aliases?: readonly string[];
}

export interface SearchDocumentSource {
  nameAr: string;
  nameEn?: string | null;
  brandNameAr: string;
  brandNameEn?: string | null;
  categoryNameAr?: string | null;
  categoryNameEn?: string | null;
  familyNames?: readonly (string | null | undefined)[];
  notes?: readonly SearchNote[];
  tagNames?: readonly (string | null | undefined)[];
}

/**
 * Builds the product's `search_document`: every searchable name, normalized, with repeated words
 * removed (the GIN trigram index gains nothing from repeats). Descriptions are left out on purpose:
 * long prose would make every product match many words and weaken exact-name ranking (Phase 5 can
 * revisit that with the golden relevance set).
 */
export function buildSearchDocument(source: SearchDocumentSource): string {
  const parts: (string | null | undefined)[] = [
    source.nameAr,
    source.nameEn,
    source.brandNameAr,
    source.brandNameEn,
    source.categoryNameAr,
    source.categoryNameEn,
    ...(source.familyNames ?? []),
    ...(source.tagNames ?? []),
  ];
  for (const note of source.notes ?? []) {
    parts.push(note.nameAr, note.nameEn, ...(note.aliases ?? []));
  }

  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const token of tokenizeSearchText(normalizeSearchText(part))) {
      if (!seen.has(token)) {
        seen.add(token);
        tokens.push(token);
      }
    }
  }
  return tokens.join(' ');
}
