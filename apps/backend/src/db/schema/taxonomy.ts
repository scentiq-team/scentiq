// The vocabulary products are described with (ADR-0012): brands, categories, olfactive families,
// notes and tags. They are controlled entities, not free text, because filters, search,
// recommendations and SEO landing pages are built on them. Rows are archived, never deleted.
import {
  NAME_MAX_LENGTH,
  NOTE_ALIAS_MAX_LENGTH,
  SLUG_MAX_LENGTH,
  SLUG_SQL_PATTERN,
  STORY_MAX_LENGTH,
  TAG_TYPES,
} from '@scentiq/shared';
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
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

/** `column` is a Latin slug (see SLUG_SQL_PATTERN). Named per table so a failure says which one. */
export const slugCheck = (name: string, column: AnyPgColumn) =>
  check(
    name,
    sql`${column} ~ '${sql.raw(SLUG_SQL_PATTERN)}' and length(${column}) <= ${sql.raw(String(SLUG_MAX_LENGTH))}`,
  );

export const brands = pgTable(
  'brands',
  {
    id: primaryId(),
    slug: text('slug').notNull(),
    nameAr: text('name_ar').notNull(),
    /** The Latin name, also used to suggest the slug and the search aliases. */
    nameEn: text('name_en').notNull(),
    storyAr: text('story_ar'),
    storyEn: text('story_en'),
    /** ISO 3166-1 alpha-2, for example `FR`. */
    countryCode: text('country_code'),
    logoMediaId: uuid('logo_media_id').references(() => mediaAssets.id, { onDelete: 'restrict' }),
    /** Reserved for brand page templates (ADR-0012): no table and no UI in v1. */
    templateKey: text('template_key'),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('brands_slug_uq').on(t.slug),
    uniqueIndex('brands_name_en_uq').on(sql`lower(${t.nameEn})`),
    slugCheck('brands_slug_format', t.slug),
    boundedText('brands_name_ar_valid', t.nameAr, NAME_MAX_LENGTH),
    boundedText('brands_name_en_valid', t.nameEn, NAME_MAX_LENGTH),
    optionalBoundedText('brands_story_ar_valid', t.storyAr, STORY_MAX_LENGTH),
    optionalBoundedText('brands_story_en_valid', t.storyEn, STORY_MAX_LENGTH),
    check(
      'brands_country_code_format',
      sql`${t.countryCode} is null or ${t.countryCode} ~ '^[A-Z]{2}$'`,
    ),
    check(
      'brands_template_key_format',
      sql`${t.templateKey} is null or ${t.templateKey} ~ '^[a-z][a-z0-9_]{0,39}$'`,
    ),
  ],
);

/** A tree at most two levels deep (trigger `categories_enforce_depth`, migration 0005). */
export const categories = pgTable(
  'categories',
  {
    id: primaryId(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'restrict',
    }),
    slug: text('slug').notNull(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    sortOrder: smallint('sort_order').notNull().default(0),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('categories_slug_uq').on(t.slug),
    index('categories_parent_idx').on(t.parentId),
    slugCheck('categories_slug_format', t.slug),
    boundedText('categories_name_ar_valid', t.nameAr, NAME_MAX_LENGTH),
    boundedText('categories_name_en_valid', t.nameEn, NAME_MAX_LENGTH),
    check('categories_not_own_parent', sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
  ],
);

/** Olfactive families: woody, floral, oriental... A product has one primary and one optional secondary. */
export const families = pgTable(
  'families',
  {
    id: primaryId(),
    slug: text('slug').notNull(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    sortOrder: smallint('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('families_slug_uq').on(t.slug),
    slugCheck('families_slug_format', t.slug),
    boundedText('families_name_ar_valid', t.nameAr, NAME_MAX_LENGTH),
    boundedText('families_name_en_valid', t.nameEn, NAME_MAX_LENGTH),
  ],
);

/**
 * How close two families smell, as a percentage (50 = adjacent, ADR-0011). Each pair is stored
 * once, smaller id first, so the table can never hold both directions with different weights.
 */
export const familyAdjacency = pgTable(
  'family_adjacency',
  {
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'restrict' }),
    adjacentFamilyId: uuid('adjacent_family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'restrict' }),
    weightPercent: smallint('weight_percent').notNull(),
  },
  (t) => [
    primaryKey({ name: 'family_adjacency_pk', columns: [t.familyId, t.adjacentFamilyId] }),
    index('family_adjacency_adjacent_idx').on(t.adjacentFamilyId),
    check('family_adjacency_ordered_pair', sql`${t.familyId} < ${t.adjacentFamilyId}`),
    check('family_adjacency_weight_range', sql`${t.weightPercent} between 1 and 100`),
  ],
);

/** citrus, floral, woody, ... */
export const noteGroups = pgTable(
  'note_groups',
  {
    id: primaryId(),
    slug: text('slug').notNull(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    sortOrder: smallint('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('note_groups_slug_uq').on(t.slug),
    slugCheck('note_groups_slug_format', t.slug),
    boundedText('note_groups_name_ar_valid', t.nameAr, NAME_MAX_LENGTH),
    boundedText('note_groups_name_en_valid', t.nameEn, NAME_MAX_LENGTH),
  ],
);

export const notes = pgTable(
  'notes',
  {
    id: primaryId(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => noteGroups.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('notes_slug_uq').on(t.slug),
    uniqueIndex('notes_name_en_uq').on(sql`lower(${t.nameEn})`),
    index('notes_group_idx').on(t.groupId),
    slugCheck('notes_slug_format', t.slug),
    boundedText('notes_name_ar_valid', t.nameAr, NAME_MAX_LENGTH),
    boundedText('notes_name_en_valid', t.nameEn, NAME_MAX_LENGTH),
  ],
);

/** Other spellings of a note ("oud", "oudh", "عود"). Search reads them in Phase 5. */
export const noteAliases = pgTable(
  'note_aliases',
  {
    id: primaryId(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
  },
  (t) => [
    uniqueIndex('note_aliases_note_alias_uq').on(t.noteId, sql`lower(${t.alias})`),
    boundedText('note_aliases_alias_valid', t.alias, NOTE_ALIAS_MAX_LENGTH),
  ],
);

/** Controlled vocabulary with a type: occasion, season, mood, feature. */
export const tags = pgTable(
  'tags',
  {
    id: primaryId(),
    type: text('type').notNull(),
    slug: text('slug').notNull(),
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('tags_type_slug_uq').on(t.type, t.slug),
    check('tags_type_valid', inList(t.type, TAG_TYPES)),
    slugCheck('tags_slug_format', t.slug),
    boundedText('tags_name_ar_valid', t.nameAr, NAME_MAX_LENGTH),
    boundedText('tags_name_en_valid', t.nameEn, NAME_MAX_LENGTH),
  ],
);

export type BrandRow = typeof brands.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type FamilyRow = typeof families.$inferSelect;
export type NoteGroupRow = typeof noteGroups.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
