// Image records (ADR-0009). The files live in MediaStorage (local disk in development, R2 in
// production); these rows say what exists, how big it is and what it shows (alt text).
import { ALT_TEXT_MAX_LENGTH, MEDIA_VARIANT_WIDTHS } from '@scentiq/shared';
import { sql } from 'drizzle-orm';
import { check, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, inList, optionalBoundedText, primaryId } from './columns.js';

/** Random, never derived from the uploaded file name. */
export const STORAGE_KEY_PATTERN = '^[a-z0-9][a-z0-9/_-]{7,119}$';

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: primaryId(),
    /** Prefix of the stored variants, for example `m/0198a4b2c3d4e5f6`. */
    storageKey: text('storage_key').notNull(),
    /** The uploaded file name, sanitized, for display in Studio only. */
    originalLabel: text('original_label'),
    /** Size of the largest stored variant. */
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** Total bytes of all stored variants. */
    byteSize: integer('byte_size').notNull(),
    /** A `#rrggbb` colour shown while the image loads. */
    dominantColor: text('dominant_color'),
    /** Arabic alt text is required to publish a product (ADR-0009). */
    altAr: text('alt_ar'),
    altEn: text('alt_en'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('media_assets_storage_key_uq').on(t.storageKey),
    check(
      'media_assets_storage_key_format',
      sql`${t.storageKey} ~ '${sql.raw(STORAGE_KEY_PATTERN)}'`,
    ),
    check(
      'media_assets_dimensions_valid',
      sql`${t.width} between 1 and 10000 and ${t.height} between 1 and 10000 and ${t.byteSize} > 0`,
    ),
    check(
      'media_assets_dominant_color_format',
      sql`${t.dominantColor} is null or ${t.dominantColor} ~ '^#[0-9a-f]{6}$'`,
    ),
    optionalBoundedText('media_assets_original_label_valid', t.originalLabel, 200),
    optionalBoundedText('media_assets_alt_ar_valid', t.altAr, ALT_TEXT_MAX_LENGTH),
    optionalBoundedText('media_assets_alt_en_valid', t.altEn, ALT_TEXT_MAX_LENGTH),
  ],
);

/** One stored file per fixed width. Never upscaled: a source narrower than 480 px is refused. */
export const mediaVariants = pgTable(
  'media_variants',
  {
    mediaId: uuid('media_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'cascade' }),
    width: integer('width').notNull(),
    storageKey: text('storage_key').notNull(),
    byteSize: integer('byte_size').notNull(),
  },
  (t) => [
    primaryKey({ name: 'media_variants_pk', columns: [t.mediaId, t.width] }),
    uniqueIndex('media_variants_storage_key_uq').on(t.storageKey),
    check('media_variants_width_allowed', inList(t.width, MEDIA_VARIANT_WIDTHS.map(String))),
    check('media_variants_byte_size_positive', sql`${t.byteSize} > 0`),
    check(
      'media_variants_storage_key_format',
      sql`${t.storageKey} ~ '${sql.raw(STORAGE_KEY_PATTERN)}'`,
    ),
  ],
);

export type MediaAssetRow = typeof mediaAssets.$inferSelect;
export type MediaVariantRow = typeof mediaVariants.$inferSelect;
