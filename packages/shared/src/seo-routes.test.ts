import { describe, expect, it } from 'vitest';
import { isValidSlug, matchRoute } from './seo-routes.js';

describe('matchRoute', () => {
  it('matches the home page in both locales', () => {
    expect(matchRoute('/')).toEqual({ kind: 'home', locale: 'ar' });
    expect(matchRoute('/en')).toEqual({ kind: 'home', locale: 'en' });
    expect(matchRoute('/en/')).toEqual({ kind: 'home', locale: 'en' });
  });

  it('matches product pages with valid slugs', () => {
    expect(matchRoute('/p/dior-sauvage-edp-100ml')).toEqual({
      kind: 'product',
      locale: 'ar',
      slug: 'dior-sauvage-edp-100ml',
    });
    expect(matchRoute('/en/p/test')).toEqual({ kind: 'product', locale: 'en', slug: 'test' });
  });

  it('rejects slugs that are not lowercase Latin with hyphens', () => {
    expect(matchRoute('/p/Dior').kind).toBe('unknown');
    expect(matchRoute('/p/عطر').kind).toBe('unknown');
    expect(matchRoute('/p/a_b').kind).toBe('unknown');
    expect(matchRoute('/p/a/b').kind).toBe('unknown');
    expect(matchRoute('/p/').kind).toBe('unknown');
  });

  it('matches Studio only without a locale prefix', () => {
    expect(matchRoute('/studio').kind).toBe('studio');
    expect(matchRoute('/studio/orders').kind).toBe('studio');
    expect(matchRoute('/en/studio').kind).toBe('unknown');
  });

  it('matches the dev style guide only at its exact path', () => {
    expect(matchRoute('/dev/style-guide')).toEqual({
      kind: 'dev',
      locale: 'ar',
      name: 'style-guide',
    });
    expect(matchRoute('/dev/other').kind).toBe('unknown');
  });

  it('treats everything else as unknown', () => {
    expect(matchRoute('/nope').kind).toBe('unknown');
    expect(matchRoute('/api/v1/health').kind).toBe('unknown');
  });
});

describe('isValidSlug', () => {
  it('accepts normal slugs and rejects overly long ones', () => {
    expect(isValidSlug('tom-ford-oud-wood-50ml')).toBe(true);
    expect(isValidSlug('a'.repeat(121))).toBe(false);
    expect(isValidSlug('-bad')).toBe(false);
    expect(isValidSlug('bad-')).toBe(false);
  });
});
