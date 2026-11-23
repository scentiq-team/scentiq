// Brands, categories, notes and tags (ADR-0012). Create and update only: rows are archived, never
// deleted, and archiving belongs to Studio (Phase 7), which decides what "in use" means for staff.
//
// Rules every function here follows:
//   - one transaction per call (savepoint when the caller already has one);
//   - a renamed entity refreshes the `search_document` of every product that mentions it;
//   - a changed slug leaves a redirect behind (ADR-0002);
//   - an audit row is written in the same transaction (ADR-0004), listing WHAT changed, not the values
//     of long free text.

import type {
  BrandInput,
  BrandUpdateInput,
  CategoryInput,
  CategoryUpdateInput,
  NoteInput,
  NoteUpdateInput,
  TagInput,
} from '@scentiq/shared';
import { slugify } from '@scentiq/shared';
import { eq } from 'drizzle-orm';
import { type AuditActor, recordAudit } from '../../db/audit.js';
import type { DbExecutor, Tx } from '../../db/client.js';
import {
  type BrandRow,
  brands,
  type CategoryRow,
  categories,
  type NoteRow,
  noteAliases,
  notes,
  type TagRow,
  tags,
} from '../../db/schema/taxonomy.js';
import { CatalogError, guarded } from './errors.js';
import { productIdsDependingOn, refreshProductSearchDocuments } from './search-index.js';
import { claimSlug, retireSlug } from './slugs.js';
import { inTransaction } from './transaction.js';

/** The keys of `patch` that were actually provided. */
const providedKeys = (patch: object): string[] =>
  Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);

const NAME_KEYS = ['nameAr', 'nameEn'];
const touchesNames = (changed: string[]) => changed.some((key) => NAME_KEYS.includes(key));

// ----- brands -----

export function createBrand(
  executor: DbExecutor,
  actor: AuditActor,
  input: BrandInput,
): Promise<BrandRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      const slug = await claimSlug(tx, 'brand', { desired: input.slug, source: input.nameEn });
      const [row] = await tx
        .insert(brands)
        .values({
          slug,
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          storyAr: input.storyAr ?? null,
          storyEn: input.storyEn ?? null,
          countryCode: input.countryCode ?? null,
          logoMediaId: input.logoMediaId ?? null,
        })
        .returning();
      if (row === undefined) throw new Error('insert returned no row');
      await recordAudit(tx, {
        actor,
        action: 'brand.created',
        entity: { type: 'brand', id: row.id },
        details: { slug },
      });
      return row;
    }),
  );
}

export function updateBrand(
  executor: DbExecutor,
  actor: AuditActor,
  id: string,
  patch: BrandUpdateInput,
): Promise<BrandRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      const [current] = await tx
        .select()
        .from(brands)
        .where(eq(brands.id, id))
        .for('update')
        .limit(1);
      if (current === undefined) throw new CatalogError('not_found', 'brand_not_found');

      const changed = providedKeys(patch);
      if (changed.length === 0) return current;

      let slug = current.slug;
      if (patch.slug !== undefined && patch.slug !== current.slug) {
        slug = await claimSlug(tx, 'brand', { desired: patch.slug, source: '', entityId: id });
        await retireSlug(tx, 'brand', id, current.slug);
      }

      const [row] = await tx
        .update(brands)
        .set({
          slug,
          ...(patch.nameAr !== undefined && { nameAr: patch.nameAr }),
          ...(patch.nameEn !== undefined && { nameEn: patch.nameEn }),
          ...(patch.storyAr !== undefined && { storyAr: patch.storyAr }),
          ...(patch.storyEn !== undefined && { storyEn: patch.storyEn }),
          ...(patch.countryCode !== undefined && { countryCode: patch.countryCode }),
          ...(patch.logoMediaId !== undefined && { logoMediaId: patch.logoMediaId }),
        })
        .where(eq(brands.id, id))
        .returning();
      if (row === undefined) throw new Error('update returned no row');

      if (touchesNames(changed)) {
        await refreshProductSearchDocuments(tx, await productIdsDependingOn(tx, { brandId: id }));
      }
      await recordAudit(tx, {
        actor,
        action: 'brand.updated',
        entity: { type: 'brand', id },
        details: {
          changed,
          ...(slug !== current.slug && { slug: { from: current.slug, to: slug } }),
        },
      });
      return row;
    }),
  );
}

