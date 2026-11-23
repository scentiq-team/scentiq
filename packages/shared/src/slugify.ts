// Turns a name into a Latin URL slug (ADR-0002, ADR-0016). Arabic URLs become percent-encoded noise
// when shared on WhatsApp, so every slug is Latin even when the name is Arabic.
//
// Studio shows the result as an editable suggestion: staff should type a good English name or fix the
// slug. The Arabic fallback exists so that a name that only has Arabic text still gives something
// readable instead of an empty string. Pure: no database, no environment.

import { SLUG_MAX_LENGTH } from './catalog-constants.js';

/** Perfume words whose letter-by-letter transliteration would be unrecognisable ("awd" for oud). */
const KNOWN_TERMS: Readonly<Record<string, string>> = {
  عود: 'oud',
  مسك: 'musk',
  عنبر: 'amber',
  ورد: 'rose',
  بخور: 'bakhoor',
  دهن: 'dehn',
  عطر: 'perfume',
  ملكي: 'royal',
  زعفران: 'saffron',
  صندل: 'sandalwood',
  ياسمين: 'jasmine',
  فانيلا: 'vanilla',
  ليمون: 'lemon',
  لافندر: 'lavender',
};

const ARABIC_LETTERS: Readonly<Record<string, string>> = {
  ا: 'a',
  أ: 'a',
  إ: 'a',
  آ: 'a',
  ٱ: 'a',
  ء: '',
  ؤ: 'w',
  ئ: 'y',
  ب: 'b',
  پ: 'p',
  ت: 't',
  ث: 'th',
  ج: 'j',
  چ: 'ch',
  ح: 'h',
  خ: 'kh',
  د: 'd',
  ذ: 'dh',
  ر: 'r',
  ز: 'z',
  ژ: 'zh',
  س: 's',
  ش: 'sh',
  ص: 's',
  ض: 'd',
  ط: 't',
  ظ: 'z',
  ع: 'a',
  غ: 'gh',
  ف: 'f',
  ڤ: 'v',
  ق: 'q',
  ك: 'k',
  ک: 'k',
  گ: 'g',
  ل: 'l',
  م: 'm',
  ن: 'n',
  ه: 'h',
  ة: 'h',
  ە: 'h',
  و: 'w',
  ي: 'y',
  ی: 'y',
  ى: 'a',
};

/** Latin letters that Unicode decomposition does not split into letter + accent. */
const LATIN_SPECIAL: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
};

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿ]/;
/** Harakat, superscript alef, Quranic marks and tatweel: never part of a slug. */
const ARABIC_MARKS = /[ـً-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/g;

function transliterateArabicToken(token: string): string {
  const bare = token.replace(ARABIC_MARKS, '');
  // "العود" and "عود" are the same word here: drop the definite article before the lookup.
  const withoutArticle = bare.startsWith('ال') && bare.length >= 4 ? bare.slice(2) : bare;
  const known = KNOWN_TERMS[withoutArticle];
  if (known) return known;
  let out = '';
  // A letter we have no mapping for (a rare Kurdish one, say) is dropped instead of becoming a hyphen.
  for (const char of withoutArticle) {
    out += ARABIC_LETTERS[char] ?? (ARABIC_SCRIPT.test(char) ? '' : char);
  }
  return out;
}

function toLatinToken(token: string): string {
  if (ARABIC_SCRIPT.test(token)) return transliterateArabicToken(token);
  return token;
}

/**
 * `"Maison Francis Kurkdjian"` gives `maison-francis-kurkdjian`, `"Chloé"` gives `chloe`,
 * `"عود ملكي"` gives `oud-royal`. Returns an empty string when nothing usable is left (for example a
 * name made only of symbols): the caller decides the fallback.
 */
export function slugify(input: string, maxLength: number = SLUG_MAX_LENGTH): string {
  let text = input.normalize('NFKC').toLowerCase();
  // Latin accents only: NFD on Arabic would merge hamza seats, which this function must not do.
  text = text.replace(/[À-ɏ]+/g, (segment) =>
    segment
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[ßæœøłđðþı]/g, (char) => LATIN_SPECIAL[char] ?? char),
  );
  // Digits written as Arabic-Indic or Persian numerals.
  text = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  // Apostrophes join the letters around them: "l'homme" is "lhomme", not "l-homme".
  text = text.replace(/['’‘`]/g, '');

  const tokens = text.split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean);
  const slug = tokens
    .map(toLatinToken)
    .join('-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length <= maxLength) return slug;
  // Cut at a hyphen so the slug does not end in half a word.
  const cut = slug.slice(0, maxLength);
  const lastHyphen = cut.lastIndexOf('-');
  return (lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/g, '');
}

/**
 * The first free slug: `base`, then `base-2`, `base-3`... `isTaken` answers from the database (or,
 * in tests, a Set). The base is shortened when a suffix would push it over the length limit.
 */
export function nextAvailableSlug(
  base: string,
  isTaken: (slug: string) => boolean,
  maxLength: number = SLUG_MAX_LENGTH,
): string {
  if (base === '') throw new Error('Cannot build a slug from an empty base.');
  if (!isTaken(base)) return base;
  for (let n = 2; n < 10_000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, maxLength - suffix.length).replace(/-+$/g, '')}${suffix}`;
    if (!isTaken(candidate)) return candidate;
  }
  throw new Error(`No free slug found for "${base}".`);
}
