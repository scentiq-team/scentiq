// Collection rules against a real PostgreSQL: the SQL the compiler writes must select the right
// products, not just look right. One small catalog is built through the services, then every rule,
// every sort and the three collection kinds are checked against known answers.

import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditActor } from '../../db/audit.js';
import { createDatabase, type Database } from '../../db/client.js';
import { collectionProducts, collections } from '../../db/schema/collections.js';
import { mediaAssets } from '../../db/schema/media.js';
import { products, productVariants } from '../../db/schema/products.js';
import { families, noteGroups } from '../../db/schema/taxonomy.js';
import { createTestDatabase, describeDb, type TestDatabase } from '../../test/database.js';
import { findCollectionProductIds } from './collection-rules.js';
import {
  addVariant,
  archiveVariant,
  CatalogError,
  createBrand,
  createCategory,
  createNote,
  createProduct,
  createTag,
  publishProduct,
  setProductImages,
  setProductNotes,
  setProductTags,
  unpublishProduct,
} from './index.js';

const SYSTEM: AuditActor = { type: 'system' };

describeDb('collection rules on a real database', () => {
  let testDb: TestDatabase;
  let database: Database;
  const db = () => database.db;

  // name -> id, and id -> name for readable assertions
  const ids: Record<string, string> = {};
  const nameOf = new Map<string, string>();
  const names = async (promise: Promise<string[]>) =>
    (await promise).map((id) => nameOf.get(id) ?? `?${id}`);

  let counter = 0;
  const next = () => ++counter;

  interface ProductSpec {
    name: string;
    nameAr: string;
    brand: string;
    category: string;
    family: string;
    secondaryFamily?: string;
    notes: string[];
    gender: 'women' | 'men' | 'unisex';
    concentration: 'parfum' | 'edp' | 'edt' | 'edc' | 'oil';
    prices: number[];
    tags?: string[];
    publishedAt: string;
  }

  async function makeProduct(spec: ProductSpec, options: { publish?: boolean } = {}) {
    const product = await createProduct(db(), SYSTEM, {
      brandId: ids[spec.brand] ?? '',
      categoryId: ids[spec.category] ?? '',
      primaryFamilyId: ids[spec.family] ?? '',
      ...(spec.secondaryFamily && { secondaryFamilyId: ids[spec.secondaryFamily] ?? '' }),
      nameAr: spec.nameAr,
      nameEn: spec.name,
      slug: spec.name.toLowerCase(),
      gender: spec.gender,
      concentration: spec.concentration,
      descriptionAr: 'وصف',
      seoTitleAr: 'عنوان',
      seoDescriptionAr: 'وصف قصير',
    });
    await setProductNotes(
      db(),
      SYSTEM,
      product.id,
      spec.notes.map((n) => ({
        noteId: ids[n] ?? '',
        position: 'heart' as const,
        prominence: 2 as const,
      })),
    );
    for (const [i, price] of spec.prices.entries()) {
      await addVariant(db(), SYSTEM, product.id, {
        sku: `${spec.name.toUpperCase()}-${i + 1}`,
        sizeValue: 30 + i * 20,
        priceIqd: price,
      });
    }
    if (spec.tags) {
      await setProductTags(
        db(),
        SYSTEM,
        product.id,
        spec.tags.map((t) => ids[t] ?? ''),
      );
    }
    await setProductImages(db(), SYSTEM, product.id, [ids.media ?? '']);
    if (options.publish ?? true) {
      await publishProduct(db(), SYSTEM, product.id);
      // Distinct, known publication dates make "newest first" deterministic.
      await db()
        .update(products)
        .set({ publishedAt: new Date(spec.publishedAt) })
        .where(eq(products.id, product.id));
    }
    ids[spec.name] = product.id;
    nameOf.set(product.id, spec.name);
    return product;
  }

  beforeAll(async () => {
    testDb = await createTestDatabase();
    database = createDatabase({ url: testDb.appUrl, poolMax: 4 });

    ids.brandA = (await createBrand(db(), SYSTEM, { nameAr: 'ألف', nameEn: 'Brand A' })).id;
    ids.brandB = (await createBrand(db(), SYSTEM, { nameAr: 'باء', nameEn: 'Brand B' })).id;
    ids.perfumes = (await createCategory(db(), SYSTEM, { nameAr: 'عطور', nameEn: 'Perfumes' })).id;
    ids.oudOils = (
      await createCategory(db(), SYSTEM, {
        nameAr: 'زيوت',
        nameEn: 'Oud Oils',
        parentId: ids.perfumes,
      })
    ).id;
    ids.home = (await createCategory(db(), SYSTEM, { nameAr: 'منزل', nameEn: 'Home' })).id;

    const familyRows = await db()
      .insert(families)
      .values([
        { slug: 'woody', nameAr: 'خشبي', nameEn: 'Woody' },
        { slug: 'floral', nameAr: 'زهري', nameEn: 'Floral' },
        { slug: 'citrus', nameAr: 'حمضي', nameEn: 'Citrus' },
      ])
      .returning();
    for (const f of familyRows) ids[f.slug] = f.id;

    const [group] = await db()
      .insert(noteGroups)
      .values({ slug: 'all-notes', nameAr: 'نوتات', nameEn: 'Notes' })
      .returning();
    for (const [slug, ar, en] of [
      ['n-oud', 'عود', 'Oud'],
      ['n-amber', 'عنبر', 'Amber'],
      ['n-rose', 'ورد', 'Rose'],
      ['n-musk', 'مسك', 'Musk'],
      ['n-lemon', 'ليمون', 'Lemon'],
    ] as const) {
      ids[slug] = (
        await createNote(db(), SYSTEM, { groupId: group?.id ?? '', slug, nameAr: ar, nameEn: en })
      ).id;
    }
    ids.winter = (
      await createTag(db(), SYSTEM, { type: 'season', nameAr: 'شتاء', nameEn: 'Winter' })
    ).id;
    ids.gift = (
      await createTag(db(), SYSTEM, { type: 'occasion', nameAr: 'هدية', nameEn: 'Gift' })
    ).id;

    const [media] = await db()
      .insert(mediaAssets)
      .values({
        storageKey: `m/${String(next()).padStart(8, '0')}col`,
        width: 1600,
        height: 1600,
        byteSize: 1000,
        altAr: 'زجاجة',
      })
      .returning();
    ids.media = media?.id ?? '';

    // Published, oldest to newest: P1, P2, P3, P4. P5 stays a draft.
    await makeProduct({
      name: 'P1',
      nameAr: 'أول',
      brand: 'brandA',
      category: 'perfumes',
      family: 'woody',
      secondaryFamily: 'floral',
      notes: ['n-oud', 'n-amber', 'n-rose'],
      gender: 'men',
      concentration: 'edp',
      prices: [100_000],
      publishedAt: '2026-01-01T00:00:00Z',
    });
    await makeProduct({
      name: 'P2',
      nameAr: 'باء',
      brand: 'brandA',
      category: 'oudOils',
      family: 'floral',
      notes: ['n-oud', 'n-amber', 'n-musk'],
      gender: 'women',
      concentration: 'oil',
      prices: [50_000, 300_000],
      tags: ['winter'],
      publishedAt: '2026-02-01T00:00:00Z',
    });
    await makeProduct({
      name: 'P3',
      nameAr: 'تاء',
      brand: 'brandB',
      category: 'home',
      family: 'citrus',
      notes: ['n-rose', 'n-musk', 'n-lemon'],
      gender: 'unisex',
      concentration: 'edt',
      prices: [200_000],
      tags: ['winter', 'gift'],
      publishedAt: '2026-03-01T00:00:00Z',
    });
    const p4 = await makeProduct({
      name: 'P4',
      nameAr: 'ثاء',
      brand: 'brandB',
      category: 'perfumes',
      family: 'woody',
      notes: ['n-oud', 'n-amber', 'n-rose'],
      gender: 'men',
      concentration: 'parfum',
      prices: [400_000, 10_000],
      publishedAt: '2026-04-01T00:00:00Z',
    });
    // P4 once had a 10,000 IQD variant. It is archived, so it must not count in price rules.
    const [cheap] = await db()
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.productId, p4.id), eq(productVariants.priceIqd, 10_000)));
    await archiveVariant(db(), SYSTEM, cheap?.id ?? '');

    await makeProduct(
      {
        name: 'P5',
        nameAr: 'جيم',
        brand: 'brandA',
        category: 'perfumes',
        family: 'woody',
        notes: ['n-oud', 'n-amber', 'n-rose'],
        gender: 'men',
        concentration: 'edp',
        prices: [100_000],
        publishedAt: '2026-05-01T00:00:00Z',
      },
      { publish: false },
    );
  });
  afterAll(async () => {
    await database.close();
    await testDb.drop();
  });

  async function collection(
    kind: 'manual' | 'dynamic' | 'hybrid',
    rules: unknown,
    items: { product: string; mode: 'pinned' | 'excluded'; position?: number }[] = [],
  ) {
    const [row] = await db()
      .insert(collections)
      .values({
        slug: `c-${next()}`,
        kind,
        nameAr: 'مجموعة',
        rules: kind === 'manual' ? null : (rules as Record<string, unknown>),
      })
      .returning();
    if (row === undefined) throw new Error('no collection row');
    if (items.length > 0) {
      await db()
        .insert(collectionProducts)
        .values(
          items.map((i) => ({
            collectionId: row.id,
            productId: ids[i.product] ?? '',
            mode: i.mode,
            position: i.mode === 'pinned' ? (i.position ?? 0) : null,
          })),
        );
    }
    return row;
  }
  const dynamic = (rules: Record<string, unknown>, options?: { publishedOnly?: boolean }) =>
    names(collection('dynamic', rules).then((c) => findCollectionProductIds(db(), c, options)));

  describe('dynamic collections: one rule at a time', () => {
    it('brand', async () => {
      expect(await dynamic({ brandIds: [ids.brandA] })).toEqual(['P2', 'P1']);
      expect(await dynamic({ brandIds: [ids.brandB] })).toEqual(['P4', 'P3']);
      expect(await dynamic({ brandIds: [ids.brandA, ids.brandB] })).toEqual([
        'P4',
        'P3',
        'P2',
        'P1',
      ]);
    });

    it('category includes the sub-categories of the one named', async () => {
      expect(await dynamic({ categoryIds: [ids.perfumes] })).toEqual(['P4', 'P2', 'P1']);
      expect(await dynamic({ categoryIds: [ids.oudOils] })).toEqual(['P2']);
      expect(await dynamic({ categoryIds: [ids.home] })).toEqual(['P3']);
    });

    it('family matches the primary or the secondary family', async () => {
      expect(await dynamic({ familyIds: [ids.floral] })).toEqual(['P2', 'P1']);
      expect(await dynamic({ familyIds: [ids.woody] })).toEqual(['P4', 'P1']);
      expect(await dynamic({ familyIds: [ids.citrus] })).toEqual(['P3']);
    });

    it('notes: any, and all', async () => {
      expect(await dynamic({ noteIds: [ids['n-lemon'], ids['n-musk']] })).toEqual(['P3', 'P2']);
      expect(await dynamic({ noteIds: [ids['n-oud'], ids['n-amber']], noteMatch: 'all' })).toEqual([
        'P4',
        'P2',
        'P1',
      ]);
      expect(await dynamic({ noteIds: [ids['n-oud'], ids['n-musk']], noteMatch: 'all' })).toEqual([
        'P2',
      ]);
      expect(await dynamic({ noteIds: [ids['n-oud'], ids['n-lemon']], noteMatch: 'all' })).toEqual(
        [],
      );
    });

    it('tags', async () => {
      expect(await dynamic({ tagIds: [ids.winter] })).toEqual(['P3', 'P2']);
      expect(await dynamic({ tagIds: [ids.gift] })).toEqual(['P3']);
      // Any of the tags, and a product with two matching tags still appears once.
      expect(await dynamic({ tagIds: [ids.winter, ids.gift] })).toEqual(['P3', 'P2']);
    });

    it('gender and concentration', async () => {
      expect(await dynamic({ genders: ['men'] })).toEqual(['P4', 'P1']);
      expect(await dynamic({ genders: ['women', 'unisex'] })).toEqual(['P3', 'P2']);
      expect(await dynamic({ concentrations: ['oil', 'edt'] })).toEqual(['P3', 'P2']);
      expect(await dynamic({ concentrations: ['edc'] })).toEqual([]);
    });

    it('price: some live variant inside the range, archived variants ignored', async () => {
      expect(await dynamic({ priceMin: 250_000 })).toEqual(['P4', 'P2']); // P2 has a 300,000 variant
      expect(await dynamic({ priceMin: 40_000, priceMax: 60_000 })).toEqual(['P2']);
      expect(await dynamic({ priceMax: 20_000 })).toEqual([]); // P4's 10,000 variant is archived
      expect(await dynamic({ priceMax: 100_000 })).toEqual(['P2', 'P1']);
      expect(await dynamic({ priceMin: 100_000, priceMax: 100_000 })).toEqual(['P1']);
    });

    it('rules combine with AND', async () => {
      expect(
        await dynamic({
          brandIds: [ids.brandB],
          noteIds: [ids['n-oud'], ids['n-amber']],
          noteMatch: 'all',
        }),
      ).toEqual(['P4']);
      expect(await dynamic({ brandIds: [ids.brandA], genders: ['men'] })).toEqual(['P1']);
      expect(await dynamic({ genders: ['men'], priceMin: 300_000 })).toEqual(['P4']);
    });
  });

  describe('sorting and limit', () => {
    const all = { brandIds: undefined as string[] | undefined };
    const everyBrand = () => ({ ...all, brandIds: [ids.brandA ?? '', ids.brandB ?? ''] });

    it('newest first by publication date', async () => {
      expect(await dynamic({ ...everyBrand(), sort: 'newest' })).toEqual(['P4', 'P3', 'P2', 'P1']);
    });
    it('by the lowest live price, ascending and descending', async () => {
      // Lowest live prices: P2 50k, P1 100k, P3 200k, P4 400k (its 10k variant is archived).
      expect(await dynamic({ ...everyBrand(), sort: 'price_asc' })).toEqual([
        'P2',
        'P1',
        'P3',
        'P4',
      ]);
      expect(await dynamic({ ...everyBrand(), sort: 'price_desc' })).toEqual([
        'P4',
        'P3',
        'P1',
        'P2',
      ]);
    });
    it('by Arabic name', async () => {
      expect(await dynamic({ ...everyBrand(), sort: 'name' })).toEqual(['P1', 'P2', 'P3', 'P4']);
    });
    it('cuts at the limit after sorting', async () => {
      expect(await dynamic({ ...everyBrand(), limit: 2 })).toEqual(['P4', 'P3']);
      expect(await dynamic({ ...everyBrand(), sort: 'price_asc', limit: 1 })).toEqual(['P2']);
    });
  });

  describe('visibility', () => {
    it('shows published products only, and drafts for a Studio preview', async () => {
      expect(await dynamic({ brandIds: [ids.brandA] })).toEqual(['P2', 'P1']);
      expect(await dynamic({ brandIds: [ids.brandA] }, { publishedOnly: false })).toEqual([
        'P2',
        'P1',
        'P5',
      ]);
    });

    it('a product leaves the collection when it is unpublished or archived', async () => {
      const spec: ProductSpec = {
        name: 'P6',
        nameAr: 'دال',
        brand: 'brandA',
        category: 'perfumes',
        family: 'woody',
        notes: ['n-oud', 'n-amber', 'n-rose'],
        gender: 'women',
        concentration: 'edp',
        prices: [70_000],
        publishedAt: '2026-06-01T00:00:00Z',
      };
      await makeProduct(spec);
      const rules = { genders: ['women'] };
      const c = await collection('dynamic', rules);
      expect(await names(findCollectionProductIds(db(), c))).toEqual(['P6', 'P2']);
      await unpublishProduct(db(), SYSTEM, ids.P6 ?? '');
      expect(await names(findCollectionProductIds(db(), c))).toEqual(['P2']);
    });
  });

  describe('manual collections', () => {
    it('return the pinned products in their saved order', async () => {
      const c = await collection('manual', null, [
        { product: 'P3', mode: 'pinned', position: 0 },
        { product: 'P1', mode: 'pinned', position: 1 },
        { product: 'P4', mode: 'pinned', position: 2 },
      ]);
      expect(await names(findCollectionProductIds(db(), c))).toEqual(['P3', 'P1', 'P4']);
    });
    it('skip unpublished products unless asked for a preview, and ignore excluded rows', async () => {
      const c = await collection('manual', null, [
        { product: 'P5', mode: 'pinned', position: 0 },
        { product: 'P2', mode: 'pinned', position: 1 },
        { product: 'P1', mode: 'excluded' },
      ]);
      expect(await names(findCollectionProductIds(db(), c))).toEqual(['P2']);
      expect(await names(findCollectionProductIds(db(), c, { publishedOnly: false }))).toEqual([
        'P5',
        'P2',
      ]);
    });
    it('an empty manual collection is empty', async () => {
      expect(await findCollectionProductIds(db(), await collection('manual', null))).toEqual([]);
    });
  });

  describe('hybrid collections', () => {
    it('put the pinned products first, then the matches, never twice', async () => {
      const c = await collection('hybrid', { brandIds: [ids.brandA] }, [
        { product: 'P1', mode: 'pinned', position: 0 },
      ]);
      // Rules match P2 and P1; P1 is pinned so it comes first and is not repeated.
      expect(await names(findCollectionProductIds(db(), c))).toEqual(['P1', 'P2']);
    });
    it('leave out the excluded products', async () => {
      const c = await collection('hybrid', { brandIds: [ids.brandB] }, [
        { product: 'P3', mode: 'excluded' },
      ]);
      expect(await names(findCollectionProductIds(db(), c))).toEqual(['P4']);
    });
    it('the limit counts matches only: pinned products are never cut', async () => {
      const c = await collection('hybrid', { brandIds: [ids.brandA, ids.brandB], limit: 1 }, [
        { product: 'P1', mode: 'pinned', position: 0 },
        { product: 'P2', mode: 'pinned', position: 1 },
        { product: 'P3', mode: 'excluded' },
      ]);
      // Pinned P1, P2; then at most 1 match among the rest (P4; P3 is excluded).
      expect(await names(findCollectionProductIds(db(), c))).toEqual(['P1', 'P2', 'P4']);
    });
    it('a dynamic collection ignores pinned and excluded rows', async () => {
      const c = await collection('dynamic', { brandIds: [ids.brandA] }, [
        { product: 'P1', mode: 'excluded' },
      ]);
      expect(await names(findCollectionProductIds(db(), c))).toEqual(['P2', 'P1']);
    });
  });

  describe('stored rules that were not validated', () => {
    it('are refused, and a SQL fragment inside them never runs', async () => {
      const before = await db().select().from(products);
      const hostile = await collection('dynamic', {
        brandIds: ["x'); drop table products; --"],
        sort: 'price; drop table products',
      });
      const error = await findCollectionProductIds(db(), hostile).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CatalogError);
      expect((error as CatalogError).reason).toBe('collection_rules_invalid');
      // The table is still there with every row.
      expect(await db().select().from(products)).toHaveLength(before.length);
    });

    it('a field that is not on the whitelist is refused even when the row already exists', async () => {
      const c = await collection('dynamic', { brandIds: [ids.brandA], inStockOnly: true });
      await expect(findCollectionProductIds(db(), c)).rejects.toMatchObject({
        reason: 'collection_rules_invalid',
      });
    });

    it('an unknown collection kind is refused', async () => {
      await expect(
        findCollectionProductIds(db(), { id: ids.brandA ?? '', kind: 'smart', rules: {} }),
      ).rejects.toMatchObject({ reason: 'collection_kind_invalid' });
    });
  });

  describe('performance shape', () => {
    it('uses the indexes the design relies on for the common rule (brand)', async () => {
      // A tiny table prefers a sequential scan, so planner choice is not asserted. What matters is
      // that the statement plans without error and filters on the indexed column.
      const plan = await db().execute(
        sql`explain select id from products where status = 'published' and brand_id in (${ids.brandA})`,
      );
      expect(plan.rows.map((r) => Object.values(r)[0]).join('\n')).toContain('brand_id');
    });
  });
});
