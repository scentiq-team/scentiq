// Product services (ADR-0012): everything that changes a product goes through here, in ONE
// transaction that also refreshes `search_document` and writes the audit row.
//
// Lifecycle:   draft --publish--> published --unpublish--> draft
//              draft|published --archive--> archived --restore--> draft
// A published product must always stay complete: any change that would break that (removing a note,
// archiving the last variant, clearing alt text) is refused and rolled back. The database repeats the
// rules that fit in a constraint or trigger, so a bug here cannot publish an incomplete product.

import type {
  ProductCreateInput,
  ProductNoteInput,
  ProductUpdateInput,
  VariantInput,
  VariantUpdateInput,
} from '@scentiq/shared';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { type AuditActor, recordAudit } from '../../db/audit.js';
import type { DbExecutor, Tx } from '../../db/client.js';
import { mediaAssets } from '../../db/schema/media.js';
import {
  type ProductRow,
  type ProductVariantRow,
  productImages,
  productNotes,
  products,
  productTags,
  productVariants,
} from '../../db/schema/products.js';
import { brands, categories, families, notes, tags } from '../../db/schema/taxonomy.js';
import { assertProductsStayValid, getProductCompletion } from './completion.js';
import { CatalogError, guarded } from './errors.js';
import { refreshProductSearchDocuments } from './search-index.js';
import { claimSlug, retireSlug } from './slugs.js';
import { inTransaction, lockImageDescriptions } from './transaction.js';
import { pickDefined } from './util.js';

// ----- helpers -----

async function lockProduct(tx: Tx, id: string): Promise<ProductRow> {
  const [row] = await tx.select().from(products).where(eq(products.id, id)).for('update').limit(1);
  if (row === undefined) throw new CatalogError('not_found', 'product_not_found');
  return row;
}

/** A product that is archived is read-only: restore it first. */
function assertEditable(product: ProductRow): void {
  if (product.status === 'archived') throw new CatalogError('conflict', 'product_archived');
}

/** The brand and category a product points at must exist and must not be archived. */
async function assertReferencesUsable(
  tx: Tx,
  refs: { brandId?: string | undefined; categoryId?: string | null | undefined },
): Promise<void> {
  if (refs.brandId) {
    const [brand] = await tx
      .select({ archivedAt: brands.archivedAt })
      .from(brands)
      .where(eq(brands.id, refs.brandId))
      .limit(1);
    if (brand === undefined) throw new CatalogError('invalid', 'brand_not_found');
    if (brand.archivedAt !== null) throw new CatalogError('invalid', 'brand_archived');
  }
  if (refs.categoryId) {
    const [category] = await tx
      .select({ archivedAt: categories.archivedAt })
      .from(categories)
      .where(eq(categories.id, refs.categoryId))
      .limit(1);
    if (category === undefined) throw new CatalogError('invalid', 'category_not_found');
    if (category.archivedAt !== null) throw new CatalogError('invalid', 'category_archived');
  }
}

async function assertFamiliesExist(tx: Tx, ids: (string | null | undefined)[]): Promise<void> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (wanted.length === 0) return;
  const found = await tx
    .select({ id: families.id })
    .from(families)
    .where(inArray(families.id, wanted));
  if (found.length !== wanted.length) throw new CatalogError('invalid', 'family_not_found');
}

const reload = async (tx: Tx, id: string): Promise<ProductRow> => {
  const [row] = await tx.select().from(products).where(eq(products.id, id)).limit(1);
  if (row === undefined) throw new CatalogError('not_found', 'product_not_found');
  return row;
};

// ----- create and update -----

