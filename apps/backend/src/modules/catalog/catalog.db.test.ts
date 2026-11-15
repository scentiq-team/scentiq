// The catalog services against a real PostgreSQL (STEP 3). They run as the least-privilege
// application role, like the real server. What is proven here:
//   - one transaction per change (search_document, redirects and audit row move together or not at all)
//   - a published product can never become incomplete, and the completion score agrees with the database
//   - slug changes leave working redirects, and a retired slug cannot be taken by someone else

import type { REQUIRED_COMPLETION_KEYS } from '@scentiq/shared';
import { and, eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditActor } from '../../db/audit.js';
import { createDatabase, type Database, type Tx } from '../../db/client.js';
import { auditLogs } from '../../db/schema/audit.js';
import { mediaAssets } from '../../db/schema/media.js';
import { products, productVariants } from '../../db/schema/products.js';
import { slugRedirects } from '../../db/schema/slugs.js';
import { families, noteGroups } from '../../db/schema/taxonomy.js';
import { createTestDatabase, describeDb, type TestDatabase } from '../../test/database.js';
import {
  addVariant,
  archiveProduct,
  archiveVariant,
  CatalogError,
  createBrand,
  createCategory,
  createNote,
  createProduct,
  createTag,
  findRedirectTarget,
  getProductCompletion,
  getProductDetail,
  inTransaction,
  publishProduct,
  renameTag,
  restoreProduct,
  setMediaAlt,
  setProductImages,
  setProductNotes,
  setProductTags,
  unpublishProduct,
  updateBrand,
  updateCategory,
  updateNote,
  updateProduct,
  updateVariant,
} from './index.js';

const SYSTEM: AuditActor = { type: 'system' };
const STAFF: AuditActor = { type: 'staff', id: '0198a4b2-0000-7000-8000-0000000000aa' };

/** What a failed call rejected with, as a CatalogError (the test fails if it was accepted). */
async function refusal(promise: Promise<unknown>): Promise<CatalogError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CatalogError);
    return error as CatalogError;
  }
  throw new Error('The call was accepted, but it should have been refused.');
}

type RequiredKey = (typeof REQUIRED_COMPLETION_KEYS)[number];

