// Putting processed images on disk and on the books (ADR-0009): files first, then one transaction
// with the database rows and the audit entry. If anything fails, the files already written are
// removed, so a failed upload leaves nothing behind. A crash between the two steps (the process
// dies, not an error) can leave files without rows; a sweep for those belongs with the deployment
// phase, and they are harmless until then (random keys, never served).

import { eq } from 'drizzle-orm';
import type { AuditActor } from '../../db/audit.js';
import { recordAudit } from '../../db/audit.js';
import type { Db, DbExecutor } from '../../db/client.js';
import { isStillReferenced } from '../../db/errors.js';
import {
  type MediaAssetRow,
  type MediaVariantRow,
  mediaAssets,
  mediaVariants,
} from '../../db/schema/media.js';
import { CatalogError, guarded } from '../catalog/errors.js';
import { inTransaction } from '../catalog/transaction.js';
import { type ProcessedImage, processImage, sanitizeLabel } from './process.js';
import { type MediaStorage, newStorageKey } from './storage.js';

export interface StoredMedia {
  asset: MediaAssetRow;
  variants: MediaVariantRow[];
}

export interface MediaLabels {
  /** The uploaded file name. Sanitized, for display in Studio only. */
  originalLabel?: string | null;
  altAr?: string | null;
  altEn?: string | null;
}

/** The key of one variant: the asset's prefix and its width, for example `m/3fa85f64…-960`. */
export const variantKey = (prefix: string, width: number): string => `${prefix}-${width}`;

const emptyToNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value;

/** Removes files, ignoring failures: this runs while another error is already being thrown. */
async function removeFiles(storage: MediaStorage, keys: readonly string[]): Promise<void> {
  await Promise.allSettled(keys.map((key) => storage.delete(key)));
}

export async function storeProcessedImage(
  executor: DbExecutor,
  storage: MediaStorage,
  actor: AuditActor,
  image: ProcessedImage,
  labels: MediaLabels = {},
): Promise<StoredMedia> {
  const prefix = newStorageKey();
  const written: string[] = [];
  try {
    for (const variant of image.variants) {
      const key = variantKey(prefix, variant.width);
      await storage.put(key, variant.bytes, 'image/webp');
      written.push(key);
    }

    return await guarded(() =>
      inTransaction(executor, async (tx) => {
        const byteSize = image.variants.reduce((sum, v) => sum + v.bytes.byteLength, 0);
        const [asset] = await tx
          .insert(mediaAssets)
          .values({
            storageKey: prefix,
            originalLabel: sanitizeLabel(labels.originalLabel),
            width: image.width,
            height: image.height,
            byteSize,
            dominantColor: image.dominantColor,
            altAr: emptyToNull(labels.altAr),
            altEn: emptyToNull(labels.altEn),
          })
          .returning();
        if (asset === undefined) throw new Error('insert returned no row');

        const variants = await tx
          .insert(mediaVariants)
          .values(
            image.variants.map((v) => ({
              mediaId: asset.id,
              width: v.width,
              storageKey: variantKey(prefix, v.width),
              byteSize: v.bytes.byteLength,
            })),
          )
          .returning();

        await recordAudit(tx, {
          actor,
          action: 'media.uploaded',
          entity: { type: 'media', id: asset.id },
          details: {
            width: image.width,
            height: image.height,
            byteSize,
            variants: image.variants.map((v) => v.width),
            sourceType: image.sourceType,
          },
        });
        return { asset, variants };
      }),
    );
  } catch (error) {
    await removeFiles(storage, written);
    throw error;
  }
}

export interface UploadInput extends MediaLabels {
  bytes: Uint8Array;
}

/** The whole upload: check, convert, store, record. Throws `MediaError` for a refused file. */
export async function processAndStoreImage(
  executor: DbExecutor,
  storage: MediaStorage,
  actor: AuditActor,
  upload: UploadInput,
): Promise<StoredMedia> {
  const image = await processImage(upload.bytes);
  return storeProcessedImage(executor, storage, actor, image, upload);
}

/**
 * Deletes an image and its files. Refused while a product, brand or collection still uses it.
 * Takes the pool, not a transaction: the files are removed after the commit, and they must not go
 * if a surrounding transaction later rolls back.
 */
export async function deleteMediaAsset(
  db: Db,
  storage: MediaStorage,
  actor: AuditActor,
  mediaId: string,
): Promise<void> {
  const keys = await guarded(() =>
    inTransaction(db, async (tx) => {
      const [asset] = await tx
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(eq(mediaAssets.id, mediaId))
        .for('update')
        .limit(1);
      if (asset === undefined) throw new CatalogError('not_found', 'media_not_found');

      const variants = await tx
        .select({ storageKey: mediaVariants.storageKey })
        .from(mediaVariants)
        .where(eq(mediaVariants.mediaId, mediaId));

      try {
        await tx.delete(mediaAssets).where(eq(mediaAssets.id, mediaId));
      } catch (error) {
        if (isStillReferenced(error)) {
          throw new CatalogError('conflict', 'media_in_use', {}, { cause: error });
        }
        throw error;
      }
      await recordAudit(tx, {
        actor,
        action: 'media.deleted',
        entity: { type: 'media', id: mediaId },
        details: { variants: variants.length },
      });
      return variants.map((v) => v.storageKey);
    }),
  );
  await removeFiles(storage, keys);
}
