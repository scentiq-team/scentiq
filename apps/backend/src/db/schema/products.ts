// Products, sizes (variants) and how a product is described (ADR-0012).
// A product is the perfume; a variant is one size with its own SKU and price. Stock is NOT here:
// `on_hand` / `reserved` and the movements ledger arrive together in Phase 6A, so that
// on_hand = sum(movements) holds from the first row (STEP 3 decision D3-2).
import {
  CONCENTRATIONS,
  DESCRIPTION_MAX_LENGTH,
  GENDERS,
  MAX_IMAGES_PER_PRODUCT,
  MAX_PRICE_IQD,
  NAME_MAX_LENGTH,
  NOTE_POSITIONS,
  PRODUCT_STATUSES,
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  SIZE_UNITS,
  SKU_PATTERN,
} from '@scentiq/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  archivedAt,
  boundedText,
  createdAt,
  inList,
  optionalBoundedText,
  primaryId,
  updatedAt,
} from './columns.js';
import { mediaAssets } from './media.js';
import { brands, categories, families, notes, slugCheck, tags } from './taxonomy.js';

export const products = pgTable(
  'products',
  {
    id: primaryId(),
    slug: text('slug').notNull(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'restrict' }),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en'),
    descriptionAr: text('description_ar'),
    descriptionEn: text('description_en'),
    concentration: text('concentration'),
    gender: text('gender').notNull().default('unisex'),
    /** 1 (light) to 5 (very strong). Used by recommendations (ADR-0011). */
    intensity: smallint('intensity'),
    primaryFamilyId: uuid('primary_family_id').references(() => families.id, {
      onDelete: 'restrict',
    }),
    secondaryFamilyId: uuid('secondary_family_id').references(() => families.id, {
      onDelete: 'restrict',
    }),
    seoTitleAr: text('seo_title_ar'),
    seoTitleEn: text('seo_title_en'),
    seoDescriptionAr: text('seo_description_ar'),
    seoDescriptionEn: text('seo_description_en'),
    status: text('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: archivedAt(),
    /** Normalized text that search reads (ADR-0005). Rebuilt in the same transaction as every save. */
    searchDocument: text('search_document').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('products_slug_uq').on(t.slug),
    index('products_brand_idx').on(t.brandId),
    index('products_category_idx').on(t.categoryId),
    index('products_primary_family_idx').on(t.primaryFamilyId),
    index('products_published_at_idx')
      .on(t.publishedAt.desc())
      .where(sql`${t.status} = 'published'`),
    index('products_search_document_trgm_idx').using('gin', t.searchDocument.op('gin_trgm_ops')),
    slugCheck('products_slug_format', t.slug),
    boundedText('products_name_ar_valid', t.nameAr, NAME_MAX_LENGTH),
    optionalBoundedText('products_name_en_valid', t.nameEn, NAME_MAX_LENGTH),
    optionalBoundedText('products_description_ar_valid', t.descriptionAr, DESCRIPTION_MAX_LENGTH),
    optionalBoundedText('products_description_en_valid', t.descriptionEn, DESCRIPTION_MAX_LENGTH),
    optionalBoundedText('products_seo_title_ar_valid', t.seoTitleAr, SEO_TITLE_MAX_LENGTH),
    optionalBoundedText('products_seo_title_en_valid', t.seoTitleEn, SEO_TITLE_MAX_LENGTH),
    optionalBoundedText(
      'products_seo_description_ar_valid',
      t.seoDescriptionAr,
      SEO_DESCRIPTION_MAX_LENGTH,
    ),
    optionalBoundedText(
      'products_seo_description_en_valid',
      t.seoDescriptionEn,
      SEO_DESCRIPTION_MAX_LENGTH,
    ),
    check(
      'products_concentration_valid',
      sql`${t.concentration} is null or ${inList(t.concentration, CONCENTRATIONS)}`,
    ),
    check('products_gender_valid', inList(t.gender, GENDERS)),
    check(
      'products_intensity_range',
      sql`${t.intensity} is null or ${t.intensity} between 1 and 5`,
    ),
    check('products_status_valid', inList(t.status, PRODUCT_STATUSES)),
    check(
      'products_families_distinct',
      sql`${t.secondaryFamilyId} is null or (${t.primaryFamilyId} is not null and ${t.secondaryFamilyId} <> ${t.primaryFamilyId})`,
    ),
    check(
      'products_archived_at_matches_status',
      sql`(${t.status} = 'archived') = (${t.archivedAt} is not null)`,
    ),
    check(
      'products_published_has_timestamp',
      sql`${t.status} <> 'published' or ${t.publishedAt} is not null`,
    ),
    // The part of the publish gate that lives on this row. The rest (3 notes, an image with alt
    // text, a priced variant) needs other tables and is checked by the trigger in migration 0005.
    check(
      'products_published_required_fields',
      sql`${t.status} <> 'published' or (
        ${t.descriptionAr} is not null
        and ${t.categoryId} is not null
        and ${t.primaryFamilyId} is not null
        and ${t.seoTitleAr} is not null
        and ${t.seoDescriptionAr} is not null
      )`,
    ),
  ],
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: primaryId(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    sku: text('sku').notNull(),
    sizeValue: integer('size_value').notNull(),
    sizeUnit: text('size_unit').notNull().default('ml'),
    /** Whole dinars (ADR-0004). */
    priceIqd: integer('price_iqd').notNull(),
    /** The crossed-out "before" price; must be higher than the price. */
    compareAtIqd: integer('compare_at_iqd'),
    sortOrder: smallint('sort_order').notNull().default(0),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('product_variants_sku_uq').on(t.sku),
    // One live variant per size. An archived variant frees its size.
    uniqueIndex('product_variants_live_size_uq')
      .on(t.productId, t.sizeValue, t.sizeUnit)
      .where(sql`${t.archivedAt} is null`),
    index('product_variants_product_idx').on(t.productId),
    check('product_variants_sku_format', sql`${t.sku} ~ '${sql.raw(SKU_PATTERN)}'`),
    check('product_variants_size_value_range', sql`${t.sizeValue} between 1 and 10000`),
    check('product_variants_size_unit_valid', inList(t.sizeUnit, SIZE_UNITS)),
    check(
      'product_variants_price_range',
      sql`${t.priceIqd} between 1 and ${sql.raw(String(MAX_PRICE_IQD))}`,
    ),
    check(
      'product_variants_compare_at_above_price',
      sql`${t.compareAtIqd} is null or (${t.compareAtIqd} > ${t.priceIqd} and ${t.compareAtIqd} <= ${sql.raw(String(MAX_PRICE_IQD))})`,
    ),
  ],
);