describeDb('catalog services', () => {
  let testDb: TestDatabase;
  let database: Database;
  let raw: pg.Pool;
  const db = () => database.db;
  let counter = 0;
  const next = () => ++counter;

  // shared fixtures
  let brandId: string;
  let categoryId: string;
  let familyId: string;
  let otherFamilyId: string;
  let groupId: string;
  let noteIds: string[];
  let mediaWithAlt: string;
  let mediaWithoutAlt: string;

  const media = async (altAr: string | null) => {
    const [row] = await db()
      .insert(mediaAssets)
      .values({
        storageKey: `m/${String(next()).padStart(8, '0')}svc`,
        width: 1600,
        height: 1600,
        byteSize: 1000,
        altAr,
      })
      .returning();
    if (row === undefined) throw new Error('no media row');
    return row.id;
  };

  beforeAll(async () => {
    testDb = await createTestDatabase();
    database = createDatabase({ url: testDb.appUrl, poolMax: 4 });
    raw = new pg.Pool({ connectionString: testDb.appUrl, max: 2 });

    brandId = (await createBrand(db(), SYSTEM, { nameAr: 'ديور', nameEn: 'Dior' })).id;
    categoryId = (await createCategory(db(), SYSTEM, { nameAr: 'عطور', nameEn: 'Perfumes' })).id;
    const familyRows = await db()
      .insert(families)
      .values([
        { slug: 'woody', nameAr: 'خشبي', nameEn: 'Woody' },
        { slug: 'floral', nameAr: 'زهري', nameEn: 'Floral' },
      ])
      .returning();
    familyId = familyRows[0]?.id ?? '';
    otherFamilyId = familyRows[1]?.id ?? '';
    const [group] = await db()
      .insert(noteGroups)
      .values({ slug: 'woods', nameAr: 'أخشاب', nameEn: 'Woods' })
      .returning();
    groupId = group?.id ?? '';
    noteIds = [];
    for (const [ar, en] of [
      ['عود', 'Oud'],
      ['عنبر', 'Amber'],
      ['ورد', 'Rose'],
      ['مسك', 'Musk'],
    ] as const) {
      noteIds.push((await createNote(db(), SYSTEM, { groupId, nameAr: ar, nameEn: en })).id);
    }
    mediaWithAlt = await media('زجاجة عطر');
    mediaWithoutAlt = await media(null);
  });
  afterAll(async () => {
    await raw.end();
    await database.close();
    await testDb.drop();
  });

  // ----- builders -----
  const threeNotes = () =>
    noteIds
      .slice(0, 3)
      .map((noteId) => ({ noteId, position: 'heart' as const, prominence: 2 as const }));

  /**
   * A product with everything a publish needs, except the piece named in `omit`. The two keys that
   * cannot be missing by construction (a name and a brand are NOT NULL) are not accepted.
   */
  async function buildProduct(omit?: Exclude<RequiredKey, 'name_ar' | 'brand'>) {
    const n = next();
    const product = await createProduct(db(), SYSTEM, {
      brandId,
      nameAr: `منتج ${n}`,
      nameEn: `Product ${n}`,
      ...(omit !== 'category' && { categoryId }),
      ...(omit !== 'primary_family' && { primaryFamilyId: familyId }),
      ...(omit !== 'description_ar' && { descriptionAr: 'وصف المنتج' }),
      ...(omit !== 'seo_title_ar' && { seoTitleAr: 'عنوان' }),
      ...(omit !== 'seo_description_ar' && { seoDescriptionAr: 'وصف قصير' }),
    });
    await setProductNotes(
      db(),
      SYSTEM,
      product.id,
      omit === 'notes' ? threeNotes().slice(0, 2) : threeNotes(),
    );
    if (omit !== 'variant') {
      await addVariant(db(), SYSTEM, product.id, {
        sku: `SKU-${n}`,
        sizeValue: 100,
        priceIqd: 150_000,
      });
    }
    await setProductImages(db(), SYSTEM, product.id, [
      omit === 'image_with_alt' ? mediaWithoutAlt : mediaWithAlt,
    ]);
    return product;
  }

  const auditOf = (action: string, entityId: string) =>
    db()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.action, action), eq(auditLogs.entityId, entityId)));

  const searchDocumentOf = async (productId: string) =>
    (await db().select().from(products).where(eq(products.id, productId)))[0]?.searchDocument ?? '';

  /**
   * Two staff members at the same time. `first` runs inside a transaction that stays open (its
   * change is not committed), `second` starts meanwhile on its own connection and is given until it
   * either finishes or is seen waiting for a lock. Then `first` commits and the outcome of `second`
   * is returned. A service that does not lock correctly lets `second` finish at once, on a database
   * that does not yet contain the change of `first`.
   */
  async function overlap(
    first: (tx: Tx) => Promise<unknown>,
    second: () => Promise<unknown>,
  ): Promise<PromiseSettledResult<unknown>> {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let changed: () => void = () => {};
    const firstChanged = new Promise<void>((resolve) => {
      changed = resolve;
    });
    const one = db().transaction(async (tx) => {
      await first(tx);
      changed();
      await held;
    });
    one.catch(() => changed()); // a failure of `first` must not leave the test waiting
    await firstChanged;

    let settled = false;
    const two = second().finally(() => {
      settled = true;
    });
    const outcome = Promise.allSettled([two]).then(([result]) => result);

    for (let tries = 0; tries < 100 && !settled; tries++) {
      const { rows } = await raw.query('select 1 from pg_locks where not granted');
      if (rows.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    release();
    await one;
    const result = await outcome;
    if (result === undefined) throw new Error('the second call never finished');
    return result;
  }

  // ----- brands, categories, notes, tags -----
  describe('brands', () => {
    it('builds the slug from the English name', async () => {
      const first = await createBrand(db(), SYSTEM, { nameAr: 'شانيل', nameEn: 'Chanel' });
      expect(first.slug).toBe('chanel');
      // The same English name in another case is refused by the unique name rule, so use a variant.
      const second = await createBrand(db(), SYSTEM, {
        nameAr: 'شانيل ٢',
        nameEn: 'CHANEL Paris',
        slug: undefined,
      });
      expect(second.slug).toBe('chanel-paris');
    });

    it('refuses a taken slug and a taken English name', async () => {
      await createBrand(db(), SYSTEM, { nameAr: 'غيرلان', nameEn: 'Guerlain', slug: 'guerlain' });
      expect(
        (
          await refusal(
            createBrand(db(), SYSTEM, { nameAr: 'غ', nameEn: 'Other', slug: 'guerlain' }),
          )
        ).reason,
      ).toBe('slug_taken');
      const byName = await refusal(
        createBrand(db(), SYSTEM, { nameAr: 'غ', nameEn: 'GUERLAIN', slug: 'guerlain-2' }),
      );
      expect(byName.kind).toBe('conflict');
      expect(byName.reason).toBe('brands_name_en_uq');
    });

    it('a rename refreshes the search document of its products, in the same transaction', async () => {
      const brand = await createBrand(db(), SYSTEM, { nameAr: 'توم فورد', nameEn: 'Tom Ford' });
      const product = await createProduct(db(), SYSTEM, {
        brandId: brand.id,
        nameAr: 'عود وود',
        nameEn: 'Oud Wood',
      });
      expect(await searchDocumentOf(product.id)).toContain('tom');
      await updateBrand(db(), SYSTEM, brand.id, { nameEn: 'T. Ford', nameAr: 'تو فورد' });
      const doc = await searchDocumentOf(product.id);
      expect(doc).not.toContain('tom');
      expect(doc.split(' ')).toEqual(expect.arrayContaining(['t', 'ford', 'تو', 'فورد']));
    });

    it('a slug change leaves a redirect that follows later renames', async () => {
      const brand = await createBrand(db(), SYSTEM, { nameAr: 'أرماني', nameEn: 'Armani' });
      await updateBrand(db(), SYSTEM, brand.id, { slug: 'giorgio-armani' });
      await updateBrand(db(), SYSTEM, brand.id, { slug: 'armani-beauty' });
      // Both old addresses resolve to the CURRENT slug: no chain.
      expect(await findRedirectTarget(db(), 'brand', 'armani')).toBe('armani-beauty');
      expect(await findRedirectTarget(db(), 'brand', 'giorgio-armani')).toBe('armani-beauty');
      expect(await findRedirectTarget(db(), 'brand', 'armani-beauty')).toBeUndefined();
      expect(await findRedirectTarget(db(), 'brand', 'never-used')).toBeUndefined();
    });

    it('another entity cannot take a retired slug, but its owner can take it back', async () => {
      const brand = await createBrand(db(), SYSTEM, { nameAr: 'فيرساتشي', nameEn: 'Versace' });
      await updateBrand(db(), SYSTEM, brand.id, { slug: 'versace-parfums' });
      const other = await createBrand(db(), SYSTEM, { nameAr: 'آخر', nameEn: 'Someone Else' });
      expect((await refusal(updateBrand(db(), SYSTEM, other.id, { slug: 'versace' }))).reason).toBe(
        'slug_reserved',
      );
      expect(
        (
          await refusal(
            createBrand(db(), SYSTEM, { nameAr: 'ن', nameEn: 'New One', slug: 'versace' }),
          )
        ).reason,
      ).toBe('slug_reserved');

      await updateBrand(db(), SYSTEM, brand.id, { slug: 'versace' });
      expect(await findRedirectTarget(db(), 'brand', 'versace')).toBeUndefined();
      // The slug the brand just left is now the redirect.
      expect(await findRedirectTarget(db(), 'brand', 'versace-parfums')).toBe('versace');
    });

    it('answers not_found for a brand that does not exist and ignores an empty patch', async () => {
      const missing = '0198a4b2-0000-7000-8000-00000000dead';
      expect((await refusal(updateBrand(db(), SYSTEM, missing, { nameEn: 'X' }))).kind).toBe(
        'not_found',
      );
      const brand = await createBrand(db(), SYSTEM, { nameAr: 'ب', nameEn: 'Empty Patch' });
      const before = await auditOf('brand.updated', brand.id);
      expect((await updateBrand(db(), SYSTEM, brand.id, {})).id).toBe(brand.id);
      expect(await auditOf('brand.updated', brand.id)).toHaveLength(before.length);
    });

    it('writes an audit row naming what changed', async () => {
      const brand = await createBrand(db(), STAFF, { nameAr: 'ك', nameEn: 'Audited Brand' });
      await updateBrand(db(), STAFF, brand.id, { storyAr: 'قصة', slug: 'audited' });
      const [created] = await auditOf('brand.created', brand.id);
      expect(created).toMatchObject({ actorType: 'staff', actorId: STAFF.id, entityType: 'brand' });
      const [updated] = await auditOf('brand.updated', brand.id);
      expect(updated?.details).toEqual({
        changed: expect.arrayContaining(['storyAr', 'slug']),
        slug: { from: 'audited-brand', to: 'audited' },
      });
    });
  });

  describe('categories', () => {
    it('allows two levels and refuses a third with a stable reason', async () => {
      const top = await createCategory(db(), SYSTEM, { nameAr: 'عود', nameEn: 'Oud Top' });
      const child = await createCategory(db(), SYSTEM, {
        nameAr: 'زيوت',
        nameEn: 'Oud Oils',
        parentId: top.id,
      });
      const tooDeep = await refusal(
        createCategory(db(), SYSTEM, { nameAr: 'ع', nameEn: 'Too Deep', parentId: child.id }),
      );
      expect(tooDeep.kind).toBe('invalid');
      expect(tooDeep.reason).toBe('categories_max_depth');
    });

    it('refuses a parent that does not exist', async () => {
      const error = await refusal(
        createCategory(db(), SYSTEM, {
          nameAr: 'ع',
          nameEn: 'Orphan',
          parentId: '0198a4b2-0000-7000-8000-00000000dead',
        }),
      );
      expect(error.reason).toBe('parent_category_not_found');
    });

    it('a rename refreshes the documents of its products and a slug change redirects', async () => {
      const category = await createCategory(db(), SYSTEM, { nameAr: 'بخور', nameEn: 'Incense' });
      const product = await createProduct(db(), SYSTEM, {
        brandId,
        categoryId: category.id,
        nameAr: 'بخور ملكي',
        nameEn: 'Royal Bakhoor',
      });
      expect(await searchDocumentOf(product.id)).toContain('incense');
      await updateCategory(db(), SYSTEM, category.id, {
        nameEn: 'Home Fragrance',
        slug: 'home-fragrance',
      });
      expect(await searchDocumentOf(product.id)).toContain('home');
      expect(await findRedirectTarget(db(), 'category', 'incense')).toBe('home-fragrance');
    });
  });

  describe('notes and tags', () => {
    it('aliases are searchable through the product, and changing them refreshes the document', async () => {
      const note = await createNote(db(), SYSTEM, {
        groupId,
        nameAr: 'صندل',
        nameEn: 'Sandalwood',
        aliases: ['santal'],
      });
      const product = await buildProduct();
      await setProductNotes(db(), SYSTEM, product.id, [
        ...threeNotes(),
        { noteId: note.id, position: 'base', prominence: 3 },
      ]);
      expect(await searchDocumentOf(product.id)).toContain('santal');

      await updateNote(db(), SYSTEM, note.id, { aliases: ['sandal'] });
      const doc = await searchDocumentOf(product.id);
      expect(doc).toContain('sandal');
      expect(doc).not.toContain('santal');
    });

    it('a note slug change redirects', async () => {
      const note = await createNote(db(), SYSTEM, { groupId, nameAr: 'فانيلا', nameEn: 'Vanilla' });
      await updateNote(db(), SYSTEM, note.id, { slug: 'vanilla-bean' });
      expect(await findRedirectTarget(db(), 'note', 'vanilla')).toBe('vanilla-bean');
    });

    it('tags are unique per type and a rename refreshes products', async () => {
      const tag = await createTag(db(), SYSTEM, {
        type: 'season',
        nameAr: 'شتاء',
        nameEn: 'Winter',
      });
      expect(tag.slug).toBe('winter');
      expect(
        (await refusal(createTag(db(), SYSTEM, { type: 'season', nameAr: 'ش', nameEn: 'Winter' })))
          .reason,
      ).toBe('tags_type_slug_uq');
      await createTag(db(), SYSTEM, { type: 'mood', nameAr: 'شتوي', nameEn: 'Winter' });

      const product = await buildProduct();
      await setProductTags(db(), SYSTEM, product.id, [tag.id]);
      expect(await searchDocumentOf(product.id)).toContain('شتاء');
      await renameTag(db(), SYSTEM, tag.id, { nameAr: 'برد', nameEn: 'Cold' });
      const doc = await searchDocumentOf(product.id);
      expect(doc).toContain('برد');
      expect(doc).not.toContain('شتاء');
    });
  });

  // ----- products: create and update -----
  describe('createProduct', () => {
    it('creates a draft with a slug, a search document and an audit row, all together', async () => {
      const product = await createProduct(db(), STAFF, {
        brandId,
        categoryId,
        primaryFamilyId: familyId,
        nameAr: 'عود ملكي',
        concentration: 'edp',
      });
      expect(product.status).toBe('draft');
      expect(product.publishedAt).toBeNull();
      expect(product.gender).toBe('unisex');
      // No English name: the slug comes from the Arabic one, through the known-word list.
      expect(product.slug).toBe('oud-royal');
      const tokens = (await searchDocumentOf(product.id)).split(' ');
      expect(tokens).toEqual(
        expect.arrayContaining([
          'عود',
          'ملكي',
          'ديور',
          'dior',
          'عطور',
          'perfumes',
          'خشبي',
          'woody',
        ]),
      );
      const [audit] = await auditOf('product.created', product.id);
      expect(audit).toMatchObject({ actorType: 'staff', entityType: 'product' });
    });

    it('numbers a slug that is already used', async () => {
      const a = await createProduct(db(), SYSTEM, { brandId, nameAr: 'x', nameEn: 'Same Name' });
      const b = await createProduct(db(), SYSTEM, { brandId, nameAr: 'x', nameEn: 'Same Name' });
      const c = await createProduct(db(), SYSTEM, { brandId, nameAr: 'x', nameEn: 'Same Name' });
      expect([a.slug, b.slug, c.slug]).toEqual(['same-name', 'same-name-2', 'same-name-3']);
    });

    it('falls back to "product" when the name gives no letters', async () => {
      const product = await createProduct(db(), SYSTEM, { brandId, nameAr: '!!!' });
      expect(product.slug).toMatch(/^product(-\d+)?$/);
    });

    it('refuses a missing or archived brand, a missing category and a missing family', async () => {
      const gone = '0198a4b2-0000-7000-8000-00000000dead';
      expect(
        (await refusal(createProduct(db(), SYSTEM, { brandId: gone, nameAr: 'ا' }))).reason,
      ).toBe('brand_not_found');
      expect(
        (await refusal(createProduct(db(), SYSTEM, { brandId, categoryId: gone, nameAr: 'ا' })))
          .reason,
      ).toBe('category_not_found');
      expect(
        (
          await refusal(
            createProduct(db(), SYSTEM, { brandId, primaryFamilyId: gone, nameAr: 'ا' }),
          )
        ).reason,
      ).toBe('family_not_found');

      const archived = await createBrand(db(), SYSTEM, {
        nameAr: 'مؤرشف',
        nameEn: 'Archived Brand',
      });
      await raw.query('update brands set archived_at = now() where id = $1', [archived.id]);
      expect(
        (await refusal(createProduct(db(), SYSTEM, { brandId: archived.id, nameAr: 'ا' }))).reason,
      ).toBe('brand_archived');
    });

    it('leaves nothing behind when it fails: no row, no slug, no audit row', async () => {
      const before = await db().select().from(products);
      const auditBefore = await db()
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'product.created'));
      await refusal(
        createProduct(db(), SYSTEM, {
          brandId,
          primaryFamilyId: '0198a4b2-0000-7000-8000-00000000dead',
          nameAr: 'ا',
        }),
      );
      expect(await db().select().from(products)).toHaveLength(before.length);
      expect(
        await db().select().from(auditLogs).where(eq(auditLogs.action, 'product.created')),
      ).toHaveLength(auditBefore.length);
    });

    it('rolls back with the caller when it runs inside a bigger transaction', async () => {
      const marker = `Atomic ${next()}`;
      await expect(
        inTransaction(db(), async (tx) => {
          await createProduct(tx, SYSTEM, { brandId, nameAr: 'ا', nameEn: marker });
          throw new Error('the caller fails after the service succeeded');
        }),
      ).rejects.toThrow(/caller fails/);
      const left = await db().select().from(products).where(eq(products.nameEn, marker));
      expect(left).toHaveLength(0);
    });
  });

  describe('updateProduct', () => {
    it('changes only the fields given, clears a field with null or blank, and audits the change', async () => {
      const product = await buildProduct();
      const updated = await updateProduct(db(), STAFF, product.id, {
        nameEn: 'Renamed',
        intensity: 4,
        descriptionAr: 'وصف جديد',
      });
      expect(updated).toMatchObject({
        nameEn: 'Renamed',
        intensity: 4,
        descriptionAr: 'وصف جديد',
        seoTitleAr: 'عنوان',
      });
      const cleared = await updateProduct(db(), STAFF, product.id, { intensity: null });
      expect(cleared.intensity).toBeNull();
      const [audit] = await auditOf('product.updated', product.id);
      expect(audit?.details).toMatchObject({
        changed: expect.arrayContaining(['nameEn', 'intensity']),
      });
    });

    it('refreshes the search document when the name or the category changes', async () => {
      const product = await buildProduct();
      const other = await createCategory(db(), SYSTEM, { nameAr: 'أطقم', nameEn: 'Gift Sets' });
      await updateProduct(db(), SYSTEM, product.id, {
        nameAr: 'مجموعة ذهبية',
        categoryId: other.id,
      });
      const doc = await searchDocumentOf(product.id);
      // The Arabic words are stored normalized: teh marbuta becomes heh (ADR-0005).
      expect(doc.split(' ')).toEqual(expect.arrayContaining(['مجموعه', 'ذهبيه']));
      expect(doc).toContain('gift');
      expect(doc).not.toContain('perfumes');
    });

    it('a draft that was never public changes slug without leaving a redirect', async () => {
      const product = await createProduct(db(), SYSTEM, {
        brandId,
        nameAr: 'ا',
        nameEn: 'Draft Slug',
      });
      await updateProduct(db(), SYSTEM, product.id, { slug: 'draft-slug-new' });
      expect(await findRedirectTarget(db(), 'product', 'draft-slug')).toBeUndefined();
      expect(
        await db().select().from(slugRedirects).where(eq(slugRedirects.entityId, product.id)),
      ).toHaveLength(0);
    });

    it('a product that was published keeps answering at its old slug', async () => {
      const product = await buildProduct();
      await publishProduct(db(), SYSTEM, product.id);
      const renamed = await updateProduct(db(), SYSTEM, product.id, { slug: 'a-better-slug' });
      expect(renamed.slug).toBe('a-better-slug');
      expect(await findRedirectTarget(db(), 'product', product.slug)).toBe('a-better-slug');
      // Even after it is unpublished again: the address belongs to the product.
      await unpublishProduct(db(), SYSTEM, product.id);
      expect(await findRedirectTarget(db(), 'product', product.slug)).toBe('a-better-slug');
    });

    it('refuses a published product an edit that would leave it incomplete', async () => {
      const product = await buildProduct();
      await publishProduct(db(), SYSTEM, product.id);
      const error = await refusal(updateProduct(db(), SYSTEM, product.id, { descriptionAr: null }));
      expect(error.kind).toBe('not_publishable');
      expect(error.reason).toBe('products_published_required_fields');
      expect((await getProductDetail(db(), product.id)).product.descriptionAr).toBe('وصف المنتج');
      // The same edit is fine on a draft.
      await unpublishProduct(db(), SYSTEM, product.id);
      await updateProduct(db(), SYSTEM, product.id, { descriptionAr: null });
    });

    it('refuses to edit an archived product until it is restored', async () => {
      const product = await buildProduct();
      await archiveProduct(db(), SYSTEM, product.id);
      expect(
        (await refusal(updateProduct(db(), SYSTEM, product.id, { nameEn: 'No' }))).reason,
      ).toBe('product_archived');
      expect((await refusal(setProductNotes(db(), SYSTEM, product.id, []))).reason).toBe(
        'product_archived',
      );
      await restoreProduct(db(), SYSTEM, product.id);
      await updateProduct(db(), SYSTEM, product.id, { nameEn: 'Yes' });
    });

    it('answers not_found, and does nothing for an empty patch', async () => {
      expect(
        (
          await refusal(
            updateProduct(db(), SYSTEM, '0198a4b2-0000-7000-8000-00000000dead', { nameEn: 'X' }),
          )
        ).kind,
      ).toBe('not_found');
      const product = await buildProduct();
      const before = await auditOf('product.updated', product.id);
      await updateProduct(db(), SYSTEM, product.id, {});
      expect(await auditOf('product.updated', product.id)).toHaveLength(before.length);
    });
  });

  // ----- notes, tags, images -----
  describe('notes, tags and images', () => {
    it('replaces the notes and refuses an archived note', async () => {
      const product = await buildProduct();
      await setProductNotes(db(), SYSTEM, product.id, [
        { noteId: noteIds[3] ?? '', position: 'top', prominence: 1 },
      ]);
      const detail = await getProductDetail(db(), product.id);
      expect(detail.notes.map((n) => n.note.nameEn)).toEqual(['Musk']);

      await raw.query('update notes set archived_at = now() where id = $1', [noteIds[3]]);
      expect(
        (
          await refusal(
            setProductNotes(db(), SYSTEM, product.id, [
              { noteId: noteIds[3] ?? '', position: 'top', prominence: 1 },
            ]),
          )
        ).reason,
      ).toBe('note_archived');
      await raw.query('update notes set archived_at = null where id = $1', [noteIds[3]]);
    });

    it('a published product cannot drop below 3 notes, and nothing changes when it is refused', async () => {
      const product = await buildProduct();
      await publishProduct(db(), SYSTEM, product.id);
      const error = await refusal(
        setProductNotes(db(), SYSTEM, product.id, threeNotes().slice(0, 2)),
      );
      expect(error).toMatchObject({ kind: 'not_publishable', reason: 'would_unpublish' });
      expect(error.details.missing).toEqual(['notes']);
      expect((await getProductDetail(db(), product.id)).notes).toHaveLength(3);
    });

    it('keeps image order, and a published product keeps at least one described image', async () => {
      const product = await buildProduct();
      const second = await media('صورة ثانية');
      await setProductImages(db(), SYSTEM, product.id, [second, mediaWithAlt]);
      const detail = await getProductDetail(db(), product.id);
      expect(detail.images.map((i) => i.media.id)).toEqual([second, mediaWithAlt]);

      await publishProduct(db(), SYSTEM, product.id);
      const error = await refusal(setProductImages(db(), SYSTEM, product.id, [mediaWithoutAlt]));
      expect(error.details.missing).toEqual(['image_with_alt']);
      await refusal(setProductImages(db(), SYSTEM, product.id, []));
      // A different described image is fine.
      await setProductImages(db(), SYSTEM, product.id, [second]);
    });

    it('clearing the alt text of the only described image of a published product is refused', async () => {
      const onlyImage = await media('الصورة الوحيدة');
      const product = await buildProduct();
      await setProductImages(db(), SYSTEM, product.id, [onlyImage]);
      await publishProduct(db(), SYSTEM, product.id);

      const error = await refusal(setMediaAlt(db(), SYSTEM, onlyImage, { altAr: null }));
      expect(error.details.missing).toEqual(['image_with_alt']);
      await refusal(setMediaAlt(db(), SYSTEM, onlyImage, { altAr: '' }));
      // Changing the text, or the English one, is fine.
      await setMediaAlt(db(), SYSTEM, onlyImage, { altAr: 'نص جديد', altEn: 'New text' });
      // With a second described image, the first alt can go.
      const spare = await media('احتياطية');
      await setProductImages(db(), SYSTEM, product.id, [onlyImage, spare]);
      await setMediaAlt(db(), SYSTEM, onlyImage, { altAr: null });
    });

    // Write skew: two staff members change two different rows that together decide whether a
    // published product still has a described image. Each of them sees the other's change as not
    // committed yet, so without a lock both would pass.
    it('two staff members clearing the alt text of two images at once cannot leave a published product without one', async () => {
      const first = await media('الصورة الأولى');
      const second = await media('الصورة الثانية');
      const product = await buildProduct();
      await setProductImages(db(), SYSTEM, product.id, [first, second]);
      await publishProduct(db(), SYSTEM, product.id);

      const outcome = await overlap(
        (tx) => setMediaAlt(tx, SYSTEM, first, { altAr: null }),
        () => setMediaAlt(db(), SYSTEM, second, { altAr: null }),
      );
      expect(outcome.status).toBe('rejected');
      const error = (outcome as PromiseRejectedResult).reason as CatalogError;
      expect(error).toBeInstanceOf(CatalogError);
      expect(error.reason).toBe('would_unpublish');
      expect(error.details.missing).toEqual(['image_with_alt']);

      const detail = await getProductDetail(db(), product.id);
      expect(detail.completion.canPublish).toBe(true);
      expect(detail.images.filter((i) => i.media.altAr !== null)).toHaveLength(1);
    });

    it('dropping an image while another staff member clears the alt text of the one that stays is refused', async () => {
      const kept = await media('الصورة المتبقية');
      const dropped = await media('الصورة المحذوفة');
      const product = await buildProduct();
      await setProductImages(db(), SYSTEM, product.id, [kept, dropped]);
      await publishProduct(db(), SYSTEM, product.id);

      const outcome = await overlap(
        (tx) => setProductImages(tx, SYSTEM, product.id, [kept]),
        () => setMediaAlt(db(), SYSTEM, kept, { altAr: null }),
      );
      expect(outcome.status).toBe('rejected');
      expect(((outcome as PromiseRejectedResult).reason as CatalogError).reason).toBe(
        'would_unpublish',
      );
      expect((await getProductDetail(db(), product.id)).completion.canPublish).toBe(true);
    });

    it('the same two changes in the other order are also refused', async () => {
      const kept = await media('الصورة المتبقية ٢');
      const dropped = await media('الصورة المحذوفة ٢');
      const product = await buildProduct();
      await setProductImages(db(), SYSTEM, product.id, [kept, dropped]);
      await publishProduct(db(), SYSTEM, product.id);

      const outcome = await overlap(
        (tx) => setMediaAlt(tx, SYSTEM, kept, { altAr: null }),
        () => setProductImages(db(), SYSTEM, product.id, [kept]),
      );
      expect(outcome.status).toBe('rejected');
      expect(((outcome as PromiseRejectedResult).reason as CatalogError).reason).toBe(
        'would_unpublish',
      );
      expect((await getProductDetail(db(), product.id)).completion.canPublish).toBe(true);
    });
  });

  // ----- variants -----
  describe('variants', () => {
    it('adds variants and refuses a repeated SKU or a repeated live size', async () => {
      const product = await createProduct(db(), SYSTEM, {
        brandId,
        nameAr: 'ا',
        nameEn: `V ${next()}`,
      });
      const base = { sku: `V-${next()}`, sizeValue: 50, priceIqd: 90_000 };
      const first = await addVariant(db(), SYSTEM, product.id, base);
      expect(
        (await refusal(addVariant(db(), SYSTEM, product.id, { ...base, sizeValue: 75 }))).reason,
      ).toBe('product_variants_sku_uq');
      const sameSize = await refusal(
        addVariant(db(), SYSTEM, product.id, { ...base, sku: `V-${next()}` }),
      );
      expect(sameSize.reason).toBe('product_variants_live_size_uq');
      // An archived variant frees its size.
      await archiveVariant(db(), SYSTEM, first.id);
      await addVariant(db(), SYSTEM, product.id, { ...base, sku: `V-${next()}` });
    });

    it('a price change is audited with the old and the new price', async () => {
      const product = await buildProduct();
      const [variant] = await db()
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, product.id));
      const updated = await updateVariant(db(), STAFF, variant?.id ?? '', {
        priceIqd: 120_000,
        compareAtIqd: 150_001,
      });
      expect(updated.priceIqd).toBe(120_000);
      const [audit] = await auditOf('product.price_changed', product.id);
      expect(audit).toMatchObject({ actorType: 'staff' });
      expect(audit?.details).toMatchObject({
        sku: variant?.sku,
        priceIqd: { from: 150_000, to: 120_000 },
        compareAtIqd: { from: null, to: 150_001 },
      });
    });

    it('a change that is not about price is audited as a variant update', async () => {
      const product = await buildProduct();
      const [variant] = await db()
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, product.id));
      await updateVariant(db(), SYSTEM, variant?.id ?? '', { sortOrder: 3 });
      expect(await auditOf('product.variant_updated', product.id)).toHaveLength(1);
      expect(await auditOf('product.price_changed', product.id)).toHaveLength(0);
    });

    it('refuses a compare-at price that is not above the final price', async () => {
      const product = await buildProduct();
      const [variant] = await db()
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, product.id));
      // The patch alone looks fine (only one price is given): the database sees the merged row.
      const error = await refusal(
        updateVariant(db(), SYSTEM, variant?.id ?? '', { compareAtIqd: 100_000 }),
      );
      expect(error).toMatchObject({
        kind: 'invalid',
        reason: 'product_variants_compare_at_above_price',
      });
    });

    it('a published product cannot lose its last live variant', async () => {
      const product = await buildProduct();
      await publishProduct(db(), SYSTEM, product.id);
      const [variant] = await db()
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, product.id));
      const error = await refusal(archiveVariant(db(), SYSTEM, variant?.id ?? ''));
      expect(error.details.missing).toEqual(['variant']);
      const [still] = await db()
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, variant?.id ?? ''));
      expect(still?.archivedAt).toBeNull();
      // With a second live variant the first can go.
      await addVariant(db(), SYSTEM, product.id, {
        sku: `SPARE-${next()}`,
        sizeValue: 30,
        priceIqd: 60_000,
      });
      await archiveVariant(db(), SYSTEM, variant?.id ?? '');
    });

    it('an archived variant cannot be edited, and archiving twice is harmless', async () => {
      const product = await buildProduct();
      const [variant] = await db()
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, product.id));
      await archiveVariant(db(), SYSTEM, variant?.id ?? '');
      await archiveVariant(db(), SYSTEM, variant?.id ?? '');
      expect(
        (await refusal(updateVariant(db(), SYSTEM, variant?.id ?? '', { priceIqd: 1 }))).reason,
      ).toBe('variant_archived');
      expect(
        (await refusal(archiveVariant(db(), SYSTEM, '0198a4b2-0000-7000-8000-00000000dead'))).kind,
      ).toBe('not_found');
    });
  });

  // ----- publish gate -----
  describe('publishing', () => {
    it('publishes a complete product, sets the date once and keeps it on republish', async () => {
      const product = await buildProduct();
      const published = await publishProduct(db(), STAFF, product.id);
      expect(published.status).toBe('published');
      expect(published.publishedAt).toBeInstanceOf(Date);
      const firstDate = published.publishedAt;

      expect((await publishProduct(db(), STAFF, product.id)).publishedAt).toEqual(firstDate);
      const draft = await unpublishProduct(db(), STAFF, product.id);
      expect(draft).toMatchObject({ status: 'draft', publishedAt: firstDate });
      expect((await publishProduct(db(), STAFF, product.id)).publishedAt).toEqual(firstDate);
      expect(await auditOf('product.published', product.id)).toHaveLength(2);
    });

    it('names everything a product still lacks', async () => {
      const bare = await createProduct(db(), SYSTEM, {
        brandId,
        nameAr: 'ا',
        nameEn: `Bare ${next()}`,
      });
      const error = await refusal(publishProduct(db(), SYSTEM, bare.id));
      expect(error.kind).toBe('not_publishable');
      expect(error.details.missing).toEqual([
        'category',
        'primary_family',
        'notes',
        'variant',
        'image_with_alt',
        'description_ar',
        'seo_title_ar',
        'seo_description_ar',
      ]);
      expect((await getProductDetail(db(), bare.id)).product.status).toBe('draft');
    });

    // Every required piece, one at a time. The service names the piece, and the database refuses the
    // same change when the service is bypassed: the checklist and the database agree both ways.
    const omissions: Exclude<RequiredKey, 'name_ar' | 'brand'>[] = [
      'category',
      'primary_family',
      'notes',
      'variant',
      'image_with_alt',
      'description_ar',
      'seo_title_ar',
      'seo_description_ar',
    ];
    it.each(omissions)('missing %s: the service and the database both refuse', async (omit) => {
      const product = await buildProduct(omit);
      const completion = await getProductCompletion(db(), product.id);
      expect(completion.missingRequired).toEqual([omit]);

      const error = await refusal(publishProduct(db(), SYSTEM, product.id));
      expect(error.details.missing).toEqual([omit]);

      // Straight to the database, as a buggy caller would.
      await expect(
        raw.query(`update products set status = 'published', published_at = now() where id = $1`, [
          product.id,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('a product that passes every check is accepted by both', async () => {
      const product = await buildProduct();
      expect((await getProductCompletion(db(), product.id)).canPublish).toBe(true);
      await raw.query(
        `update products set status = 'published', published_at = now() where id = $1`,
        [product.id],
      );
    });

    it('archives and restores: an archived product comes back as a draft, never as published', async () => {
      const product = await buildProduct();
      await publishProduct(db(), SYSTEM, product.id);
      const archived = await archiveProduct(db(), SYSTEM, product.id);
      expect(archived.status).toBe('archived');
      expect(archived.archivedAt).toBeInstanceOf(Date);
      expect((await refusal(publishProduct(db(), SYSTEM, product.id))).reason).toBe(
        'product_archived',
      );
      expect((await refusal(unpublishProduct(db(), SYSTEM, product.id))).reason).toBe(
        'product_archived',
      );

      const restored = await restoreProduct(db(), SYSTEM, product.id);
      expect(restored).toMatchObject({ status: 'draft', archivedAt: null });
      expect((await restoreProduct(db(), SYSTEM, product.id)).status).toBe('draft');
      expect((await archiveProduct(db(), SYSTEM, product.id)).status).toBe('archived');
      expect((await archiveProduct(db(), SYSTEM, product.id)).status).toBe('archived');
    });
  });

  describe('getProductDetail', () => {
    it('returns the product with its parts and its completion', async () => {
      const product = await buildProduct();
      await updateProduct(db(), SYSTEM, product.id, { secondaryFamilyId: otherFamilyId });
      const detail = await getProductDetail(db(), product.id);
      expect(detail.brand?.id).toBe(brandId);
      expect(detail.category?.id).toBe(categoryId);
      expect(detail.notes).toHaveLength(3);
      expect(detail.variants).toHaveLength(1);
      expect(detail.images).toHaveLength(1);
      expect(detail.completion.canPublish).toBe(true);
      expect(
        (await refusal(getProductDetail(db(), '0198a4b2-0000-7000-8000-00000000dead'))).kind,
      ).toBe('not_found');
    });
  });
});
