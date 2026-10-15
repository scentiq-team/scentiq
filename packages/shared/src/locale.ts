// Locale helpers shared by the router (frontend) and the SEO shell (backend).
// Arabic is the default locale at the root URLs; English lives under /en (ADR-0016).

export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ar';

export type Direction = 'rtl' | 'ltr';

const EN_PREFIX = '/en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function localeDirection(locale: Locale): Direction {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** Splits a URL pathname into its locale and the locale-free path. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  if (pathname === EN_PREFIX) return { locale: 'en', path: '/' };
  if (pathname.startsWith(`${EN_PREFIX}/`)) {
    return { locale: 'en', path: pathname.slice(EN_PREFIX.length) };
  }
  return { locale: DEFAULT_LOCALE, path: pathname === '' ? '/' : pathname };
}

/** Builds the public URL path for a locale-free path. */
export function localizePath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === DEFAULT_LOCALE) return clean;
  return clean === '/' ? EN_PREFIX : `${EN_PREFIX}${clean}`;
}
