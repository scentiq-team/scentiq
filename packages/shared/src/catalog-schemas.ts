// Zod contracts for catalog input (ADR-0012). The backend services parse with these before they touch
// the database, and Perfume Studio will reuse them for form validation, so a rule is written once.
// Every object is `strict`: an unknown key is an error, never silently ignored.
//
// Conventions for the optional text fields:
//   - on CREATE, a missing field and a blank one both mean "no value" (the service stores NULL);
//   - on UPDATE (`.partial()`), a missing field means "leave it alone", `null` or a blank string
//     means "clear it".
// That is why no schema below turns `undefined` into `null` by itself: it would clear fields on update.

import { z } from 'zod';
import {
  ALT_TEXT_MAX_LENGTH,
  CONCENTRATIONS,
  DESCRIPTION_MAX_LENGTH,
  GENDERS,
  MAX_IMAGES_PER_PRODUCT,
  MAX_PRICE_IQD,
  NAME_MAX_LENGTH,
  NOTE_ALIAS_MAX_LENGTH,
  NOTE_POSITIONS,
  type NoteProminence,
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  SIZE_UNITS,
  SKU_PATTERN,
  STORY_MAX_LENGTH,
  TAG_TYPES,
} from './catalog-constants.js';
import { SLUG_PATTERN } from './seo-routes.js';

export const uuidSchema = z.uuid();

/** Latin, lower-case, hyphen separated, at most 120 characters (ADR-0002). */
export const slugSchema = z.string().max(120).regex(SLUG_PATTERN, {
  error: 'Slug must be Latin lower-case letters, digits and single hyphens.',
});

export const requiredText = (max: number) => z.string().trim().min(1).max(max);

const blankToNull = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/** Text that may be absent: a blank string becomes `null`, a missing field stays missing. */
export const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable()).optional();

const idList = (max: number) =>
  z
    .array(uuidSchema)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, { error: 'Each id may appear once.' });

// ----- taxonomy -----

export const brandFields = {
  slug: slugSchema.optional(),
  nameAr: requiredText(NAME_MAX_LENGTH),
  nameEn: requiredText(NAME_MAX_LENGTH),
  storyAr: optionalText(STORY_MAX_LENGTH),
  storyEn: optionalText(STORY_MAX_LENGTH),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/, { error: 'Use an ISO 3166-1 alpha-2 code such as FR.' })
    .nullable()
    .optional(),
  logoMediaId: uuidSchema.nullable().optional(),
};
export const brandInputSchema = z.strictObject(brandFields);
export const brandUpdateSchema = z.strictObject(brandFields).partial();

export const categoryFields = {
  slug: slugSchema.optional(),
  parentId: uuidSchema.nullable().optional(),
  nameAr: requiredText(NAME_MAX_LENGTH),
  nameEn: requiredText(NAME_MAX_LENGTH),
  sortOrder: z.number().int().min(0).max(32_767).optional(),
};
export const categoryInputSchema = z.strictObject(categoryFields);
export const categoryUpdateSchema = z.strictObject(categoryFields).partial();

export const noteFields = {
  slug: slugSchema.optional(),
  groupId: uuidSchema,
  nameAr: requiredText(NAME_MAX_LENGTH),
  nameEn: requiredText(NAME_MAX_LENGTH),
  aliases: z
    .array(requiredText(NOTE_ALIAS_MAX_LENGTH))
    .max(20)
    .refine((list) => new Set(list.map((a) => a.toLowerCase())).size === list.length, {
      error: 'Each alias may appear once.',
    })
    .optional(),
};
export const noteInputSchema = z.strictObject(noteFields);
export const noteUpdateSchema = z.strictObject(noteFields).partial();

export const tagFields = {
  type: z.enum(TAG_TYPES),
  slug: slugSchema.optional(),
  nameAr: requiredText(NAME_MAX_LENGTH),
  nameEn: requiredText(NAME_MAX_LENGTH),
};
export const tagInputSchema = z.strictObject(tagFields);

// ----- products -----

