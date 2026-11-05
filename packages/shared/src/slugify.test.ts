import { describe, expect, it } from 'vitest';
import { SLUG_MAX_LENGTH, SLUG_SQL_PATTERN } from './catalog-constants.js';
import { isValidSlug, SLUG_PATTERN } from './seo-routes.js';
import { nextAvailableSlug, slugify } from './slugify.js';

describe('slugify: Latin names', () => {
  it.each([
    ['Maison Francis Kurkdjian', 'maison-francis-kurkdjian'],
    ['  Baccarat   Rouge 540  ', 'baccarat-rouge-540'],
    ['Chloé', 'chloe'],
    ["L'Homme Idéal", 'lhomme-ideal'],
    ['Hermès Terre d’Hermès', 'hermes-terre-dhermes'],
    ['Dolce & Gabbana', 'dolce-gabbana'],
    ['No.5 — Eau de Parfum', 'no-5-eau-de-parfum'],
    ['Straße', 'strasse'],
    ['Œuvre', 'oeuvre'],
    ['100% OUD!!', '100-oud'],
  ])('%s -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('gives an empty string when nothing usable is left', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('!!! --- ???')).toBe('');
    expect(slugify('😀')).toBe('');
  });
});

describe('slugify: Arabic names', () => {
  it.each([
    ['عود ملكي', 'oud-royal'],
    ['العود الملكي', 'oud-royal'],
    ['مسك', 'musk'],
    ['دهن عود', 'dehn-oud'],
    ['عَنْبَر', 'amber'],
  ])('known words: %s -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('transliterates other words letter by letter, without diacritics or tatweel', () => {
    expect(slugify('شـــانيل')).toBe('shanyl');
    expect(slugify('ديور')).toBe('dywr');
    expect(slugify('شَانِيل')).toBe('shanyl');
  });

  it('handles Iraqi and Persian letters', () => {
    expect(slugify('گوتشي')).toBe('gwtshy');
    expect(slugify('ڤيرساتشي')).toBe('vyrsatshy');
    expect(slugify('پرادا')).toBe('prada');
    expect(slugify('چانيل')).toBe('chanyl');
  });

  it('converts Arabic-Indic and Persian digits', () => {
    expect(slugify('عطر ٥٤٠')).toBe('perfume-540');
    expect(slugify('Rouge ۵۴۰')).toBe('rouge-540');
  });

  it('mixes Arabic and Latin words', () => {
    expect(slugify('ديور Sauvage')).toBe('dywr-sauvage');
  });

  it('drops a letter it has no mapping for instead of splitting the word', () => {
    // U+06CE is a Kurdish yeh with a small v: not in the map.
    expect(slugify('بێب')).toBe('bb');
  });

  it('never returns something the database or the router would reject', () => {
    for (const input of ['عود ملكي', 'Chloé', 'ديور Sauvage 100ml', 'a'.repeat(500)]) {
      const slug = slugify(input);
      expect(isValidSlug(slug)).toBe(true);
    }
  });
});

describe('slugify: length', () => {
  it('cuts at a hyphen, not in the middle of a word', () => {
    const long = Array.from({ length: 40 }, () => 'perfume').join(' ');
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.split('-').every((part) => part === 'perfume')).toBe(true);
  });

  it('cuts a single huge word at the limit', () => {
    expect(slugify('x'.repeat(300))).toHaveLength(SLUG_MAX_LENGTH);
  });

  it('honours a smaller limit', () => {
    expect(slugify('one two three', 8)).toBe('one-two');
  });
});

describe('nextAvailableSlug', () => {
  it('keeps the base when it is free', () => {
    expect(nextAvailableSlug('oud', () => false)).toBe('oud');
  });

  it('counts up from 2', () => {
    const taken = new Set(['oud', 'oud-2', 'oud-3']);
    expect(nextAvailableSlug('oud', (s) => taken.has(s))).toBe('oud-4');
  });

  it('shortens the base so the suffix still fits', () => {
    const base = 'a'.repeat(SLUG_MAX_LENGTH);
    const taken = new Set([base]);
    const next = nextAvailableSlug(base, (s) => taken.has(s));
    expect(next).toHaveLength(SLUG_MAX_LENGTH);
    expect(next.endsWith('-2')).toBe(true);
    expect(isValidSlug(next)).toBe(true);
  });

  it('refuses an empty base', () => {
    expect(() => nextAvailableSlug('', () => false)).toThrow(/empty/);
  });

  it('gives up with a clear error instead of looping forever', () => {
    expect(() => nextAvailableSlug('oud', () => true)).toThrow(/No free slug/);
  });
});

describe('the SQL slug pattern and the router slug pattern', () => {
  // The database CHECK uses SLUG_SQL_PATTERN, the router uses SLUG_PATTERN. They must accept the same
  // strings, or a stored slug could become unroutable (or the other way round).
  const sql = new RegExp(SLUG_SQL_PATTERN);
  const samples = [
    'oud',
    'a',
    '0',
    '540',
    'baccarat-rouge-540',
    'a-b-c',
    '',
    '-',
    '-a',
    'a-',
    'a--b',
    'A',
    'aB',
    'a b',
    'a_b',
    'عود',
    'a.b',
    'a/b',
    'é',
  ];
  it.each(samples)('agree on %j', (sample) => {
    expect(sql.test(sample)).toBe(SLUG_PATTERN.test(sample));
  });

  it('use the same source text', () => {
    // The only difference is the non-capturing group marker, which PostgreSQL's regex also accepts.
    expect(SLUG_PATTERN.source.replace('(?:', '(')).toBe(SLUG_SQL_PATTERN);
  });
});