export function createProduct(
  executor: DbExecutor,
  actor: AuditActor,
  input: ProductCreateInput,
): Promise<ProductRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      await assertReferencesUsable(tx, { brandId: input.brandId, categoryId: input.categoryId });
      await assertFamiliesExist(tx, [input.primaryFamilyId, input.secondaryFamilyId]);
      const slug = await claimSlug(tx, 'product', {
        desired: input.slug,
        source: input.nameEn || input.nameAr,
      });

      // A product is always born as a draft: it has no notes, variants or images yet (the database
      // trigger refuses a product that is created as published).
      const [row] = await tx
        .insert(products)
        .values({
          slug,
          brandId: input.brandId,
          categoryId: input.categoryId ?? null,
          nameAr: input.nameAr,
          nameEn: input.nameEn ?? null,
          descriptionAr: input.descriptionAr ?? null,
          descriptionEn: input.descriptionEn ?? null,
          concentration: input.concentration ?? null,
          gender: input.gender ?? 'unisex',
          intensity: input.intensity ?? null,
          primaryFamilyId: input.primaryFamilyId ?? null,
          secondaryFamilyId: input.secondaryFamilyId ?? null,
          seoTitleAr: input.seoTitleAr ?? null,
          seoTitleEn: input.seoTitleEn ?? null,
          seoDescriptionAr: input.seoDescriptionAr ?? null,
          seoDescriptionEn: input.seoDescriptionEn ?? null,
        })
        .returning();
      if (row === undefined) throw new Error('insert returned no row');

      await refreshProductSearchDocuments(tx, [row.id]);
      await recordAudit(tx, {
        actor,
        action: 'product.created',
        entity: { type: 'product', id: row.id },
        details: { slug, brandId: row.brandId },
      });
      return reload(tx, row.id);
    }),
  );
}

export function updateProduct(
  executor: DbExecutor,
  actor: AuditActor,
  id: string,
  patch: ProductUpdateInput,
): Promise<ProductRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      const current = await lockProduct(tx, id);
      assertEditable(current);

      const values = pickDefined({
        brandId: patch.brandId,
        categoryId: patch.categoryId,
        nameAr: patch.nameAr,
        nameEn: patch.nameEn,
        descriptionAr: patch.descriptionAr,
        descriptionEn: patch.descriptionEn,
        concentration: patch.concentration,
        gender: patch.gender,
        intensity: patch.intensity,
        primaryFamilyId: patch.primaryFamilyId,
        secondaryFamilyId: patch.secondaryFamilyId,
        seoTitleAr: patch.seoTitleAr,
        seoTitleEn: patch.seoTitleEn,
        seoDescriptionAr: patch.seoDescriptionAr,
        seoDescriptionEn: patch.seoDescriptionEn,
      });
      const changed = Object.keys(values);
      const slugChanged = patch.slug !== undefined && patch.slug !== current.slug;
      if (changed.length === 0 && !slugChanged) return current;

      await assertReferencesUsable(tx, { brandId: patch.brandId, categoryId: patch.categoryId });
      await assertFamiliesExist(tx, [patch.primaryFamilyId, patch.secondaryFamilyId]);

      let slug = current.slug;
      if (slugChanged && patch.slug !== undefined) {
        slug = await claimSlug(tx, 'product', { desired: patch.slug, source: '', entityId: id });
        // A draft that was never public has no address to protect; anything that was published once
        // keeps answering at its old slug (ADR-0002).
        if (current.publishedAt !== null) await retireSlug(tx, 'product', id, current.slug);
        changed.push('slug');
      }

      await tx
        .update(products)
        .set({ ...values, slug })
        .where(eq(products.id, id));
      await refreshProductSearchDocuments(tx, [id]);
      await assertProductsStayValid(tx, [id]);
      await recordAudit(tx, {
        actor,
        action: 'product.updated',
        entity: { type: 'product', id },
        details: {
          changed,
          ...(slug !== current.slug && { slug: { from: current.slug, to: slug } }),
        },
      });
      return reload(tx, id);
    }),
  );
}

// ----- notes, tags, images -----