/** A note sits in one position of a product's pyramid. `prominence`: 1 subtle, 2 clear, 3 dominant. */
export const productNotes = pgTable(
  'product_notes',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'restrict' }),
    position: text('position').notNull(),
    prominence: smallint('prominence').notNull().default(2),
  },
  (t) => [
    primaryKey({ name: 'product_notes_pk', columns: [t.productId, t.noteId] }),
    index('product_notes_note_idx').on(t.noteId),
    check('product_notes_position_valid', inList(t.position, NOTE_POSITIONS)),
    check('product_notes_prominence_range', sql`${t.prominence} between 1 and 3`),
  ],
);

export const productTags = pgTable(
  'product_tags',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ name: 'product_tags_pk', columns: [t.productId, t.tagId] }),
    index('product_tags_tag_idx').on(t.tagId),
  ],
);

/** The first image by `position` is the main one. Ties are broken by media id. */
export const productImages = pgTable(
  'product_images',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    position: smallint('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'product_images_pk', columns: [t.productId, t.mediaId] }),
    index('product_images_media_idx').on(t.mediaId),
    check(
      'product_images_position_range',
      sql`${t.position} between 0 and ${sql.raw(String(MAX_IMAGES_PER_PRODUCT - 1))}`,
    ),
  ],
);

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
export type ProductVariantRow = typeof productVariants.$inferSelect;
