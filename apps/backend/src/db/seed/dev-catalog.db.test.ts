// `seed:dev` against a real PostgreSQL. What is proven: it builds a believable catalog through the
// real services, every row it inserts (in any table) is recorded as sample data, the production
// gate sees it, it refuses to run in production and test, it is safe to run twice, and the
// placeholder images went through the real media pipeline.

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findCollectionProductIds, getProductCompletion } from '../../modules/catalog/index.js';
import { LocalDiskStorage } from '../../modules/media/storage.js';
import { createTestDatabase, describeDb, type TestDatabase } from '../../test/database.js';
import { createDatabase, type Database } from '../client.js';
import { countSampleRows } from '../sample-data-gate.js';
import { mediaAssets, mediaVariants } from '../schema/media.js';
import { productImages, productNotes, products, productVariants } from '../schema/products.js';
import { sampleDataRegistry } from '../schema/sample-data.js';
import { brands, families } from '../schema/taxonomy.js';
import { DEV_BRANDS, DEV_PRODUCTS } from './data/dev-data.js';
import { devCatalog } from './dev-catalog.js';
import { referenceCatalog } from './reference-catalog.js';
import { runSeeds, SeedRefusedError } from './runner.js';

describeDb('seed:dev (catalog)', () => {
  let testDb: TestDatabase;
  let database: Database;
  let root: string;
  let storage: LocalDiskStorage;
  const db = () => database.db;

  const seedDev = (appEnv: 'development' | 'staging' | 'production' | 'test' = 'development') =>
    runSeeds({ db: db(), level: 'dev', appEnv, seeders: [devCatalog], mediaStorage: storage });

  /** Row counts of every ordinary table in `public`, counted independently of the tracker. */
  async function tableCounts(): Promise<Record<string, number>> {
    const list = await db().execute<{ table_name: string }>(
      sql`select table_name::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`,
    );
    const counts: Record<string, number> = {};
    for (const { table_name } of list.rows) {
      const result = await db().execute<{ n: string }>(
        sql`select count(*)::text as n from ${sql.identifier(table_name)}`,
      );
      counts[table_name] = Number(result.rows[0]?.n);
    }
    return counts;
  }

  let before: Record<string, number>;
  let after: Record<string, number>;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    database = createDatabase({ url: testDb.appUrl, poolMax: 4 });
    root = await mkdtemp(join(tmpdir(), 'scentiq-devseed-'));
    storage = new LocalDiskStorage(root);

    await runSeeds({
      db: db(),
      level: 'reference',
      appEnv: 'development',
      seeders: [referenceCatalog],
    });
    before = await tableCounts();
    await seedDev();
    after = await tableCounts();
  }, 120_000);
  afterAll(async () => {
    await database.close();
    await testDb.drop();
    await rm(root, { recursive: true, force: true });
  });

  it('builds the brands and products from the data file, in the states it describes', async () => {
    expect(
      await db()
        .select()
        .from(brands)
        .where(
          inArray(
            brands.slug,
            DEV_BRANDS.map((b) => b.slug),
          ),
        ),
    ).toHaveLength(DEV_BRANDS.length);
    const rows = await db()
      .select({ nameEn: products.nameEn, status: products.status })
      .from(products);
    expect(rows).toHaveLength(DEV_PRODUCTS.length);
    for (const wanted of DEV_PRODUCTS) {
      expect(rows.find((row) => row.nameEn === wanted.nameEn)?.status, wanted.nameEn).toBe(
        wanted.status,
      );
    }
    expect(DEV_PRODUCTS.length).toBeGreaterThanOrEqual(18);
    expect(DEV_PRODUCTS.length).toBeLessThanOrEqual(24);
  });

  it('REGISTERS EVERY ROW: for every table, the registry holds exactly the rows the seed added', async () => {
    const registered = await db()
      .select({ table: sampleDataRegistry.tableName, n: sql<number>`count(*)::int` })
      .from(sampleDataRegistry)
      .groupBy(sampleDataRegistry.tableName);
    const registeredBy = Object.fromEntries(registered.map((r) => [r.table, r.n]));

    for (const [table, count] of Object.entries(after)) {
      if (table === 'sample_data_registry') continue;
      const added = count - (before[table] ?? 0);
      expect(registeredBy[table] ?? 0, `rows added to ${table}`).toBe(added);
    }
    // And nothing was registered for a table that gained no rows.
    for (const table of Object.keys(registeredBy)) expect(after[table]).toBeDefined();
    // The seed really did reach the tables it should.
    for (const table of [
      'brands',
      'products',
      'product_variants',
      'media_assets',
      'media_variants',
      'audit_logs',
      'product_notes',
      'product_tags',
      'product_images',
    ]) {
      expect(registeredBy[table] ?? 0, table).toBeGreaterThan(0);
    }
  });

  it('does not register the reference vocabulary: it is real data', async () => {
    const registered = await db()
      .select({ table: sampleDataRegistry.tableName })
      .from(sampleDataRegistry);
    const tables = new Set(registered.map((r) => r.table));
    for (const table of [
      'categories',
      'families',
      'family_adjacency',
      'notes',
      'note_groups',
      'tags',
    ]) {
      expect(tables.has(table), table).toBe(false);
    }
  });

  it('the production gate sees it: db:assert-no-sample-data would fail', async () => {
    expect(await countSampleRows(db())).toBeGreaterThan(100);
  });

  it('refuses to run in production and in test, and writes nothing', async () => {
    const counts = await tableCounts();
    for (const appEnv of ['production', 'test'] as const) {
      await expect(seedDev(appEnv)).rejects.toThrow(SeedRefusedError);
    }
    expect(await tableCounts()).toEqual(counts);
  });

  it('running it again does nothing', async () => {
    const counts = await tableCounts();
    const logged: string[] = [];
    await runSeeds({
      db: db(),
      level: 'dev',
      appEnv: 'development',
      seeders: [devCatalog],
      mediaStorage: storage,
      log: (l) => logged.push(l),
    });
    expect(await tableCounts()).toEqual(counts);
    expect(logged.join('\n')).toMatch(/already there/);
  });

  it('refuses without a media storage instead of seeding half a catalog', async () => {
    const other = await createTestDatabase();
    const otherDb = createDatabase({ url: other.appUrl, poolMax: 2 });
    try {
      await expect(
        runSeeds({ db: otherDb.db, level: 'dev', appEnv: 'development', seeders: [devCatalog] }),
      ).rejects.toThrow(/media storage/);
      expect(await otherDb.db.select().from(brands)).toEqual([]);
    } finally {
      await otherDb.close();
      await other.drop();
    }
  });

  describe('the products', () => {
    it('every published product is complete; every draft is missing something, as described', async () => {
      const rows = await db().select().from(products);
      for (const wanted of DEV_PRODUCTS) {
        const row = rows.find((r) => r.nameEn === wanted.nameEn);
        if (row === undefined) throw new Error(`${wanted.nameEn} was not created`);
        const completion = await getProductCompletion(db(), row.id);
        if (wanted.status === 'draft') {
          expect(completion.canPublish, `${wanted.nameEn}: ${wanted.note}`).toBe(false);
        } else {
          expect(
            completion.canPublish,
            `${wanted.nameEn}: ${completion.missingRequired.join(', ')}`,
          ).toBe(true);
        }
      }
    });

    it('the three drafts are incomplete for the three reasons the data file gives', async () => {
      const missing = async (nameEn: string) => {
        const [row] = await db().select().from(products).where(eq(products.nameEn, nameEn));
        return (await getProductCompletion(db(), row?.id ?? '')).missingRequired;
      };
      expect(await missing('Green Orchard')).toEqual(['image_with_alt']);
      expect(await missing('Silk Iris')).toEqual(['notes']);
      expect(await missing('Lavender Home Mist')).toEqual(['variant']);
    });

    it('every product has at least three notes, in more than one position, unless it is the sample draft', async () => {
      const rows = await db().select().from(productNotes);
      for (const wanted of DEV_PRODUCTS.filter((p) => p.nameEn !== 'Silk Iris')) {
        const [product] = await db()
          .select()
          .from(products)
          .where(eq(products.nameEn, wanted.nameEn));
        const own = rows.filter((r) => r.productId === product?.id);
        expect(own.length, wanted.nameEn).toBeGreaterThanOrEqual(3);
        expect(new Set(own.map((r) => r.position)).size, wanted.nameEn).toBeGreaterThanOrEqual(2);
      }
    });

    it('says it is sample data, and makes no claim it cannot back up', async () => {
      const rows = await db().select().from(products);
      for (const row of rows) {
        expect(`${row.descriptionAr} ${row.descriptionEn}`, row.nameEn ?? '').toMatch(
          /تجريبي|sample/i,
        );
      }
      const variants = await db().select().from(productVariants);
      expect(variants.length).toBeGreaterThanOrEqual(DEV_PRODUCTS.length);
      // No "before" price (a fake sale) on any variant.
      for (const variant of variants) expect(variant.compareAtIqd).toBeNull();
      const stories = await db()
        .select({ storyAr: brands.storyAr, storyEn: brands.storyEn })
        .from(brands);
      for (const story of stories.filter((s) => s.storyAr?.includes('تجريبية'))) {
        expect(story.storyEn).toMatch(/sample/i);
      }
    });

    it('has a search document for every product, so search can find them', async () => {
      const rows = await db().select({ doc: products.searchDocument }).from(products);
      for (const row of rows) expect((row.doc ?? '').length).toBeGreaterThan(10);
    });

    it('prices are plausible whole dinars', async () => {
      const variants = await db().select().from(productVariants);
      for (const variant of variants) {
        expect(Number.isInteger(variant.priceIqd)).toBe(true);
        expect(variant.priceIqd).toBeGreaterThanOrEqual(15_000);
        expect(variant.priceIqd).toBeLessThanOrEqual(600_000);
      }
    });
  });

  describe('the placeholder images', () => {
    it('went through the media pipeline: WebP variants at the fixed widths, each file on disk', async () => {
      const variants = await db().select().from(mediaVariants);
      expect(variants.length).toBeGreaterThan(20);
      expect(new Set(variants.map((v) => v.width))).toEqual(new Set([480, 960, 1600]));
      const files = (await readdir(root, { recursive: true, withFileTypes: true })).filter((e) =>
        e.isFile(),
      );
      expect(files).toHaveLength(variants.length);
      for (const variant of variants) {
        const bytes = await storage.get(variant.storageKey);
        expect(bytes?.byteLength, variant.storageKey).toBe(variant.byteSize);
      }
    });

    it('every image has Arabic alt text, and says it is a placeholder', async () => {
      const assets = await db().select().from(mediaAssets);
      expect(assets.length).toBe(DEV_PRODUCTS.reduce((sum, p) => sum + p.images, 0));
      for (const asset of assets) {
        expect(asset.altAr).toMatch(/صورة توضيحية/);
        expect(asset.altEn).toMatch(/placeholder/i);
        expect(asset.dominantColor).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    it('products have the number of images the data file asks for, cover first', async () => {
      const links = await db().select().from(productImages);
      for (const wanted of DEV_PRODUCTS) {
        const [product] = await db()
          .select()
          .from(products)
          .where(eq(products.nameEn, wanted.nameEn));
        const own = links
          .filter((l) => l.productId === product?.id)
          .sort((a, b) => a.position - b.position);
        expect(own, wanted.nameEn).toHaveLength(wanted.images);
        expect(own.map((l) => l.position)).toEqual(own.map((_, i) => i));
      }
    });
  });

  it('the collection compiler works on the sample catalog: oud-family products, published only', async () => {
    const [oud] = await db().select().from(families).where(eq(families.slug, 'oud'));
    const ids = await findCollectionProductIds(db(), {
      id: '0198a4b2-0000-7000-8000-00000000c0de',
      kind: 'dynamic',
      rules: { familyIds: [oud?.id], limit: 50 },
    });
    const expected = DEV_PRODUCTS.filter(
      (p) => p.status === 'published' && (p.family === 'oud' || p.secondaryFamily === 'oud'),
    );
    expect(ids).toHaveLength(expected.length);
    const names = (await db().select().from(products))
      .filter((p) => ids.includes(p.id))
      .map((p) => p.nameEn);
    expect(names.sort()).toEqual(expected.map((p) => p.nameEn).sort());
  });
});
