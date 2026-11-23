// The completion score of a stored product (ADR-0012). The pure rules live in @scentiq/shared; this
// file only reads the counts they need. A test publishes a product that passes every required check
// and one that misses each of them, so the score and the database gate can never drift apart.

import {
  computeProductCompletion,
  type ProductCompletion,
  type ProductCompletionInput,
} from '@scentiq/shared';
import { and, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import { mediaAssets } from '../../db/schema/media.js';
import {
  productImages,
  productNotes,
  products,
  productTags,
  productVariants,
} from '../../db/schema/products.js';
import { CatalogError } from './errors.js';

export async function loadCompletionInput(
  executor: DbExecutor,
  productId: string,
): Promise<{ input: ProductCompletionInput; status: string }> {
  const [product] = await executor
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (product === undefined) throw new CatalogError('not_found', 'product_not_found');

  // One query after another: inside a transaction there is a single connection, and the driver
  // deprecates sending a second query while the first is still running.
  const [notesRow] = await executor
    .select({ n: count() })
    .from(productNotes)
    .where(eq(productNotes.productId, productId));
  const [variantsRow] = await executor
    .select({ n: count() })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), isNull(productVariants.archivedAt)));
  const [imagesRow] = await executor
    .select({ n: count() })
    .from(productImages)
    .where(eq(productImages.productId, productId));
  const [altRow] = await executor
    .select({ n: count() })
    .from(productImages)
    .innerJoin(mediaAssets, eq(mediaAssets.id, productImages.mediaId))
    .where(and(eq(productImages.productId, productId), isNotNull(mediaAssets.altAr)));
  const [tagsRow] = await executor
    .select({ n: count() })
    .from(productTags)
    .where(eq(productTags.productId, productId));

  return {
    status: product.status,
    input: {
      nameAr: product.nameAr,
      nameEn: product.nameEn,
      brandId: product.brandId,
      categoryId: product.categoryId,
      primaryFamilyId: product.primaryFamilyId,
      descriptionAr: product.descriptionAr,
      descriptionEn: product.descriptionEn,
      seoTitleAr: product.seoTitleAr,
      seoDescriptionAr: product.seoDescriptionAr,
      concentration: product.concentration,
      intensity: product.intensity,
      noteCount: notesRow?.n ?? 0,
      liveVariantCount: variantsRow?.n ?? 0,
      imageCount: imagesRow?.n ?? 0,
      imagesWithAltCount: altRow?.n ?? 0,
      tagCount: tagsRow?.n ?? 0,
    },
  };
}

export async function getProductCompletion(
  executor: DbExecutor,
  productId: string,
): Promise<ProductCompletion> {
  const { input } = await loadCompletionInput(executor, productId);
  return computeProductCompletion(input);
}

/**
 * Called after a change to a product or to something it owns (notes, variants, images, alt text).
 * A published product must keep every required piece: if the change would leave it incomplete, this
 * throws and the caller's transaction rolls the change back. Drafts and archived products are free.
 */
export async function assertProductsStayValid(
  executor: DbExecutor,
  productIds: readonly string[],
): Promise<void> {
  if (productIds.length === 0) return;
  const published = await executor
    .select({ id: products.id })
    .from(products)
    .where(and(inArray(products.id, [...new Set(productIds)]), eq(products.status, 'published')));
  for (const { id } of published) {
    const completion = await getProductCompletion(executor, id);
    if (!completion.canPublish) {
      throw new CatalogError('not_publishable', 'would_unpublish', {
        productId: id,
        missing: completion.missingRequired,
      });
    }
  }
}
