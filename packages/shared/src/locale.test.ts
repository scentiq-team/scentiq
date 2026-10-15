import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, isLocale, localeDirection, localizePath, splitLocale } from './locale.js';

describe('locale helpers', () => {
  it('uses Arabic as the default locale with RTL direction', () => {
    expect(DEFAULT_LOCALE).toBe('ar');
    expect(localeDirection('ar')).toBe('rtl');
    expect(localeDirection('en')).toBe('ltr');
  });

  it('recognises only supported locales', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it('splits the /en prefix from the path', () => {
    expect(splitLocale('/')).toEqual({ locale: 'ar', path: '/' });
    expect(splitLocale('/en')).toEqual({ locale: 'en', path: '/' });
    expect(splitLocale('/en/p/dior')).toEqual({ locale: 'en', path: '/p/dior' });
    expect(splitLocale('/p/dior')).toEqual({ locale: 'ar', path: '/p/dior' });
  });

  it('does not mistake paths that merely start with "en" for English', () => {
    expect(splitLocale('/english')).toEqual({ locale: 'ar', path: '/english' });
    expect(splitLocale('/ensemble/x')).toEqual({ locale: 'ar', path: '/ensemble/x' });
  });

  it('builds localized public paths', () => {
    expect(localizePath('ar', '/p/x')).toBe('/p/x');
    expect(localizePath('en', '/p/x')).toBe('/en/p/x');
    expect(localizePath('en', '/')).toBe('/en');
    expect(localizePath('en', 'p/x')).toBe('/en/p/x');
  });
});
