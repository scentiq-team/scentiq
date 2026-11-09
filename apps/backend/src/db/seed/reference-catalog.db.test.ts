// `seed:reference` against a real PostgreSQL, as the application role (how the CLI runs it).
// What is proven: it fills an empty database, running it again changes nothing, it never overwrites
// what staff edited and never brings back a slug that was retired on purpose, it works in
// production, and what it inserts is usable by the catalog services.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  addVariant,
  createBrand,
  createProduct,
  publishProduct,
  setProductImages,
  setProductNotes,
  updateCategory,
  updateNote,
} from '../../modules/catalog/index.js';
import { processAndStoreImage } from '../../modules/media/index.js';
import { LocalDiskStorage } from '../../modules/media/storage.js';
import { createTestDatabase, describeDb, type TestDatabase } from '../../test/database.js';
import { jpeg } from '../../test/images.js';
import { createDatabase, type Database } from '../client.js';
import { countSampleRows } from '../sample-data-gate.js';
import { auditLogs } from '../schema/audit.js';
import { slugRedirects } from '../schema/slugs.js';
import {
  categories,
  families,
  familyAdjacency,
  noteAliases,
  noteGroups,
  notes,
  tags,
} from '../schema/taxonomy.js';
import {
  CATEGORIES,
  FAMILIES,
  FAMILY_ADJACENCY,
  NOTE_GROUPS,
  NOTES,
  TAGS,
} from './data/reference-data.js';
import { referenceCatalog } from './reference-catalog.js';
import { runSeeds } from './runner.js';

const SYSTEM = { type: 'system' } as const;
const aliasTotal = NOTES.reduce((sum, note) => sum + (note.aliases?.length ?? 0), 0);

