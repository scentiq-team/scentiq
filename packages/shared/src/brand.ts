// Copy used by both the SEO shell (backend) and the pages (frontend), so the text a crawler
// sees and the text a shopper sees can never drift apart (ADR-0002).
import type { Locale } from './locale.js';

export const BRAND_NAME = 'ScentIQ';

export interface BrandCopy {
  /** Short descriptor that follows the name in page titles. */
  tagline: string;
  /** Main promise shown as the home page H1. */
  headline: string;
  /** Meta description and supporting line for the home page. */
  description: string;
  /** Label of the home link (navigation and breadcrumbs). */
  homeLabel: string;
  /** Heading of the 404 page. */
  notFoundTitle: string;
}

export const BRAND_COPY: Record<Locale, BrandCopy> = {
  ar: {
    tagline: 'عطور فاخرة',
    headline: 'اكتشف عطرك المثالي',
    description: 'تشكيلة مختارة بعناية، وتوصيات تفهم ذوقك، وتوصيل إلى باب بيتك.',
    homeLabel: 'الرئيسية',
    notFoundTitle: 'الصفحة غير موجودة',
  },
  en: {
    tagline: 'Luxury fragrance',
    headline: 'Find your signature scent',
    description:
      'A carefully chosen collection, recommendations that understand your taste, delivered to your door.',
    homeLabel: 'Home',
    notFoundTitle: 'Page not found',
  },
};
