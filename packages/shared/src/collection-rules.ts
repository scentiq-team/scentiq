// Collection rules (ADR-0012). A dynamic or hybrid collection stores `rules`: a small JSON object
// that is validated here and compiled to parameterized SQL by the backend. The JSON is DATA: it names
// fields from a fixed whitelist and values of fixed types, and is never executed or interpolated.
// Unknown keys are rejected (`strictObject`), so a field cannot sneak in without a code change.
//
// Matching semantics (what the compiler does with each field):
//   brandIds        product.brand is one of these
//   categoryIds     product.category is one of these, or a sub-category of one of these
//   familyIds       product.primary or secondary family is one of these
//   noteIds         with noteMatch "any": has at least one of these notes; with "all": has every one
//   tagIds          has at least one of these tags
//   genders         product.gender is one of these
//   concentrations  product.concentration is one of these
//   priceMin/Max    some live variant costs within the range (whole IQD)
//   sort, limit     order and size of the result
// Stock ("in stock only") arrives with the inventory ledger in Phase 6A and is NOT a rule yet.

import { z } from 'zod';
import {
  COLLECTION_ITEM_MODES,
  CONCENTRATIONS,
  DESCRIPTION_MAX_LENGTH,
  GENDERS,
  MAX_PRICE_IQD,
  NAME_MAX_LENGTH,
} from './catalog-constants.js';
import { optionalText, requiredText, slugSchema, uuidSchema } from './catalog-schemas.js';

/** Small enough that the largest valid rules always fit COLLECTION_RULES_MAX_BYTES (a test proves it). */
export const COLLECTION_RULE_MAX_IDS = 30;
export const COLLECTION_RULE_DEFAULT_LIMIT = 24;
export const COLLECTION_RULE_MAX_LIMIT = 100;
export const COLLECTION_HOME_POSITIONS = 12;

export const COLLECTION_SORTS = ['newest', 'price_asc', 'price_desc', 'name'] as const;
export type CollectionSort = (typeof COLLECTION_SORTS)[number];

export const COLLECTION_NOTE_MATCHES = ['any', 'all'] as const;
export type CollectionNoteMatch = (typeof COLLECTION_NOTE_MATCHES)[number];

const uniqueIds = z
  .array(uuidSchema)
  .min(1)
  .max(COLLECTION_RULE_MAX_IDS)
  .refine((ids) => new Set(ids).size === ids.length, { error: 'Each id may appear once.' });

const uniqueValues = <const T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values))
    .min(1)
    .max(values.length)
    .refine((list) => new Set(list).size === list.length, { error: 'Each value may appear once.' });

const price = z.number().int().min(1).max(MAX_PRICE_IQD);

/** The filters a rules object can carry; at least one is required. */
export const COLLECTION_FILTER_KEYS = [
  'brandIds',
  'categoryIds',
  'familyIds',
  'noteIds',
  'tagIds',
  'genders',
  'concentrations',
  'priceMin',
  'priceMax',
] as const;

export const collectionRulesSchema = z
  .strictObject({
    brandIds: uniqueIds.optional(),
    categoryIds: uniqueIds.optional(),
    familyIds: uniqueIds.optional(),
    noteIds: uniqueIds.optional(),
    noteMatch: z.enum(COLLECTION_NOTE_MATCHES).default('any'),
    tagIds: uniqueIds.optional(),
    genders: uniqueValues(GENDERS).optional(),
    concentrations: uniqueValues(CONCENTRATIONS).optional(),
    priceMin: price.optional(),
    priceMax: price.optional(),
    sort: z.enum(COLLECTION_SORTS).default('newest'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(COLLECTION_RULE_MAX_LIMIT)
      .default(COLLECTION_RULE_DEFAULT_LIMIT),
  })
  .superRefine((rules, ctx) => {
    if (!COLLECTION_FILTER_KEYS.some((key) => rules[key] !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Rules need at least one filter, otherwise the collection would hold every product.',
      });
    }
    if (
      rules.priceMin !== undefined &&
      rules.priceMax !== undefined &&
      rules.priceMin > rules.priceMax
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['priceMin'],
        message: 'The minimum price cannot be higher than the maximum.',
      });
    }
  });

export type CollectionRules = z.infer<typeof collectionRulesSchema>;

const isoDateTime = z.iso.datetime({ offset: true });

const collectionBase = {
  slug: slugSchema.optional(),
  nameAr: requiredText(NAME_MAX_LENGTH),
  nameEn: optionalText(NAME_MAX_LENGTH),
  descriptionAr: optionalText(DESCRIPTION_MAX_LENGTH),
  descriptionEn: optionalText(DESCRIPTION_MAX_LENGTH),
  startsAt: isoDateTime.nullable().optional(),
  endsAt: isoDateTime.nullable().optional(),
  homePosition: z.number().int().min(1).max(COLLECTION_HOME_POSITIONS).nullable().optional(),
  coverMediaId: uuidSchema.nullable().optional(),
};

interface Schedule {
  startsAt?: string | null | undefined;
  endsAt?: string | null | undefined;
}

/** Mirrors the CHECK `collections_schedule_ordered`. */
function checkSchedule(value: Schedule, ctx: z.RefinementCtx): void {
  if (value.startsAt && value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    ctx.addIssue({
      code: 'custom',
      path: ['endsAt'],
      message: 'The collection must end after it starts.',
    });
  }
}

/**
 * The rules travel with the kind: a manual collection has none, a dynamic or hybrid one must have
 * them. This mirrors the CHECK `collections_rules_match_kind`.
 */
export const collectionInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('manual'), ...collectionBase }).superRefine(checkSchedule),
  z
    .strictObject({ kind: z.literal('dynamic'), ...collectionBase, rules: collectionRulesSchema })
    .superRefine(checkSchedule),
  z
    .strictObject({ kind: z.literal('hybrid'), ...collectionBase, rules: collectionRulesSchema })
    .superRefine(checkSchedule),
]);

export type CollectionInput = z.infer<typeof collectionInputSchema>;

/** Pinned products are shown first, in order; excluded products are removed from the rule matches. */
export const collectionItemSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    mode: z.literal(COLLECTION_ITEM_MODES[0]),
    productId: uuidSchema,
    position: z.number().int().min(0).max(999),
  }),
  z.strictObject({ mode: z.literal(COLLECTION_ITEM_MODES[1]), productId: uuidSchema }),
]);

export const collectionItemsSchema = z
  .array(collectionItemSchema)
  .max(200)
  .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
    error: 'A product is either pinned or excluded, once.',
  });

export type CollectionItem = z.infer<typeof collectionItemSchema>;