describeDb('seed:reference (catalog)', () => {
  let testDb: TestDatabase;
  let database: Database;
  const db = () => database.db;
  const seed = (appEnv: 'development' | 'production' = 'production') =>
    runSeeds({ db: db(), level: 'reference', appEnv, seeders: [referenceCatalog] });

  const counts = async () => ({
    categories: (await db().select().from(categories)).length,
    families: (await db().select().from(families)).length,
    adjacency: (await db().select().from(familyAdjacency)).length,
    groups: (await db().select().from(noteGroups)).length,
    notes: (await db().select().from(notes)).length,
    aliases: (await db().select().from(noteAliases)).length,
    tags: (await db().select().from(tags)).length,
    audit: (
      await db()
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'seed.reference_catalog_applied'))
    ).length,
  });

  beforeAll(async () => {
    testDb = await createTestDatabase();
    database = createDatabase({ url: testDb.appUrl, poolMax: 4 });
  });
  afterAll(async () => {
    await database.close();
    await testDb.drop();
  });

  it('fills an empty database with every list, in production too', async () => {
    const result = await seed('production');
    expect(result.ran).toHaveLength(1);
    expect(await counts()).toEqual({
      categories: CATEGORIES.length,
      families: FAMILIES.length,
      adjacency: FAMILY_ADJACENCY.length,
      groups: NOTE_GROUPS.length,
      notes: NOTES.length,
      aliases: aliasTotal,
      tags: TAGS.length,
      audit: 1,
    });
  });

  it('records what it added in the audit log, with counts and no names', async () => {
    const [row] = await db()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'seed.reference_catalog_applied'));
    expect(row).toMatchObject({ actorType: 'system' });
    expect(row?.details).toMatchObject({
      categories: CATEGORIES.length,
      notes: NOTES.length,
      tags: TAGS.length,
    });
  });

  it('is not sample data: nothing is registered as sample, so production stays clean', async () => {
    expect(await countSampleRows(db())).toBe(0);
  });

  it('every adjacency pair is stored once, smaller id first, at 50%', async () => {
    const rows = await db().select().from(familyAdjacency);
    for (const row of rows) {
      expect(row.familyId < row.adjacentFamilyId).toBe(true);
      expect(row.weightPercent).toBe(50);
    }
    // Reading it back by slug gives the list we wrote.
    const slugOf = new Map((await db().select().from(families)).map((f) => [f.id, f.slug]));
    const stored = rows
      .map((r) => [slugOf.get(r.familyId), slugOf.get(r.adjacentFamilyId)].sort().join('|'))
      .sort();
    const wanted = FAMILY_ADJACENCY.map(([a, b]) => [a, b].sort().join('|')).sort();
    expect(stored).toEqual(wanted);
  });

  it('every note sits in a group and every alias points at its note', async () => {
    const rows = await db()
      .select({ slug: notes.slug, group: noteGroups.slug })
      .from(notes)
      .innerJoin(noteGroups, eq(noteGroups.id, notes.groupId));
    expect(rows).toHaveLength(NOTES.length);
    for (const row of rows) {
      expect(NOTES.find((n) => n.slug === row.slug)?.group).toBe(row.group);
    }
    const oudAliases = await db()
      .select({ alias: noteAliases.alias })
      .from(noteAliases)
      .innerJoin(notes, eq(notes.id, noteAliases.noteId))
      .where(eq(notes.slug, 'oud'));
    expect(oudAliases.map((a) => a.alias).sort()).toEqual(['agarwood', 'aoud', 'oud wood', 'oudh']);
  });

  it('running it again changes nothing: same rows, no new audit entry', async () => {
    const before = await counts();
    await seed('production');
    await seed('development');
    expect(await counts()).toEqual(before);
  });

  it('never overwrites what staff changed in Studio', async () => {
    const [family] = await db().select().from(families).where(eq(families.slug, 'woody'));
    await db().update(families).set({ nameAr: 'خشبيّ (معدّل)' }).where(eq(families.slug, 'woody'));
    const [tag] = await db().select().from(tags).where(eq(tags.slug, 'eid'));
    await db().update(tags).set({ nameAr: 'عيد مبارك' }).where(eq(tags.slug, 'eid'));
    await db().delete(noteAliases).where(sql`lower(${noteAliases.alias}) = 'oudh'`);
    expect(family).toBeDefined();
    expect(tag).toBeDefined();

    await seed('production');

    const [afterFamily] = await db().select().from(families).where(eq(families.slug, 'woody'));
    expect(afterFamily?.nameAr).toBe('خشبيّ (معدّل)');
    const [afterTag] = await db().select().from(tags).where(eq(tags.slug, 'eid'));
    expect(afterTag?.nameAr).toBe('عيد مبارك');
    // A deleted alias is a missing row, so it comes back: aliases are search help, not content.
    const oudh = await db()
      .select()
      .from(noteAliases)
      .where(sql`lower(${noteAliases.alias}) = 'oudh'`);
    expect(oudh).toHaveLength(1);
  });

  it('fills in only what is missing, and says so in the audit log', async () => {
    await db().delete(tags).where(eq(tags.slug, 'gift'));
    const before = await counts();
    await seed('production');
    const after = await counts();
    expect(after.tags).toBe(before.tags + 1);
    expect(after.audit).toBe(before.audit + 1);
    const rows = await db()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'seed.reference_catalog_applied'));
    expect(rows.at(-1)?.details).toMatchObject({ tags: 1, notes: 0, categories: 0 });
  });

  it('does not bring back a slug that was changed on purpose', async () => {
    const [category] = await db().select().from(categories).where(eq(categories.slug, 'gift-sets'));
    const [note] = await db().select().from(notes).where(eq(notes.slug, 'honey'));
    if (category === undefined || note === undefined) throw new Error('reference rows are missing');
    await updateCategory(db(), SYSTEM, category.id, { slug: 'gift-boxes' });
    await updateNote(db(), SYSTEM, note.id, { slug: 'natural-honey' });
    const retired = await db().select().from(slugRedirects);
    expect(retired.map((r) => r.oldSlug)).toEqual(expect.arrayContaining(['gift-sets', 'honey']));

    const before = await counts();
    await seed('production');
    expect(await counts()).toEqual(before);
    expect(await db().select().from(categories).where(eq(categories.slug, 'gift-sets'))).toEqual(
      [],
    );
    expect(await db().select().from(notes).where(eq(notes.slug, 'honey'))).toEqual([]);
  });

  it('what it inserts works with the catalog services: a product can be built and published', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scentiq-refseed-'));
    try {
      const storage = new LocalDiskStorage(root);
      const brand = await createBrand(db(), SYSTEM, {
        nameAr: 'علامة اختبار',
        nameEn: 'Test Brand',
      });
      const [category] = await db()
        .select()
        .from(categories)
        .where(eq(categories.slug, 'perfumes'));
      const [family] = await db().select().from(families).where(eq(families.slug, 'oud'));
      const noteRows = await db().select().from(notes);
      const pick = (slug: string) => noteRows.find((n) => n.slug === slug)?.id ?? '';
      if (category === undefined || family === undefined)
        throw new Error('reference rows are missing');

      const product = await createProduct(db(), SYSTEM, {
        brandId: brand.id,
        categoryId: category.id,
        primaryFamilyId: family.id,
        nameAr: 'عطر اختبار',
        nameEn: 'Test Perfume',
        descriptionAr: 'وصف تجريبي',
        seoTitleAr: 'عطر اختبار',
        seoDescriptionAr: 'وصف قصير',
      });
      await setProductNotes(db(), SYSTEM, product.id, [
        { noteId: pick('oud'), position: 'base', prominence: 3 },
        { noteId: pick('rose'), position: 'heart', prominence: 2 },
        { noteId: pick('saffron'), position: 'top', prominence: 1 },
      ]);
      await addVariant(db(), SYSTEM, product.id, {
        sku: 'REF-1',
        sizeValue: 100,
        priceIqd: 120_000,
      });
      const image = await processAndStoreImage(db(), storage, SYSTEM, {
        bytes: await jpeg(800, 800),
        altAr: 'زجاجة عطر',
      });
      await setProductImages(db(), SYSTEM, product.id, [image.asset.id]);

      const published = await publishProduct(db(), SYSTEM, product.id);
      expect(published.status).toBe('published');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