// ----- categories -----

async function assertCategoryExists(tx: Tx, id: string): Promise<void> {
  const [parent] = await tx
    .select({ id: categories.id, archivedAt: categories.archivedAt })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (parent === undefined) throw new CatalogError('invalid', 'parent_category_not_found');
  if (parent.archivedAt !== null) throw new CatalogError('invalid', 'parent_category_archived');
}

export function createCategory(
  executor: DbExecutor,
  actor: AuditActor,
  input: CategoryInput,
): Promise<CategoryRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      if (input.parentId) await assertCategoryExists(tx, input.parentId);
      const slug = await claimSlug(tx, 'category', { desired: input.slug, source: input.nameEn });
      const [row] = await tx
        .insert(categories)
        .values({
          slug,
          parentId: input.parentId ?? null,
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      if (row === undefined) throw new Error('insert returned no row');
      await recordAudit(tx, {
        actor,
        action: 'category.created',
        entity: { type: 'category', id: row.id },
        details: { slug, parentId: row.parentId },
      });
      return row;
    }),
  );
}

export function updateCategory(
  executor: DbExecutor,
  actor: AuditActor,
  id: string,
  patch: CategoryUpdateInput,
): Promise<CategoryRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      const [current] = await tx
        .select()
        .from(categories)
        .where(eq(categories.id, id))
        .for('update')
        .limit(1);
      if (current === undefined) throw new CatalogError('not_found', 'category_not_found');

      const changed = providedKeys(patch);
      if (changed.length === 0) return current;
      if (patch.parentId) await assertCategoryExists(tx, patch.parentId);

      let slug = current.slug;
      if (patch.slug !== undefined && patch.slug !== current.slug) {
        slug = await claimSlug(tx, 'category', { desired: patch.slug, source: '', entityId: id });
        await retireSlug(tx, 'category', id, current.slug);
      }

      const [row] = await tx
        .update(categories)
        .set({
          slug,
          ...(patch.parentId !== undefined && { parentId: patch.parentId }),
          ...(patch.nameAr !== undefined && { nameAr: patch.nameAr }),
          ...(patch.nameEn !== undefined && { nameEn: patch.nameEn }),
          ...(patch.sortOrder !== undefined && { sortOrder: patch.sortOrder }),
        })
        .where(eq(categories.id, id))
        .returning();
      if (row === undefined) throw new Error('update returned no row');

      if (touchesNames(changed)) {
        await refreshProductSearchDocuments(
          tx,
          await productIdsDependingOn(tx, { categoryId: id }),
        );
      }
      await recordAudit(tx, {
        actor,
        action: 'category.updated',
        entity: { type: 'category', id },
        details: {
          changed,
          ...(slug !== current.slug && { slug: { from: current.slug, to: slug } }),
        },
      });
      return row;
    }),
  );
}

// ----- notes -----

async function replaceAliases(tx: Tx, noteId: string, aliases: readonly string[]): Promise<void> {
  await tx.delete(noteAliases).where(eq(noteAliases.noteId, noteId));
  if (aliases.length > 0) {
    await tx.insert(noteAliases).values(aliases.map((alias) => ({ noteId, alias })));
  }
}

