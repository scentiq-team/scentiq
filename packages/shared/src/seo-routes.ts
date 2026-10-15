// The single route table that both sides agree on (ADR-0002). The backend uses it to decide
// which SEO shell to render and which status code to send; the frontend uses the same slug
// rules so links never drift. Phase 1 only knows the routes that already exist.
import { type Locale, splitLocale } from './locale.js';

export type SeoRoute =
  | { kind: 'home'; locale: Locale }
  | { kind: 'product'; locale: Locale; slug: string }
  | { kind: 'studio'; locale: 'ar' }
  | { kind: 'dev'; locale: 'ar'; name: 'style-guide' }
  | { kind: 'unknown'; locale: Locale };

/** Latin, lowercase, hyphen separated (ADR-0002, ADR-0016). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: string): boolean {
  return value.length <= 120 && SLUG_PATTERN.test(value);
}

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

export function matchRoute(rawPathname: string): SeoRoute {
  const pathname = stripTrailingSlash(rawPathname);
  const { locale, path } = splitLocale(pathname);

  if (path === '/') return { kind: 'home', locale };

  const segments = path.split('/').filter((segment) => segment.length > 0);
  const [first, second, ...rest] = segments;

  if (first === 'p' && second !== undefined && rest.length === 0 && isValidSlug(second)) {
    return { kind: 'product', locale, slug: second };
  }

  // Studio and developer tools have no /en variant.
  if (locale === 'ar') {
    if (first === 'studio') return { kind: 'studio', locale: 'ar' };
    if (first === 'dev' && second === 'style-guide' && rest.length === 0) {
      return { kind: 'dev', locale: 'ar', name: 'style-guide' };
    }
  }

  return { kind: 'unknown', locale };
}
