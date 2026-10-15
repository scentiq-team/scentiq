// Pure HTML helpers for the SEO shell (ADR-0002). Everything that reaches the page is escaped
// here; replacement uses function callbacks so "$&" in a product name cannot rewrite the template.
import { localeDirection } from '@scentiq/shared';
import type { PageModel } from './types.js';

export const HEAD_MARKER = '<!--scentiq:head-->';
export const ROOT_MARKER = '<!--scentiq:root-->';

const OG_LOCALES = { ar: 'ar_IQ', en: 'en_US' } as const;

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Serialises JSON-LD so no value can close the script tag or break the page. */
export function jsonLdScript(data: Record<string, unknown>): string {
  const safe = JSON.stringify(data)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029');
  return `<script type="application/ld+json">${safe}</script>`;
}

export function renderHead(page: PageModel, origin: string, siteName: string): string {
  const meta = (attr: 'name' | 'property', key: string, content: string) =>
    `<meta ${attr}="${key}" content="${escapeHtml(content)}">`;

  const tags = [
    `<title>${escapeHtml(page.title)}</title>`,
    meta('name', 'description', page.description),
    meta('name', 'robots', page.robots),
  ];

  if (page.canonical !== undefined) {
    tags.push(`<link rel="canonical" href="${escapeHtml(page.canonical)}">`);
  }
  for (const alternate of page.alternates) {
    tags.push(
      `<link rel="alternate" hreflang="${escapeHtml(alternate.hreflang)}" href="${escapeHtml(alternate.href)}">`,
    );
  }

  tags.push(
    meta('property', 'og:type', page.ogType),
    meta('property', 'og:site_name', siteName),
    meta('property', 'og:title', page.title),
    meta('property', 'og:description', page.description),
    meta('property', 'og:locale', OG_LOCALES[page.locale]),
    meta('property', 'og:image', `${origin}/og-default.png`),
    meta('property', 'og:image:width', '1200'),
    meta('property', 'og:image:height', '630'),
    meta('property', 'og:image:alt', siteName),
    meta('name', 'twitter:card', 'summary_large_image'),
  );
  if (page.canonical !== undefined) {
    tags.push(meta('property', 'og:url', page.canonical));
  }

  for (const entry of page.jsonLd) {
    tags.push(jsonLdScript(entry));
  }
  return tags.join('\n    ');
}

/** Fills the built index.html with the head tags and the visible content of one page. */
export function renderShell(template: string, page: PageModel, head: string): string {
  const lang = page.locale;
  const dir = localeDirection(page.locale);
  return template
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<html\b[^>]*>/i, () => `<html lang="${lang}" dir="${dir}">`)
    .replace(HEAD_MARKER, () => head)
    .replace(ROOT_MARKER, () => page.bodyHtml);
}