export function createNote(
  executor: DbExecutor,
  actor: AuditActor,
  input: NoteInput,
): Promise<NoteRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      const slug = await claimSlug(tx, 'note', { desired: input.slug, source: input.nameEn });
      const [row] = await tx
        .insert(notes)
        .values({ groupId: input.groupId, slug, nameAr: input.nameAr, nameEn: input.nameEn })
        .returning();
      if (row === undefined) throw new Error('insert returned no row');
      await replaceAliases(tx, row.id, input.aliases ?? []);
      await recordAudit(tx, {
        actor,
        action: 'note.created',
        entity: { type: 'note', id: row.id },
        details: { slug, aliases: input.aliases?.length ?? 0 },
      });
      return row;
    }),
  );
}

export function updateNote(
  executor: DbExecutor,
  actor: AuditActor,
  id: string,
  patch: NoteUpdateInput,
): Promise<NoteRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      const [current] = await tx
        .select()
        .from(notes)
        .where(eq(notes.id, id))
        .for('update')
        .limit(1);
      if (current === undefined) throw new CatalogError('not_found', 'note_not_found');

      const changed = providedKeys(patch);
      if (changed.length === 0) return current;

      let slug = current.slug;
      if (patch.slug !== undefined && patch.slug !== current.slug) {
        slug = await claimSlug(tx, 'note', { desired: patch.slug, source: '', entityId: id });
        await retireSlug(tx, 'note', id, current.slug);
      }

      const [row] = await tx
        .update(notes)
        .set({
          slug,
          ...(patch.groupId !== undefined && { groupId: patch.groupId }),
          ...(patch.nameAr !== undefined && { nameAr: patch.nameAr }),
          ...(patch.nameEn !== undefined && { nameEn: patch.nameEn }),
        })
        .where(eq(notes.id, id))
        .returning();
      if (row === undefined) throw new Error('update returned no row');

      if (patch.aliases !== undefined) await replaceAliases(tx, id, patch.aliases);
      if (touchesNames(changed) || patch.aliases !== undefined) {
        await refreshProductSearchDocuments(tx, await productIdsDependingOn(tx, { noteId: id }));
      }
      await recordAudit(tx, {
        actor,
        action: 'note.updated',
        entity: { type: 'note', id },
        details: {
          changed,
          ...(slug !== current.slug && { slug: { from: current.slug, to: slug } }),
        },
      });
      return row;
    }),
  );
}

// ----- tags -----

export function createTag(
  executor: DbExecutor,
  actor: AuditActor,
  input: TagInput,
): Promise<TagRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      // Tags are unique per type and have no public page, so they need no redirect and no suggestion
      // from the name: the caller gives the slug, or it is built from the English name.
      const slug = input.slug ?? (slugify(input.nameEn) || 'tag');
      const [row] = await tx
        .insert(tags)
        .values({ type: input.type, slug, nameAr: input.nameAr, nameEn: input.nameEn })
        .returning();
      if (row === undefined) throw new Error('insert returned no row');
      await recordAudit(tx, {
        actor,
        action: 'tag.created',
        entity: { type: 'tag', id: row.id },
        details: { type: input.type, slug },
      });
      return row;
    }),
  );
}

/** A tag's slug is part of filter links, so only its names can change. */
export function renameTag(
  executor: DbExecutor,
  actor: AuditActor,
  id: string,
  names: { nameAr?: string; nameEn?: string },
): Promise<TagRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      const [current] = await tx.select().from(tags).where(eq(tags.id, id)).for('update').limit(1);
      if (current === undefined) throw new CatalogError('not_found', 'tag_not_found');
      const changed = providedKeys(names);
      if (changed.length === 0) return current;

      const [row] = await tx
        .update(tags)
        .set({
          ...(names.nameAr !== undefined && { nameAr: names.nameAr }),
          ...(names.nameEn !== undefined && { nameEn: names.nameEn }),
        })
        .where(eq(tags.id, id))
        .returning();
      if (row === undefined) throw new Error('update returned no row');
      await refreshProductSearchDocuments(tx, await productIdsDependingOn(tx, { tagId: id }));
      await recordAudit(tx, {
        actor,
        action: 'tag.updated',
        entity: { type: 'tag', id },
        details: { changed },
      });
      return row;
    }),
  );
}