/** Replaces the notes of a product with exactly this list. */
export function setProductNotes(
  executor: DbExecutor,
  actor: AuditActor,
  productId: string,
  list: readonly ProductNoteInput[],
): Promise<void> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      assertEditable(await lockProduct(tx, productId));
      if (list.length > 0) {
        const archived = await tx
          .select({ id: notes.id })
          .from(notes)
          .where(
            and(
              inArray(
                notes.id,
                list.map((n) => n.noteId),
              ),
              isNotNull(notes.archivedAt),
            ),
          );
        if (archived.length > 0) throw new CatalogError('invalid', 'note_archived');
      }
      await tx.delete(productNotes).where(eq(productNotes.productId, productId));
      if (list.length > 0) {
        await tx.insert(productNotes).values(
          list.map((n) => ({
            productId,
            noteId: n.noteId,
            position: n.position,
            prominence: n.prominence,
          })),
        );
      }
      await refreshProductSearchDocuments(tx, [productId]);
      await assertProductsStayValid(tx, [productId]);
      await recordAudit(tx, {
        actor,
        action: 'product.notes_changed',
        entity: { type: 'product', id: productId },
        details: { count: list.length },
      });
    }),
  );
}

export function setProductTags(
  executor: DbExecutor,
  actor: AuditActor,
  productId: string,
  tagIds: readonly string[],
): Promise<void> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      assertEditable(await lockProduct(tx, productId));
      if (tagIds.length > 0) {
        const archived = await tx
          .select({ id: tags.id })
          .from(tags)
          .where(and(inArray(tags.id, [...tagIds]), isNotNull(tags.archivedAt)));
        if (archived.length > 0) throw new CatalogError('invalid', 'tag_archived');
      }
      await tx.delete(productTags).where(eq(productTags.productId, productId));
      if (tagIds.length > 0) {
        await tx.insert(productTags).values(tagIds.map((tagId) => ({ productId, tagId })));
      }
      await refreshProductSearchDocuments(tx, [productId]);
      await recordAudit(tx, {
        actor,
        action: 'product.tags_changed',
        entity: { type: 'product', id: productId },
        details: { count: tagIds.length },
      });
    }),
  );
}

/** Replaces the images of a product; the first id is the cover and the order is kept. */
export function setProductImages(
  executor: DbExecutor,
  actor: AuditActor,
  productId: string,
  mediaIds: readonly string[],
): Promise<void> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      assertEditable(await lockProduct(tx, productId));
      await tx.delete(productImages).where(eq(productImages.productId, productId));
      if (mediaIds.length > 0) {
        await tx
          .insert(productImages)
          .values(mediaIds.map((mediaId, position) => ({ productId, mediaId, position })));
      }
      await assertProductsStayValid(tx, [productId]);
      await recordAudit(tx, {
        actor,
        action: 'product.images_changed',
        entity: { type: 'product', id: productId },
        details: { count: mediaIds.length },
      });
    }),
  );
}

/**
 * Sets the alt text of an image. Clearing the Arabic alt text of the only described image of a
 * published product would leave it unpublishable, so that is refused.
 */
export function setMediaAlt(
  executor: DbExecutor,
  actor: AuditActor,
  mediaId: string,
  alt: { altAr?: string | null; altEn?: string | null },
): Promise<void> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      await lockImageDescriptions(tx);
      const [media] = await tx
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(eq(mediaAssets.id, mediaId))
        .for('update')
        .limit(1);
      if (media === undefined) throw new CatalogError('not_found', 'media_not_found');

      const values = pickDefined({
        altAr: alt.altAr === '' ? null : alt.altAr,
        altEn: alt.altEn === '' ? null : alt.altEn,
      });
      if (Object.keys(values).length === 0) return;
      await tx.update(mediaAssets).set(values).where(eq(mediaAssets.id, mediaId));

      const users = await tx
        .select({ productId: productImages.productId })
        .from(productImages)
        .where(eq(productImages.mediaId, mediaId));
      await assertProductsStayValid(
        tx,
        users.map((u) => u.productId),
      );
      await recordAudit(tx, {
        actor,
        action: 'media.alt_changed',
        entity: { type: 'media', id: mediaId },
        details: { changed: Object.keys(values) },
      });
    }),
  );
}

