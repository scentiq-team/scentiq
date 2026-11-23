// When a slug changes, the old address keeps working with a 301 to the new one (ADR-0002).
// One row per retired slug. The service writes it in the same transaction as the slug change.
import { REDIRECT_ENTITY_TYPES } from '@scentiq/shared';
import { check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, inList, primaryId } from './columns.js';
import { slugCheck } from './taxonomy.js';

export const slugRedirects = pgTable(
  'slug_redirects',
  {
    id: primaryId(),
    entityType: text('entity_type').notNull(),
    /** No foreign key: the target can be a product, a brand, a category, a collection or a note. */
    entityId: uuid('entity_id').notNull(),
    oldSlug: text('old_slug').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // A retired slug points to exactly one entity.
    uniqueIndex('slug_redirects_old_slug_uq').on(t.entityType, t.oldSlug),
    index('slug_redirects_entity_idx').on(t.entityType, t.entityId),
    check('slug_redirects_entity_type_valid', inList(t.entityType, REDIRECT_ENTITY_TYPES)),
    slugCheck('slug_redirects_old_slug_format', t.oldSlug),
  ],
);

export type SlugRedirectRow = typeof slugRedirects.$inferSelect;
