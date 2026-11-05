import { describe, expect, it } from 'vitest';
import { buildSearchDocument, normalizeSearchText, tokenizeSearchText } from './arabic-search.js';

describe('normalizeSearchText: ADR-0005 rules', () => {
  it.each([
    // tashkeel and tatweel
    ['عَنْبَر', 'عنبر'],
    ['شـــانيل', 'شانيل'],
    ['مُحَمَّد', 'محمد'],
    // alef forms
    ['أحمد إبراهيم آمنة ٱلعود', 'احمد ابراهيم امنه عود'],
    // alef maqsura and teh marbuta
    ['موسى', 'موسي'],
    ['وردة', 'ورده'],
    // Iraqi and Persian letters
    ['گوتشي', 'كوتشي'],
    ['چانيل', 'جانيل'],
    ['پرادا', 'برادا'],
    ['ڤيرساتشي', 'فيرساتشي'],
    // Persian kaf and yeh (extension)
    ['کریستال', 'كريستال'],
    // digits
    ['٠١٢٣٤٥٦٧٨٩', '0123456789'],
    ['۰۱۲۳۴۵۶۷۸۹', '0123456789'],
    ['عطر ٥٤٠', 'عطر 540'],
    // Latin
    ['Baccarat ROUGE', 'baccarat rouge'],
    ['Chloé', 'chloe'],
    ['Hermès', 'hermes'],
    // punctuation separates words
    ["L'Homme", 'l homme'],
    ['No.5', 'no 5'],
    ['Eau de Parfum/EDP', 'eau de parfum edp'],
    ['عود، مسك؛ عنبر', 'عود مسك عنبر'],
    // whitespace
    ['   عود    ملكي  ', 'عود ملكي'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected);
  });

  it('strips the definite article from each token, not only the first', () => {
    expect(normalizeSearchText('العود الملكي')).toBe('عود ملكي');
    expect(normalizeSearchText('الآخر')).toBe('اخر'); // alef madda folds to alef first
  });

  it('keeps a token that would be left with fewer than two letters', () => {
    expect(normalizeSearchText('ال')).toBe('ال');
    expect(normalizeSearchText('الي')).toBe('الي');
    // Four letters: the article goes and two remain. Index and query agree, so this is harmless.
    expect(normalizeSearchText('الله')).toBe('له');
    expect(normalizeSearchText('الله')).toBe(normalizeSearchText('له'));
  });

  it('does not strip "ال" from the middle of a word or from Latin text', () => {
    expect(normalizeSearchText('مثال')).toBe('مثال');
    expect(normalizeSearchText('alpha')).toBe('alpha');
  });

  it('makes the spellings a shopper may type equal', () => {
    const variants = ['عود', 'العود', 'عُود', 'عـود'];
    const normalized = new Set(variants.map(normalizeSearchText));
    expect(normalized.size).toBe(1);

    expect(normalizeSearchText('وردة')).toBe(normalizeSearchText('ورده'));
    expect(normalizeSearchText('أمواج')).toBe(normalizeSearchText('امواج'));
    expect(normalizeSearchText('مدينة')).toBe(normalizeSearchText('مدينه'));
  });

  it('is idempotent: normalizing twice changes nothing', () => {
    for (const input of ['الآخر', 'عَنْبَر ٥٤٠ Chloé', 'گچپڤ', "L'Homme No.5", 'ٱلعُود']) {
      const once = normalizeSearchText(input);
      expect(normalizeSearchText(once)).toBe(once);
    }
  });

  it('gives an empty string for empty or symbol-only input', () => {
    expect(normalizeSearchText('')).toBe('');
    expect(normalizeSearchText('   ')).toBe('');
    expect(normalizeSearchText('!!! ... ؟؟؟ ---')).toBe('');
    expect(normalizeSearchText('😀')).toBe('');
  });

  it('handles the Arabic lam-alef ligature through compatibility normalization', () => {
    // U+FEFB is the isolated lam-alef presentation form that some copy-paste sources produce.
    expect(normalizeSearchText('ﻻ')).toBe('لا');
  });

  it('does not merge hamza seats, which the ADR does not ask for', () => {
    expect(normalizeSearchText('مؤمن')).toBe('مؤمن');
    expect(normalizeSearchText('رئيس')).toBe('رئيس');
  });
});

describe('tokenizeSearchText', () => {
  it('splits on single spaces and drops empties', () => {
    expect(tokenizeSearchText('عود ملكي')).toEqual(['عود', 'ملكي']);
    expect(tokenizeSearchText('')).toEqual([]);
  });
});

describe('buildSearchDocument', () => {
  it('collects every searchable name, normalized and without repeated words', () => {
    const doc = buildSearchDocument({
      nameAr: 'عود ملكي',
      nameEn: 'Royal Oud',
      brandNameAr: 'ديور',
      brandNameEn: 'Dior',
      categoryNameAr: 'عطور',
      categoryNameEn: 'Perfumes',
      familyNames: ['خشبي', 'Woody'],
      tagNames: ['شتاء'],
      notes: [
        { nameAr: 'عود', nameEn: 'Oud', aliases: ['oudh', 'العود'] },
        { nameAr: 'عنبر', nameEn: 'Amber' },
      ],
    });
    const tokens = tokenizeSearchText(doc);
    expect(tokens).toEqual(
      expect.arrayContaining([
        'عود',
        'ملكي',
        'royal',
        'oud',
        'ديور',
        'dior',
        'عطور',
        'perfumes',
        'خشبي',
        'woody',
        'شتاء',
        'oudh',
        'عنبر',
        'amber',
      ]),
    );
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('finds the same product for an Arabic query written two ways', () => {
    const doc = buildSearchDocument({
      nameAr: 'أمواج',
      brandNameAr: 'مجموعة الورد',
    });
    const has = (query: string) =>
      tokenizeSearchText(normalizeSearchText(query)).every((t) => doc.split(' ').includes(t));
    expect(has('امواج')).toBe(true);
    expect(has('أمواج')).toBe(true);
    expect(has('الورد')).toBe(true);
    expect(has('ورد')).toBe(true);
  });

  it('skips missing optional names and keeps the order of first appearance', () => {
    expect(
      buildSearchDocument({
        nameAr: 'عود',
        nameEn: null,
        brandNameAr: 'عود ملكي',
        familyNames: [null, undefined, 'خشبي'],
      }),
    ).toBe('عود ملكي خشبي');
  });

  it('returns an empty document when nothing is searchable', () => {
    expect(buildSearchDocument({ nameAr: '!!!', brandNameAr: ' ' })).toBe('');
  });
});