// ----- variants -----

export function addVariant(
  executor: DbExecutor,
  actor: AuditActor,
  productId: string,
  input: VariantInput,
): Promise<ProductVariantRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      assertEditable(await lockProduct(tx, productId));
      const [row] = await tx
        .insert(productVariants)
        .values({
          productId,
          sku: input.sku,
          sizeValue: input.sizeValue,
          sizeUnit: input.sizeUnit ?? 'ml',
          priceIqd: input.priceIqd,
          compareAtIqd: input.compareAtIqd ?? null,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      if (row === undefined) throw new Error('insert returned no row');
      await recordAudit(tx, {
        actor,
        action: 'product.variant_added',
        entity: { type: 'product', id: productId },
        details: { variantId: row.id, sku: row.sku, priceIqd: row.priceIqd },
      });
      return row;
    }),
  );
}

export function updateVariant(
  executor: DbExecutor,
  actor: AuditActor,
  variantId: string,
  patch: VariantUpdateInput,
): Promise<ProductVariantRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      const [current] = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, variantId))
        .for('update')
        .limit(1);
      if (current === undefined) throw new CatalogError('not_found', 'variant_not_found');
      if (current.archivedAt !== null) throw new CatalogError('conflict', 'variant_archived');
      assertEditable(await lockProduct(tx, current.productId));

      const values = pickDefined({
        sku: patch.sku,
        sizeValue: patch.sizeValue,
        sizeUnit: patch.sizeUnit,
        priceIqd: patch.priceIqd,
        compareAtIqd: patch.compareAtIqd,
        sortOrder: patch.sortOrder,
      });
      const changed = Object.keys(values);
      if (changed.length === 0) return current;

      const [row] = await tx
        .update(productVariants)
        .set(values)
        .where(eq(productVariants.id, variantId))
        .returning();
      if (row === undefined) throw new Error('update returned no row');

      const priceTouched =
        row.priceIqd !== current.priceIqd || row.compareAtIqd !== current.compareAtIqd;
      await recordAudit(tx, {
        actor,
        // Price changes get their own action: they are what staff look for after "who changed this?".
        action: priceTouched ? 'product.price_changed' : 'product.variant_updated',
        entity: { type: 'product', id: current.productId },
        details: {
          variantId,
          sku: row.sku,
          changed,
          ...(priceTouched && {
            priceIqd: { from: current.priceIqd, to: row.priceIqd },
            compareAtIqd: { from: current.compareAtIqd, to: row.compareAtIqd },
          }),
        },
      });
      return row;
    }),
  );
}

/** Archives a variant (a variant is never deleted: orders will point at it). */
export function archiveVariant(
  executor: DbExecutor,
  actor: AuditActor,
  variantId: string,
): Promise<void> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      const [current] = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, variantId))
        .for('update')
        .limit(1);
      if (current === undefined) throw new CatalogError('not_found', 'variant_not_found');
      if (current.archivedAt !== null) return;
      assertEditable(await lockProduct(tx, current.productId));

      await tx
        .update(productVariants)
        .set({ archivedAt: new Date() })
        .where(eq(productVariants.id, variantId));
      await assertProductsStayValid(tx, [current.productId]);
      await recordAudit(tx, {
        actor,
        action: 'product.variant_archived',
        entity: { type: 'product', id: current.productId },
        details: { variantId, sku: current.sku },
      });
    }),
  );
}

// ----- status -----