export const productFields = {
  slug: slugSchema.optional(),
  brandId: uuidSchema,
  categoryId: uuidSchema.nullable().optional(),
  nameAr: requiredText(NAME_MAX_LENGTH),
  nameEn: optionalText(NAME_MAX_LENGTH),
  descriptionAr: optionalText(DESCRIPTION_MAX_LENGTH),
  descriptionEn: optionalText(DESCRIPTION_MAX_LENGTH),
  concentration: z.enum(CONCENTRATIONS).nullable().optional(),
  gender: z.enum(GENDERS).optional(),
  intensity: z.number().int().min(1).max(5).nullable().optional(),
  primaryFamilyId: uuidSchema.nullable().optional(),
  secondaryFamilyId: uuidSchema.nullable().optional(),
  seoTitleAr: optionalText(SEO_TITLE_MAX_LENGTH),
  seoTitleEn: optionalText(SEO_TITLE_MAX_LENGTH),
  seoDescriptionAr: optionalText(SEO_DESCRIPTION_MAX_LENGTH),
  seoDescriptionEn: optionalText(SEO_DESCRIPTION_MAX_LENGTH),
};

interface FamilyPair {
  primaryFamilyId?: string | null | undefined;
  secondaryFamilyId?: string | null | undefined;
}

/** Mirrors the CHECK `products_families_distinct`, so the form can say it before the database does. */
function checkFamilies(value: FamilyPair, ctx: z.RefinementCtx): void {
  if (value.secondaryFamilyId && value.secondaryFamilyId === value.primaryFamilyId) {
    ctx.addIssue({
      code: 'custom',
      path: ['secondaryFamilyId'],
      message: 'The secondary family must differ from the primary one.',
    });
  }
}

export const productCreateSchema = z.strictObject(productFields).superRefine(checkFamilies);
export const productUpdateSchema = z
  .strictObject(productFields)
  .partial()
  .superRefine(checkFamilies);

export const variantFields = {
  /** Upper-cased on the way in, so "ab-100" and "AB-100" are the same SKU. */
  sku: z.string().trim().toUpperCase().regex(new RegExp(SKU_PATTERN), {
    error: 'SKU is 2 to 40 characters: A-Z, 0-9, dot, underscore or hyphen.',
  }),
  sizeValue: z.number().int().min(1).max(10_000),
  sizeUnit: z.enum(SIZE_UNITS).optional(),
  /** Whole dinars (ADR-0004). */
  priceIqd: z.number().int().min(1).max(MAX_PRICE_IQD),
  compareAtIqd: z.number().int().min(1).max(MAX_PRICE_IQD).nullable().optional(),
  sortOrder: z.number().int().min(0).max(32_767).optional(),
};

/** Mirrors the CHECK `product_variants_compare_at_above_price`. */
function checkCompareAt(
  value: { priceIqd?: number | undefined; compareAtIqd?: number | null | undefined },
  ctx: z.RefinementCtx,
): void {
  if (
    value.compareAtIqd != null &&
    value.priceIqd !== undefined &&
    value.compareAtIqd <= value.priceIqd
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['compareAtIqd'],
      message: 'The "before" price must be higher than the price.',
    });
  }
}

export const variantInputSchema = z.strictObject(variantFields).superRefine(checkCompareAt);
export const variantUpdateSchema = z
  .strictObject(variantFields)
  .partial()
  .superRefine(checkCompareAt);

export const productNoteInputSchema = z.strictObject({
  noteId: uuidSchema,
  position: z.enum(NOTE_POSITIONS),
  prominence: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .default(2 satisfies NoteProminence),
});

/** The full list of notes a product has: saving replaces the previous list. */
export const productNotesInputSchema = z
  .array(productNoteInputSchema)
  .max(40)
  .refine((list) => new Set(list.map((n) => n.noteId)).size === list.length, {
    error: 'A note can be added to a product once.',
  });

export const productTagsInputSchema = idList(30);

/** The images of a product in display order (the first one is the cover). */
export const productImagesInputSchema = z
  .array(z.strictObject({ mediaId: uuidSchema }))
  .max(MAX_IMAGES_PER_PRODUCT)
  .refine((list) => new Set(list.map((i) => i.mediaId)).size === list.length, {
    error: 'An image can be added to a product once.',
  });

/** Alt text is written per image, in Arabic first (accessibility and image search). */
export const altTextSchema = requiredText(ALT_TEXT_MAX_LENGTH);

export type BrandInput = z.infer<typeof brandInputSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type NoteInput = z.infer<typeof noteInputSchema>;
export type TagInput = z.infer<typeof tagInputSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type ProductNoteInput = z.infer<typeof productNoteInputSchema>;
