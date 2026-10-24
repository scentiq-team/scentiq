import { ERROR_CODES } from '@scentiq/shared';
import { describe, expect, it } from 'vitest';
import { CLIENT_ERROR_CODES } from '@/services/api/errors';
import { ar } from './ar';
import { en } from './en';

/** Every string of a dictionary with its dotted key, e.g. "nav.home". */
function flatten(value: object, prefix = ''): [string, unknown][] {
  return Object.entries(value).flatMap(([key, entry]) =>
    typeof entry === 'object' && entry !== null
      ? flatten(entry, `${prefix}${key}.`)
      : [[`${prefix}${key}`, entry] as [string, unknown]],
  );
}

const ARABIC_LETTER = /[؀-ۿ]/;
// Words that are intentionally written in Latin letters inside the Arabic dictionary.
const LATIN_ALLOWED_IN_AR = new Set(['language.switchTo', 'studio.title']);
// The one English string that is intentionally Arabic: the link back to Arabic.
const ARABIC_ALLOWED_IN_EN = new Set(['language.switchTo']);

describe('dictionaries', () => {
  const arEntries = flatten(ar);
  const enEntries = flatten(en);

  it('have exactly the same keys in Arabic and English', () => {
    expect(arEntries.map(([key]) => key).sort()).toEqual(enEntries.map(([key]) => key).sort());
  });

  it('never contain an empty or non-string message', () => {
    for (const [key, value] of [...arEntries, ...enEntries]) {
      expect(typeof value, key).toBe('string');
      expect((value as string).trim().length, key).toBeGreaterThan(0);
    }
  });

  it('write Arabic messages in Arabic (except the allowed Latin words)', () => {
    for (const [key, value] of arEntries) {
      if (LATIN_ALLOWED_IN_AR.has(key)) continue;
      expect(ARABIC_LETTER.test(value as string), key).toBe(true);
    }
  });

  it('write English messages without Arabic letters (except the language link)', () => {
    for (const [key, value] of enEntries) {
      if (ARABIC_ALLOWED_IN_EN.has(key)) continue;
      expect(ARABIC_LETTER.test(value as string), key).toBe(false);
    }
  });

  it('have a message for every server error code and every client error code', () => {
    for (const messages of [ar, en]) {
      for (const code of [...ERROR_CODES, ...CLIENT_ERROR_CODES]) {
        expect(messages.errors[code].length, code).toBeGreaterThan(0);
      }
    }
  });

  it('keep the language link in the language it points to', () => {
    expect(ar.language.switchTo).toBe('English');
    expect(en.language.switchTo).toBe('العربية');
  });
});
