// The media library against a real PostgreSQL (STEP 3): files and rows move together. A failed
// upload leaves no file and no row; deleting is refused while an image is in use; every change
// writes an audit entry. Runs as the least-privilege application role.

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditActor } from '../../db/audit.js';
import { createDatabase, type Database } from '../../db/client.js';
import { auditLogs } from '../../db/schema/audit.js';
import { mediaAssets, mediaVariants } from '../../db/schema/media.js';
import { createTestDatabase, describeDb, type TestDatabase } from '../../test/database.js';
import { jpeg, png } from '../../test/images.js';
import {
  CatalogError,
  createBrand,
  createCategory,
  createProduct,
  setProductImages,
} from '../catalog/index.js';
import { MediaError } from './errors.js';
import { processImage } from './process.js';
import {
  deleteMediaAsset,
  processAndStoreImage,
  storeProcessedImage,
  variantKey,
} from './register.js';
import { LocalDiskStorage, type MediaStorage } from './storage.js';

const SYSTEM: AuditActor = { type: 'system' };

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('The call was accepted, but it should have been refused.');
}

describeDb('media library with PostgreSQL', () => {
  let testDb: TestDatabase;
  let database: Database;
  let root: string;
  let storage: LocalDiskStorage;
  const db = () => database.db;

  const filesOnDisk = async (): Promise<string[]> =>
    (await readdir(root, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();

  beforeAll(async () => {
    testDb = await createTestDatabase();
    database = createDatabase({ url: testDb.appUrl, poolMax: 4 });
    root = await mkdtemp(join(tmpdir(), 'scentiq-media-'));
    storage = new LocalDiskStorage(root);
  });
  afterAll(async () => {
    await database.close();
    await testDb.drop();
    await rm(root, { recursive: true, force: true });
  });

  it('stores every variant as a file and as a row, and records who did it', async () => {
    const before = await filesOnDisk();
    const stored = await processAndStoreImage(db(), storage, SYSTEM, {
      bytes: await jpeg(2000, 1500, { exif: true }),
      originalLabel: '../../IMG_0001 قارورة.jpg',
      altAr: 'قارورة عطر',
      altEn: '',
    });

    expect(stored.variants.map((v) => v.width)).toEqual([480, 960, 1600]);
    expect(stored.asset).toMatchObject({
      width: 1600,
      height: 1200,
      originalLabel: 'IMG_0001 قارورة.jpg',
      altAr: 'قارورة عطر',
      altEn: null,
    });
    expect(stored.asset.dominantColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(stored.asset.byteSize).toBe(stored.variants.reduce((sum, v) => sum + v.byteSize, 0));

    // Every variant row names a file that exists and has the recorded size.
    for (const variant of stored.variants) {
      expect(variant.storageKey).toBe(variantKey(stored.asset.storageKey, variant.width));
      const bytes = await storage.get(variant.storageKey);
      expect(bytes?.byteLength).toBe(variant.byteSize);
    }
    expect((await filesOnDisk()).length - before.length).toBe(3);

    const [audit] = await db()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, stored.asset.id));
    expect(audit).toMatchObject({
      action: 'media.uploaded',
      actorType: 'system',
      entityType: 'media',
    });
    expect(audit?.details).toMatchObject({
      width: 1600,
      variants: [480, 960, 1600],
      sourceType: 'jpeg',
    });
  });

  it('a refused file touches nothing: no file, no row, no audit entry', async () => {
    const files = await filesOnDisk();
    const rows = await db().select().from(mediaAssets);
    const audits = await db().select().from(auditLogs);

    const error = await refusal(
      processAndStoreImage(db(), storage, SYSTEM, {
        bytes: new TextEncoder().encode('<svg></svg>'),
      }),
    );
    expect(error).toBeInstanceOf(MediaError);

    expect(await filesOnDisk()).toEqual(files);
    expect(await db().select().from(mediaAssets)).toHaveLength(rows.length);
    expect(await db().select().from(auditLogs)).toHaveLength(audits.length);
  });

  it('removes the files already written when a later file fails to store', async () => {
    const image = await processImage(await jpeg(2000, 1000));
    const files = await filesOnDisk();
    let puts = 0;
    const flaky: MediaStorage = {
      put: async (key, bytes, type) => {
        puts += 1;
        if (puts === 3) throw new Error('disk full');
        await storage.put(key, bytes, type);
      },
      get: (key) => storage.get(key),
      delete: (key) => storage.delete(key),
    };

    const rows = (await db().select().from(mediaAssets)).length;
    await expect(storeProcessedImage(db(), flaky, SYSTEM, image)).rejects.toThrow('disk full');
    expect(puts).toBe(3);
    expect(await filesOnDisk()).toEqual(files);
    expect(await db().select().from(mediaAssets)).toHaveLength(rows);
  });

  it('removes all the files when the database refuses the row, with the constraint as the reason', async () => {
    const image = await processImage(await png(1000, 1000));
    const files = await filesOnDisk();
    const rows = (await db().select().from(mediaAssets)).length;
    const variantRows = (await db().select().from(mediaVariants)).length;

    const error = await refusal(
      storeProcessedImage(db(), storage, SYSTEM, image, { altAr: 'ا'.repeat(301) }),
    );
    expect(error).toBeInstanceOf(CatalogError);
    expect((error as CatalogError).reason).toBe('media_assets_alt_ar_valid');

    expect(await filesOnDisk()).toEqual(files);
    expect(await db().select().from(mediaAssets)).toHaveLength(rows);
    expect(await db().select().from(mediaVariants)).toHaveLength(variantRows);
  });

  it('inside a surrounding transaction, a later failure rolls the rows back (files stay: documented)', async () => {
    const rowsBefore = (await db().select().from(mediaAssets)).length;
    const image = await processImage(await jpeg(800, 800));
    await expect(
      db().transaction(async (tx) => {
        await storeProcessedImage(tx, storage, SYSTEM, image);
        throw new Error('the caller failed afterwards');
      }),
    ).rejects.toThrow('the caller failed afterwards');
    expect(await db().select().from(mediaAssets)).toHaveLength(rowsBefore);
  });

  describe('deleting', () => {
    it('removes the rows and the files, and records it', async () => {
      const stored = await processAndStoreImage(db(), storage, SYSTEM, {
        bytes: await jpeg(1000, 1000),
      });
      const keys = stored.variants.map((v) => v.storageKey);
      for (const key of keys) expect(await storage.get(key)).toBeDefined();

      await deleteMediaAsset(db(), storage, SYSTEM, stored.asset.id);

      for (const key of keys) expect(await storage.get(key)).toBeUndefined();
      expect(
        await db().select().from(mediaAssets).where(eq(mediaAssets.id, stored.asset.id)),
      ).toEqual([]);
      expect(
        await db().select().from(mediaVariants).where(eq(mediaVariants.mediaId, stored.asset.id)),
      ).toEqual([]);
      const audits = await db()
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, stored.asset.id));
      expect(audits.map((a) => a.action).sort()).toEqual(['media.deleted', 'media.uploaded']);
    });

    it('is refused while a product uses the image, and nothing is lost', async () => {
      const stored = await processAndStoreImage(db(), storage, SYSTEM, {
        bytes: await jpeg(1000, 1000),
        altAr: 'صورة',
      });
      const brand = await createBrand(db(), SYSTEM, { nameAr: 'ديور', nameEn: 'Dior' });
      const category = await createCategory(db(), SYSTEM, { nameAr: 'عطور', nameEn: 'Perfumes' });
      const product = await createProduct(db(), SYSTEM, {
        brandId: brand.id,
        categoryId: category.id,
        nameAr: 'منتج',
        nameEn: 'Product',
      });
      await setProductImages(db(), SYSTEM, product.id, [stored.asset.id]);

      const error = await refusal(deleteMediaAsset(db(), storage, SYSTEM, stored.asset.id));
      expect(error).toBeInstanceOf(CatalogError);
      expect(error).toMatchObject({ kind: 'conflict', reason: 'media_in_use' });

      expect(
        await db().select().from(mediaAssets).where(eq(mediaAssets.id, stored.asset.id)),
      ).toHaveLength(1);
      for (const variant of stored.variants)
        expect(await storage.get(variant.storageKey)).toBeDefined();

      // Once the product lets go of it, it can be deleted.
      await setProductImages(db(), SYSTEM, product.id, []);
      await deleteMediaAsset(db(), storage, SYSTEM, stored.asset.id);
      expect(
        await db().select().from(mediaAssets).where(eq(mediaAssets.id, stored.asset.id)),
      ).toEqual([]);
    });

    it('an image that does not exist is not_found', async () => {
      const error = await refusal(
        deleteMediaAsset(db(), storage, SYSTEM, '0198a4b2-0000-7000-8000-00000000ffff'),
      );
      expect(error).toMatchObject({ kind: 'not_found', reason: 'media_not_found' });
    });
  });
});