export function publishProduct(
  executor: DbExecutor,
  actor: AuditActor,
  id: string,
): Promise<ProductRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      const current = await lockProduct(tx, id);
      if (current.status === 'published') return current;
      assertEditable(current);

      // Say exactly what is missing instead of leaving it to the database's one-line rejection.
      const completion = await getProductCompletion(tx, id);
      if (!completion.canPublish) {
        throw new CatalogError('not_publishable', 'incomplete', {
          missing: completion.missingRequired,
        });
      }

      // The first publication date is kept when a product is published again, so "newest" does not
      // jump around when staff unpublish and republish.
      await tx
        .update(products)
        .set({ status: 'published', publishedAt: current.publishedAt ?? new Date() })
        .where(eq(products.id, id));
      await recordAudit(tx, {
        actor,
        action: 'product.published',
        entity: { type: 'product', id },
        details: { score: completion.score },
      });
      return reload(tx, id);
    }),
  );
}

export function unpublishProduct(
  executor: DbExecutor,
  actor: AuditActor,
  id: string,
): Promise<ProductRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      const current = await lockProduct(tx, id);
      if (current.status === 'draft') return current;
      assertEditable(current);
      await tx.update(products).set({ status: 'draft' }).where(eq(products.id, id));
      await recordAudit(tx, {
        actor,
        action: 'product.unpublished',
        entity: { type: 'product', id },
      });
      return reload(tx, id);
    }),
  );
}

export function archiveProduct(
  executor: DbExecutor,
  actor: AuditActor,
  id: string,
): Promise<ProductRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      const current = await lockProduct(tx, id);
      if (current.status === 'archived') return current;
      await tx
        .update(products)
        .set({ status: 'archived', archivedAt: new Date() })
        .where(eq(products.id, id));
      await recordAudit(tx, {
        actor,
        action: 'product.archived',
        entity: { type: 'product', id },
        details: { from: current.status },
      });
      return reload(tx, id);
    }),
  );
}

/** An archived product comes back as a draft: it must be published again on purpose. */
export function restoreProduct(
  executor: DbExecutor,
  actor: AuditActor,
  id: string,
): Promise<ProductRow> {
  return guarded(() =>
    inTransaction(executor, async (tx) => {
      const current = await lockProduct(tx, id);
      if (current.status !== 'archived') return current;
      await tx
        .update(products)
        .set({ status: 'draft', archivedAt: null })
        .where(eq(products.id, id));
      await recordAudit(tx, {
        actor,
        action: 'product.restored',
        entity: { type: 'product', id },
      });
      return reload(tx, id);
    }),
  );
}

// ----- reading -----

export async function getProductDetail(executor: DbExecutor, id: string) {
  const [product] = await executor.select().from(products).where(eq(products.id, id)).limit(1);
  if (product === undefined) throw new CatalogError('not_found', 'product_not_found');

  const [brand] = await executor
    .select()
    .from(brands)
    .where(eq(brands.id, product.brandId))
    .limit(1);
  const category = product.categoryId
    ? (
        await executor
          .select()
          .from(categories)
          .where(eq(categories.id, product.categoryId))
          .limit(1)
      )[0]
    : undefined;

  const noteRows = await executor
    .select({ note: notes, position: productNotes.position, prominence: productNotes.prominence })
    .from(productNotes)
    .innerJoin(notes, eq(notes.id, productNotes.noteId))
    .where(eq(productNotes.productId, id))
    .orderBy(asc(productNotes.position), asc(notes.slug));
  const tagRows = await executor
    .select({ tag: tags })
    .from(productTags)
    .innerJoin(tags, eq(tags.id, productTags.tagId))
    .where(eq(productTags.productId, id))
    .orderBy(asc(tags.slug));
  const imageRows = await executor
    .select({ media: mediaAssets, position: productImages.position })
    .from(productImages)
    .innerJoin(mediaAssets, eq(mediaAssets.id, productImages.mediaId))
    .where(eq(productImages.productId, id))
    .orderBy(asc(productImages.position));
  const variants = await executor
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, id))
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.sizeValue));

  return {
    product,
    brand,
    category,
    notes: noteRows,
    tags: tagRows.map((r) => r.tag),
    images: imageRows,
    variants,
    completion: await getProductCompletion(executor, id),
  };
}
