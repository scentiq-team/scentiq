// What each public URL tells crawlers and link previews (ADR-0002). In Phase 1 only the home
// page, the 404 page and one sample product exist. Phase 3 swaps the product source for the
// database; Phase 4 adds brand and collection pages. The sample product exists outside
// production only, so production never exposes invented data (ADR-0015).
import {
  BRAND_COPY,
  BRAND_NAME,
  formatIqd,
  type Locale,
  localizePath,
  type SeoRoute,
} from '@scentiq/shared';
import { escapeHtml } from './html.js';
import type { PageContext, PageModel, ProductSource, ProductSummary } from './types.js';

const SAMPLE_PRODUCT: ProductSummary = {
  slug: 'test',
  nameAr: 'عطر تجريبي',
  nameEn: 'Sample perfume',
  brandAr: 'علامة تجريبية',
  brandEn: 'Sample brand',
  descriptionAr: 'منتج تجريبي لاختبار مسار الـ SEO. لا يظهر في الإنتاج.',
  descriptionEn: 'A sample product that proves the SEO path. It never appears in production.',
  priceIqd: 100000,
  inStock: true,
  indexable: false,
};

export const sampleProductSource: ProductSource = {
  async find(slug) {
    return slug === SAMPLE_PRODUCT.slug ? SAMPLE_PRODUCT : undefined;
  },
};

export const noProducts: ProductSource = {
  async find() {
    return undefined;
  },
};

function robots(ctx: PageContext, indexable: boolean): PageModel['robots'] {
  return ctx.allowIndexing && indexable ? 'index,follow' : 'noindex,nofollow';
}

function alternatesFor(ctx: PageContext, path: string): PageModel['alternates'] {
  const ar = `${ctx.origin}${localizePath('ar', path)}`;
  const en = `${ctx.origin}${localizePath('en', path)}`;
  return [
    { hreflang: 'ar', href: ar },
    { hreflang: 'en', href: en },
    { hreflang: 'x-default', href: ar },
  ];
}

function title(...parts: string[]): string {
  return [...parts, BRAND_NAME].join(' | ');
}

function homePage(locale: Locale, ctx: PageContext): PageModel {
  const copy = BRAND_COPY[locale];
  const canonical = `${ctx.origin}${localizePath(locale, '/')}`;
  return {
    status: 200,
    locale,
    title: `${BRAND_NAME} | ${copy.tagline}`,
    description: copy.description,
    canonical,
    robots: robots(ctx, true),
    alternates: alternatesFor(ctx, '/'),
    ogType: 'website',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: BRAND_NAME,
        url: `${ctx.origin}/`,
      },
    ],
    bodyHtml: `<main><h1>${escapeHtml(copy.headline)}</h1><p>${escapeHtml(copy.description)}</p></main>`,
  };
}

function notFoundPage(locale: Locale): PageModel {
  const copy = BRAND_COPY[locale];
  return {
    status: 404,
    locale,
    title: title(copy.notFoundTitle),
    description: copy.description,
    robots: 'noindex,nofollow',
    alternates: [],
    ogType: 'website',
    jsonLd: [],
    bodyHtml: `<main><h1>${escapeHtml(copy.notFoundTitle)}</h1><p><a href="${escapeHtml(localizePath(locale, '/'))}">${escapeHtml(copy.homeLabel)}</a></p></main>`,
  };
}

/** Pages rendered entirely by React; the server only supplies a noindex head. */
function appOnlyPage(name: string, ctx: PageContext): PageModel {
  return {
    status: 200,
    locale: 'ar',
    title: title(name),
    description: BRAND_COPY.ar.description,
    robots: robots(ctx, false),
    alternates: [],
    ogType: 'website',
    jsonLd: [],
    bodyHtml: '',
  };
}

async function productPage(locale: Locale, slug: string, ctx: PageContext): Promise<PageModel> {
  const product = await ctx.products.find(slug);
  if (product === undefined) return notFoundPage(locale);

  const ar = locale === 'ar';
  const name = ar ? product.nameAr : product.nameEn;
  const brand = ar ? product.brandAr : product.brandEn;
  const description = ar ? product.descriptionAr : product.descriptionEn;
  const path = `/p/${product.slug}`;
  const canonical = `${ctx.origin}${localizePath(locale, path)}`;
  const home = BRAND_COPY[locale].homeLabel;

  return {
    status: 200,
    locale,
    title: title(name, brand),
    description,
    canonical,
    robots: robots(ctx, product.indexable),
    alternates: alternatesFor(ctx, path),
    ogType: 'product',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name,
        description,
        brand: { '@type': 'Brand', name: brand },
        url: canonical,
        offers: {
          '@type': 'Offer',
          priceCurrency: 'IQD',
          price: String(product.priceIqd),
          availability: product.inStock
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          url: canonical,
        },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: home,
            item: `${ctx.origin}${localizePath(locale, '/')}`,
          },
          { '@type': 'ListItem', position: 2, name, item: canonical },
        ],
      },
    ],
    bodyHtml: `<main><article><h1>${escapeHtml(name)}</h1><p>${escapeHtml(brand)}</p><p>${escapeHtml(formatIqd(product.priceIqd, locale))}</p><p>${escapeHtml(description)}</p></article></main>`,
  };
}

export async function buildPage(route: SeoRoute, ctx: PageContext): Promise<PageModel> {
  switch (route.kind) {
    case 'home':
      return homePage(route.locale, ctx);
    case 'product':
      return productPage(route.locale, route.slug, ctx);
    case 'studio':
      return appOnlyPage('Perfume Studio', ctx);
    case 'dev':
      return ctx.allowSampleData ? appOnlyPage('Style guide', ctx) : notFoundPage('ar');
    case 'unknown':
      return notFoundPage(route.locale);
  }
}
