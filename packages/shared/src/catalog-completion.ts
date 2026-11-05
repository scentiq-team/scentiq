// The product completion score (ADR-0012): a visible checklist that tells staff what a product still
// needs. The REQUIRED checks are exactly the publish gate (database CHECK `products_published_required_fields`
// plus trigger `products_publish_gate`), so the checklist and the database can never disagree: a test
// in the backend publishes a product that passes every required check and one that misses each one.
//
// Pure: takes counts and fields, returns keys. Studio turns the keys into Arabic labels.

import { MIN_NOTES_TO_PUBLISH } from './catalog-constants.js';

/** What the score needs to know about a product. Counts come from the database, not from the client. */
export interface ProductCompletionInput {
  nameAr?: string | null;
  nameEn?: string | null;
  brandId?: string | null;
  categoryId?: string | null;
  primaryFamilyId?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  seoTitleAr?: string | null;
  seoDescriptionAr?: string | null;
  concentration?: string | null;
  intensity?: number | null;
  noteCount: number;
  /** Variants that are not archived. A variant always has a price (CHECK price_iqd >= 1). */
  liveVariantCount: number;
  imageCount: number;
  /** Images whose Arabic alt text is filled in. */
  imagesWithAltCount: number;
  tagCount: number;
}

export const REQUIRED_COMPLETION_KEYS = [
  'name_ar',
  'brand',
  'category',
  'primary_family',
  'notes',
  'variant',
  'image_with_alt',
  'description_ar',
  'seo_title_ar',
  'seo_description_ar',
] as const;

export const OPTIONAL_COMPLETION_KEYS = [
  'name_en',
  'description_en',
  'concentration',
  'intensity',
  'tags',
  'gallery',
] as const;

export type CompletionKey =
  | (typeof REQUIRED_COMPLETION_KEYS)[number]
  | (typeof OPTIONAL_COMPLETION_KEYS)[number];

export interface CompletionCheck {
  key: CompletionKey;
  required: boolean;
  passed: boolean;
  /** Share of the 100 points this check is worth. */
  weight: number;
}

export interface ProductCompletion {
  /** 0 to 100, whole number. */
  score: number;
  checks: CompletionCheck[];
  /** Required checks that are not passed yet: the reasons the product cannot be published. */
  missingRequired: CompletionKey[];
  canPublish: boolean;
}

/** Required checks are worth 8 points each (80 in total), optional ones 20 in total. */
const REQUIRED_WEIGHT = 8;
const OPTIONAL_WEIGHTS: Record<(typeof OPTIONAL_COMPLETION_KEYS)[number], number> = {
  name_en: 4,
  description_en: 4,
  concentration: 4,
  intensity: 3,
  tags: 3,
  gallery: 2,
};

/** A text field counts only when it has something other than whitespace. */
const filled = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

export function computeProductCompletion(input: ProductCompletionInput): ProductCompletion {
  const passed: Record<CompletionKey, boolean> = {
    name_ar: filled(input.nameAr),
    brand: filled(input.brandId),
    category: filled(input.categoryId),
    primary_family: filled(input.primaryFamilyId),
    notes: input.noteCount >= MIN_NOTES_TO_PUBLISH,
    variant: input.liveVariantCount >= 1,
    image_with_alt: input.imagesWithAltCount >= 1,
    description_ar: filled(input.descriptionAr),
    seo_title_ar: filled(input.seoTitleAr),
    seo_description_ar: filled(input.seoDescriptionAr),
    name_en: filled(input.nameEn),
    description_en: filled(input.descriptionEn),
    concentration: filled(input.concentration),
    intensity: typeof input.intensity === 'number',
    tags: input.tagCount >= 1,
    gallery: input.imageCount >= 2,
  };

  const checks: CompletionCheck[] = [
    ...REQUIRED_COMPLETION_KEYS.map((key) => ({
      key,
      required: true,
      passed: passed[key],
      weight: REQUIRED_WEIGHT,
    })),
    ...OPTIONAL_COMPLETION_KEYS.map((key) => ({
      key,
      required: false,
      passed: passed[key],
      weight: OPTIONAL_WEIGHTS[key],
    })),
  ];

  const score = checks.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0);
  const missingRequired = checks.filter((c) => c.required && !c.passed).map((c) => c.key);
  return { score, checks, missingRequired, canPublish: missingRequired.length === 0 };
}
