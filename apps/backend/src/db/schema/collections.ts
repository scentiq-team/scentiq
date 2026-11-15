// Collections (ADR-0012). Three kinds:
//   manual   an ordered list of pinned products, no rules
//   dynamic  rules only; the matching products are computed (see modules/catalog/collection-rules.ts)
//   hybrid   rules, plus pinned products shown first, minus excluded products
// `rules` is validated by the Zod union in @scentiq/shared and compiled to parameterized SQL. The
// raw JSON is never executed.
import {
  COLLECTION_ITEM_MODES,
  COLLECTION_KINDS,
  COLLECTION_RULES_MAX_BYTES,
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PRODUCT_STATUSES,
} from '@scentiq/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
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
import { products } from './products.js';
import { slugCheck } from './taxonomy.js';

export const collections = pgTable(
  'collections',
  {
    id: primaryId(),
    slug: text('slug').notNull(),
    kind: text('kind').notNull(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en'),
    descriptionAr: text('description_ar'),
    descriptionEn: text('description_en'),
    rules: jsonb('rules').$type<Record<string, unknown>>(),
    status: text('status').notNull().default('draft'),
    /** Optional schedule window: the collection shows only between these two moments. */
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    /** Slot on the home page, 1 = first. Empty means not on the home page. */
    homePosition: smallint('home_position'),
    coverMediaId: uuid('cover_media_id').references(() => mediaAssets.id, { onDelete: 'restrict' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('collections_slug_uq').on(t.slug),
    uniqueIndex('collections_home_position_uq')
      .on(t.homePosition)
      .where(sql`${t.homePosition} is not null`),
    slugCheck('collections_slug_format', t.slug),
    boundedText('collections_name_ar_valid', t.nameAr, NAME_MAX_LENGTH),
    optionalBoundedText('collections_name_en_valid', t.nameEn, NAME_MAX_LENGTH),
    optionalBoundedText(
      'collections_description_ar_valid',
      t.descriptionAr,
      DESCRIPTION_MAX_LENGTH,
    ),
    optionalBoundedText(
      'collections_description_en_valid',
      t.descriptionEn,
      DESCRIPTION_MAX_LENGTH,
    ),
    check('collections_kind_valid', inList(t.kind, COLLECTION_KINDS)),
    check('collections_status_valid', inList(t.status, PRODUCT_STATUSES)),
    // A manual collection has no rules; a dynamic or hybrid one has a JSON object of bounded size.
    check('collections_rules_match_kind', sql`(${t.kind} = 'manual') = (${t.rules} is null)`),
    check(
      'collections_rules_object',
      sql`${t.rules} is null or (jsonb_typeof(${t.rules}) = 'object' and octet_length(${t.rules}::text) <= ${sql.raw(String(COLLECTION_RULES_MAX_BYTES))})`,
    ),
    check(
      'collections_schedule_ordered',
      sql`${t.startsAt} is null or ${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`,
    ),
    check(
      'collections_home_position_range',
      sql`${t.homePosition} is null or ${t.homePosition} between 1 and 12`,
    ),
    check(
      'collections_archived_at_matches_status',
      sql`(${t.status} = 'archived') = (${t.archivedAt} is not null)`,
    ),
    check(
      'collections_published_has_timestamp',
      sql`${t.status} <> 'published' or ${t.publishedAt} is not null`,
    ),
  ],
);

/**
 * `pinned` rows carry a position (shown first, in that order); `excluded` rows have none.
 * A manual collection should hold only pinned rows. Nothing enforces that yet: the collection write
 * service arrives with Studio (Phase 7A), and until then the read queries ignore rows that do not
 * apply to the collection kind, so a wrong row cannot show a wrong product.
 */
export const collectionProducts = pgTable(
  'collection_products',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull().default('pinned'),
    position: smallint('position'),
  },
  (t) => [
    primaryKey({ name: 'collection_products_pk', columns: [t.collectionId, t.productId] }),
    index('collection_products_product_idx').on(t.productId),
    check('collection_products_mode_valid', inList(t.mode, COLLECTION_ITEM_MODES)),
    check(
      'collection_products_position_matches_mode',
      sql`(${t.mode} = 'pinned') = (${t.position} is not null) and (${t.position} is null or ${t.position} >= 0)`,
    ),
  ],
);

export type CollectionRow = typeof collections.$inferSelect;
