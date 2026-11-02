// Catalog vocabulary (ADR-0012). One source for the database CHECK constraints, the Zod schemas,
// the services and, later, Perfume Studio, so a value can never be allowed in one place only.
// Pure data: no imports, no database types.

/**
 * The same rule as `SLUG_PATTERN` / `isValidSlug` in seo-routes.ts, written for a PostgreSQL CHECK
 * (a test keeps the two in step). Latin slugs only (ADR-0002, ADR-0016): Arabic URLs turn into
 * percent-encoded noise on WhatsApp.
 */
export const SLUG_SQL_PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*$';
/** Equal to the limit `isValidSlug` applies to routes, so a stored slug is always routable. */
export const SLUG_MAX_LENGTH = 120;

/** Upper case letters and digits, with . _ - inside. The upper case rule makes SKUs case-proof. */
export const SKU_PATTERN = '^[A-Z0-9][A-Z0-9._-]{1,39}$';
export const SKU_REGEX = new RegExp(SKU_PATTERN);

/** Whole dinars (ADR-0004). The ceiling only exists to catch a typed extra zero. */
export const MAX_PRICE_IQD = 100_000_000;

export const NAME_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 10_000;
export const STORY_MAX_LENGTH = 5_000;
export const SEO_TITLE_MAX_LENGTH = 120;
export const SEO_DESCRIPTION_MAX_LENGTH = 400;
export const ALT_TEXT_MAX_LENGTH = 300;
export const NOTE_ALIAS_MAX_LENGTH = 60;

/** A product cannot be published with fewer notes: recommendations and filters depend on them. */
export const MIN_NOTES_TO_PUBLISH = 3;
export const MAX_IMAGES_PER_PRODUCT = 20;

export const PRODUCT_STATUSES = ['draft', 'published', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Gender is an attribute, not a category (ADR-0012). */
export const GENDERS = ['women', 'men', 'unisex'] as const;
export type Gender = (typeof GENDERS)[number];

/** A product attribute because it is a different formulation (ADR-0012). `oil` covers attars and oud oil. */
export const CONCENTRATIONS = ['parfum', 'edp', 'edt', 'edc', 'oil'] as const;
export type Concentration = (typeof CONCENTRATIONS)[number];

export const NOTE_POSITIONS = ['top', 'heart', 'base'] as const;
export type NotePosition = (typeof NOTE_POSITIONS)[number];

/** How strongly a note shows in the product: 1 subtle, 2 clear, 3 dominant. */
export const NOTE_PROMINENCES = [1, 2, 3] as const;
export type NoteProminence = (typeof NOTE_PROMINENCES)[number];

/** Controlled vocabulary types (ADR-0012). New values come from Studio; no free-form tags. */
export const TAG_TYPES = ['occasion', 'season', 'mood', 'feature'] as const;
export type TagType = (typeof TAG_TYPES)[number];

/** The unit of a variant's size: millilitres, grams (bakhoor, oud chips) or pieces (gift sets). */
export const SIZE_UNITS = ['ml', 'g', 'pcs'] as const;
export type SizeUnit = (typeof SIZE_UNITS)[number];

export const COLLECTION_KINDS = ['manual', 'dynamic', 'hybrid'] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];

/** `pinned` items are shown first and in order; `excluded` items are removed from dynamic matches. */
export const COLLECTION_ITEM_MODES = ['pinned', 'excluded'] as const;
export type CollectionItemMode = (typeof COLLECTION_ITEM_MODES)[number];

/** Widths of the stored image variants (ADR-0009). A source narrower than 480 px is refused. */
export const MEDIA_VARIANT_WIDTHS = [480, 960, 1600] as const;
export type MediaVariantWidth = (typeof MEDIA_VARIANT_WIDTHS)[number];

/** Entities whose slug can change and must keep answering with a 301 (ADR-0002). */
export const REDIRECT_ENTITY_TYPES = [
  'product',
  'brand',
  'category',
  'collection',
  'note',
] as const;
export type RedirectEntityType = (typeof REDIRECT_ENTITY_TYPES)[number];

export const MAX_CATEGORY_DEPTH = 2;
