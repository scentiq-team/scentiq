import type { Locale } from '@scentiq/shared';

/** What a crawler (and a link preview) needs to know about a product. */
export interface ProductSummary {
  slug: string;
  nameAr: string;
  nameEn: string;
  brandAr: string;
  brandEn: string;
  descriptionAr: string;
  descriptionEn: string;
  /** Whole dinars (ADR-0004). */
  priceIqd: number;
  inStock: boolean;
  /** Sample products set this to false so they are never indexed. */
  indexable: boolean;
}

/** Phase 3 replaces the implementation with a database query; the SEO shell does not change. */
export interface ProductSource {
  find(slug: string): Promise<ProductSummary | undefined>;
}

export interface PageContext {
  /** Public origin, no trailing slash. */
  origin: string;
  products: ProductSource;
  /** True only in production. */
  allowIndexing: boolean;
  /** True outside production: sample products and developer pages may exist (ADR-0015). */
  allowSampleData: boolean;
}

export interface Alternate {
  hreflang: string;
  href: string;
}

export interface PageModel {
  status: 200 | 404;
  locale: Locale;
  title: string;
  description: string;
  /** Absolute canonical URL. Missing on pages that must not be canonicalised (404). */
  canonical?: string;
  /** Final robots directive, already combined with the environment rule. */
  robots: 'index,follow' | 'noindex,nofollow';
  alternates: Alternate[];
  ogType: 'website' | 'product';
  jsonLd: Record<string, unknown>[];
  /** Visible HTML placed inside #root until React takes over. */
  bodyHtml: string;
}
