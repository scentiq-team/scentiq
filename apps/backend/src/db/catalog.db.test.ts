// The catalog rules the database enforces (STEP 3, ADR-0012). Like rules.db.test.ts, every rule has
// a test that fails if the rule is removed: an invalid statement must be rejected by that specific
// constraint (checked by name), so if the constraint disappears the statement succeeds and the
// test fails. Statements run as the least-privilege application role, like the real server.

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  constraintOf,
  createTestDatabase,
  describeDb,
  type TestDatabase,
} from '../test/database.js';
import {
  PG_CHECK_VIOLATION,
  PG_RESTRICT_VIOLATION,
  PG_UNIQUE_VIOLATION,
  pgErrorCode,
} from './errors.js';

type Values = Record<string, unknown>;

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('The statement was accepted, but the database should have rejected it.');
}

describeDb('catalog database rules', () => {
  let database: TestDatabase;
  let app: pg.Pool;
  let counter = 0;
  const next = () => ++counter;

  // Shared parents, created once.
  let brandId: string;
  let categoryId: string;
  let familyId: string;
  let otherFamilyId: string;
  let noteIds: string[];
  let noteGroupId: string;
  let mediaWithAlt: string;
  let mediaWithoutAlt: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    app = new pg.Pool({ connectionString: database.appUrl, max: 4 });

    brandId = await insert('brands', { slug: 'shared-brand', name_ar: 'براند', name_en: 'Shared' });
    categoryId = await insert('categories', {
      slug: 'perfumes',
      name_ar: 'عطور',
      name_en: 'Perfumes',
    });
    familyId = await insert('families', { slug: 'woody', name_ar: 'خشبي', name_en: 'Woody' });
    otherFamilyId = await insert('families', {
      slug: 'floral',
      name_ar: 'زهري',
      name_en: 'Floral',
    });
    const groupId = await insert('note_groups', {
      slug: 'woods',
      name_ar: 'أخشاب',
      name_en: 'Woods',
    });
    noteGroupId = groupId;
    noteIds = [];
    for (const [slug, ar, en] of [
      ['oud', 'عود', 'Oud'],
      ['amber', 'عنبر', 'Amber'],
      ['rose', 'ورد', 'Rose'],
      ['musk', 'مسك', 'Musk'],
    ]) {
      noteIds.push(await insert('notes', { group_id: groupId, slug, name_ar: ar, name_en: en }));
    }
    mediaWithAlt = await media({ alt_ar: 'زجاجة عطر' });
    mediaWithoutAlt = await media({});
  });
  afterAll(async () => {
    await app.end();
    await database.drop();
  });

  // ----- helpers -----
  /** Inserts one row and returns its id (tables with a composite key have none: they return ''). */
  async function insert(table: string, values: Values): Promise<string> {
    const columns = Object.keys(values);
    // An undefined value would silently become NULL and make a rejection test pass or fail for
    // the wrong reason (for example an id read before beforeAll has run).
    const undefinedColumn = columns.find((column) => values[column] === undefined);
    if (undefinedColumn) throw new Error(`Test bug: ${table}.${undefinedColumn} is undefined`);
    const result = await app.query(
      `insert into ${table} (${columns.map((c) => `"${c}"`).join(', ')})
       values (${columns.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
      Object.values(values),
    );
    return (result.rows[0].id as string | undefined) ?? '';
  }
  const media = (values: Values) =>
    insert('media_assets', {
      storage_key: `m/${next().toString().padStart(8, '0')}abcd`,
      width: 1600,
      height: 1600,
      byte_size: 1000,
      ...values,
    });
  const draft = (values: Values = {}) =>
    insert('products', {
      slug: `product-${next()}`,
      brand_id: brandId,
      name_ar: 'منتج',
      ...values,
    });
  /** A draft with every column-level field a publish needs, plus the children it needs. */
  async function readyToPublish(values: Values = {}) {
    const id = await draft({
      description_ar: 'وصف',
      category_id: categoryId,
      primary_family_id: familyId,
      seo_title_ar: 'عنوان',
      seo_description_ar: 'وصف قصير',
      ...values,
    });
    for (const noteId of noteIds.slice(0, 3)) {
      await app.query(
        `insert into product_notes (product_id, note_id, position) values ($1, $2, 'heart')`,
        [id, noteId],
      );
    }
    await variant(id);
    await app.query(`insert into product_images (product_id, media_id) values ($1, $2)`, [
      id,
      mediaWithAlt,
    ]);
    return id;
  }
  const variant = (productId: string, values: Values = {}) =>
    insert('product_variants', {
      product_id: productId,
      sku: `SKU-${next()}`,
      size_value: 100,
      price_iqd: 150_000,
      ...values,
    });
  const publish = (id: string) =>
    app.query(`update products set status = 'published', published_at = now() where id = $1`, [id]);

  async function rejected(promise: Promise<unknown>, code: string, constraint: string) {
    const error = await failure(promise);
    expect(pgErrorCode(error), `SQLSTATE of the rejection (${constraint})`).toBe(code);
    expect(constraintOf(error)).toBe(constraint);
  }

  // ----- slugs: one rule, every table that has one -----
  describe('slug format', () => {
    const tables: [string, string, Values][] = [
      ['brands', 'brands_slug_format', { name_ar: 'ا', name_en: 'A' }],
      ['categories', 'categories_slug_format', { name_ar: 'ا', name_en: 'A' }],
      ['families', 'families_slug_format', { name_ar: 'ا', name_en: 'A' }],
      ['note_groups', 'note_groups_slug_format', { name_ar: 'ا', name_en: 'A' }],
      ['tags', 'tags_slug_format', { type: 'mood', name_ar: 'ا', name_en: 'A' }],
    ];
    const badSlugs = ['Bad Slug', '-leading', 'trailing-', 'double--hyphen', 'عطر', 'UPPER', ''];
    it.each(tables)(
      '%s rejects a slug that is not Latin lower-case',
      async (table, constraint, rest) => {
        for (const slug of badSlugs) {
          await rejected(insert(table, { slug, ...rest }), PG_CHECK_VIOLATION, constraint);
        }
        await rejected(
          insert(table, { slug: 'a'.repeat(121), ...rest }),
          PG_CHECK_VIOLATION,
          constraint,
        );
      },
    );
    it('products, collections and redirects reject them too', async () => {
      await rejected(draft({ slug: 'Not OK' }), PG_CHECK_VIOLATION, 'products_slug_format');
      await rejected(
        insert('collections', { slug: 'Not OK', kind: 'manual', name_ar: 'ا' }),
        PG_CHECK_VIOLATION,
        'collections_slug_format',
      );
      await rejected(
        insert('slug_redirects', {
          entity_type: 'product',
          entity_id: brandId,
          old_slug: 'Not OK',
        }),
        PG_CHECK_VIOLATION,
        'slug_redirects_old_slug_format',
      );
    });
    it('accepts a normal slug of the longest allowed length', async () => {
      await insert('tags', { type: 'mood', slug: 'a'.repeat(120), name_ar: 'ا', name_en: 'A' });
    });
  });

  // ----- brands -----
  describe('brands', () => {
    it('keeps slugs and English names unique, ignoring case in the name', async () => {
      await insert('brands', { slug: 'dup-brand', name_ar: 'ا', name_en: 'Dup Brand' });
      await rejected(
        insert('brands', { slug: 'dup-brand', name_ar: 'ا', name_en: 'Other' }),
        PG_UNIQUE_VIOLATION,
        'brands_slug_uq',
      );
      await rejected(
        insert('brands', { slug: 'dup-brand-2', name_ar: 'ا', name_en: 'dup BRAND' }),
        PG_UNIQUE_VIOLATION,
        'brands_name_en_uq',
      );
    });
    const rejectedValues: [string, string, Values][] = [
      ['a blank Arabic name', 'brands_name_ar_valid', { name_ar: '   ' }],
      ['an Arabic name over 200 characters', 'brands_name_ar_valid', { name_ar: 'ا'.repeat(201) }],
      ['a blank English name', 'brands_name_en_valid', { name_en: '' }],
      ['a lower-case country code', 'brands_country_code_format', { country_code: 'fr' }],
      ['a three-letter country code', 'brands_country_code_format', { country_code: 'FRA' }],
      ['a template key with capitals', 'brands_template_key_format', { template_key: 'Bad' }],
      ['an empty story', 'brands_story_ar_valid', { story_ar: ' ' }],
    ];
    it.each(rejectedValues)('rejects %s', async (_label, constraint, values) => {
      await rejected(
        insert('brands', {
          slug: `b-${next()}`,
          name_ar: 'ا',
          name_en: `Brand ${next()}`,
          ...values,
        }),
        PG_CHECK_VIOLATION,
        constraint,
      );
    });
    it('keeps the logo image: it cannot be deleted while a brand uses it', async () => {
      const logo = await media({ alt_ar: 'شعار' });
      await insert('brands', {
        slug: 'with-logo',
        name_ar: 'ا',
        name_en: 'With Logo',
        logo_media_id: logo,
      });
      const error = await failure(app.query('delete from media_assets where id = $1', [logo]));
      expect(pgErrorCode(error)).toBe(PG_RESTRICT_VIOLATION);
    });
  });

  // ----- categories -----
  describe('categories', () => {
    it('rejects a category that is its own parent', async () => {
      const id = await insert('categories', { slug: 'self', name_ar: 'ا', name_en: 'Self' });
      await rejected(
        app.query('update categories set parent_id = id where id = $1', [id]),
        PG_CHECK_VIOLATION,
        'categories_not_own_parent',
      );
    });
    it('allows two levels and rejects a third', async () => {
      const top = await insert('categories', { slug: 'oud-top', name_ar: 'عود', name_en: 'Oud' });
      const child = await insert('categories', {
        slug: 'oud-oils',
        parent_id: top,
        name_ar: 'زيوت',
        name_en: 'Oils',
      });
      await rejected(
        insert('categories', { slug: 'too-deep', parent_id: child, name_ar: 'ا', name_en: 'Deep' }),
        PG_CHECK_VIOLATION,
        'categories_max_depth',
      );
    });
    it('rejects moving a category that has children under another category', async () => {
      const parent = await insert('categories', {
        slug: 'has-kids',
        name_ar: 'ا',
        name_en: 'Kids',
      });
      await insert('categories', {
        slug: 'the-kid',
        parent_id: parent,
        name_ar: 'ا',
        name_en: 'Kid',
      });
      const elsewhere = await insert('categories', {
        slug: 'elsewhere',
        name_ar: 'ا',
        name_en: 'E',
      });
      await rejected(
        app.query('update categories set parent_id = $1 where id = $2', [elsewhere, parent]),
        PG_CHECK_VIOLATION,
        'categories_max_depth',
      );
    });
    // Two administrators at the same instant: one puts X under Y while the other puts Y under Z.
    // Each check passes on its own (the other change is not committed yet), together they would
    // build a third level.
    it('rejects the second of two simultaneous moves that together would build a third level', async () => {
      const x = await insert('categories', { slug: 'race-x', name_ar: 'ا', name_en: 'RaceX' });
      const y = await insert('categories', { slug: 'race-y', name_ar: 'ا', name_en: 'RaceY' });
      const z = await insert('categories', { slug: 'race-z', name_ar: 'ا', name_en: 'RaceZ' });
      const one = await app.connect();
      const two = await app.connect();
      try {
        await one.query('begin');
        await one.query('update categories set parent_id = $1 where id = $2', [y, x]);
        await two.query('begin');
        let settled = false;
        const second = two
          .query('update categories set parent_id = $1 where id = $2', [z, y])
          .finally(() => {
            settled = true;
          });
        second.catch(() => {}); // judged below
        // Give it time to finish, or to be seen waiting for the other transaction.
        for (let tries = 0; tries < 100 && !settled; tries++) {
          const waiting = await app.query('select 1 from pg_locks where not granted');
          if (waiting.rows.length > 0) break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await one.query('commit');
        await rejected(second, PG_CHECK_VIOLATION, 'categories_max_depth');
        await two.query('rollback');
      } finally {
        one.release();
        two.release();
      }
      const depth = await app.query(
        `select count(*)::int as n from categories c
           join categories p on p.id = c.parent_id
          where p.parent_id is not null`,
      );
      expect(depth.rows[0].n).toBe(0);
    });
    it('rejects a parent that does not exist', async () => {
      const error = await failure(
        insert('categories', {
          slug: 'orphan',
          parent_id: '0198a4b2-0000-7000-8000-00000000dead',
          name_ar: 'ا',
          name_en: 'Orphan',
        }),
      );
      expect(constraintOf(error)).toBe('categories_parent_id_categories_id_fk');
    });
  });

  // ----- families, notes, tags -----
  describe('families, notes and tags', () => {
    it('stores each family pair once, smaller id first, with a weight from 1 to 100', async () => {
      const [low, high] =
        familyId < otherFamilyId ? [familyId, otherFamilyId] : [otherFamilyId, familyId];
      await insert('family_adjacency', {
        family_id: low,
        adjacent_family_id: high,
        weight_percent: 50,
      });
      await rejected(
        insert('family_adjacency', {
          family_id: high,
          adjacent_family_id: low,
          weight_percent: 50,
        }),
        PG_CHECK_VIOLATION,
        'family_adjacency_ordered_pair',
      );
      await rejected(
        insert('family_adjacency', {
          family_id: low,
          adjacent_family_id: high,
          weight_percent: 60,
        }),
        PG_UNIQUE_VIOLATION,
        'family_adjacency_pk',
      );
      await rejected(
        insert('family_adjacency', { family_id: low, adjacent_family_id: low, weight_percent: 50 }),
        PG_CHECK_VIOLATION,
        'family_adjacency_ordered_pair',
      );
    });
    it.each([0, 101])('rejects an adjacency weight of %s', async (weight) => {
      const a = await insert('families', { slug: `fa-${next()}`, name_ar: 'ا', name_en: 'A' });
      const b = await insert('families', { slug: `fb-${next()}`, name_ar: 'ا', name_en: 'B' });
      const [low, high] = a < b ? [a, b] : [b, a];
      await rejected(
        insert('family_adjacency', {
          family_id: low,
          adjacent_family_id: high,
          weight_percent: weight,
        }),
        PG_CHECK_VIOLATION,
        'family_adjacency_weight_range',
      );
    });
    it('keeps English note names unique ignoring case, and aliases unique per note', async () => {
      const groupId = await insert('note_groups', {
        slug: `g-${next()}`,
        name_ar: 'ا',
        name_en: 'G',
      });
      await rejected(
        insert('notes', { group_id: groupId, slug: 'oud-2', name_ar: 'ا', name_en: 'OUD' }),
        PG_UNIQUE_VIOLATION,
        'notes_name_en_uq',
      );
      await insert('note_aliases', { note_id: noteIds[0], alias: 'oudh' });
      await rejected(
        insert('note_aliases', { note_id: noteIds[0], alias: 'OUDH' }),
        PG_UNIQUE_VIOLATION,
        'note_aliases_note_alias_uq',
      );
      await rejected(
        insert('note_aliases', { note_id: noteIds[0], alias: 'x'.repeat(61) }),
        PG_CHECK_VIOLATION,
        'note_aliases_alias_valid',
      );
      // The same alias on a different note is fine.
      await insert('note_aliases', { note_id: noteIds[1], alias: 'oudh' });
    });
    it('only accepts the four tag types, and the same slug may repeat across types', async () => {
      await rejected(
        insert('tags', { type: 'colour', slug: 'red', name_ar: 'ا', name_en: 'Red' }),
        PG_CHECK_VIOLATION,
        'tags_type_valid',
      );
      await insert('tags', { type: 'season', slug: 'winter', name_ar: 'شتاء', name_en: 'Winter' });
      await insert('tags', { type: 'mood', slug: 'winter', name_ar: 'شتوي', name_en: 'Wintry' });
      await rejected(
        insert('tags', { type: 'season', slug: 'winter', name_ar: 'ا', name_en: 'Again' }),
        PG_UNIQUE_VIOLATION,
        'tags_type_slug_uq',
      );
    });
  });

  // ----- media -----
  describe('media', () => {
    const rejectedMedia: [string, string, Values][] = [
      [
        'a storage key with a path trick',
        'media_assets_storage_key_format',
        { storage_key: '../../etc/passwd' },
      ],
      [
        'a storage key with capitals',
        'media_assets_storage_key_format',
        { storage_key: 'M/ABCDEFGH' },
      ],
      ['zero width', 'media_assets_dimensions_valid', { width: 0 }],
      ['a height over 10000', 'media_assets_dimensions_valid', { height: 10_001 }],
      ['zero bytes', 'media_assets_dimensions_valid', { byte_size: 0 }],
      ['a short colour code', 'media_assets_dominant_color_format', { dominant_color: '#FFF' }],
      ['an upper-case colour', 'media_assets_dominant_color_format', { dominant_color: '#AABBCC' }],
      ['blank Arabic alt text', 'media_assets_alt_ar_valid', { alt_ar: '  ' }],
      ['alt text over 300 characters', 'media_assets_alt_en_valid', { alt_en: 'x'.repeat(301) }],
    ];
    it.each(rejectedMedia)('rejects %s', async (_label, constraint, values) => {
      await rejected(
        insert('media_assets', {
          storage_key: `m/${next().toString().padStart(8, '0')}zzzz`,
          width: 1600,
          height: 1600,
          byte_size: 100,
          ...values,
        }),
        PG_CHECK_VIOLATION,
        constraint,
      );
    });
    it('keeps storage keys unique and only allows the fixed variant widths', async () => {
      const id = await media({ alt_ar: 'ا' });
      const key = `m/${next().toString().padStart(8, '0')}var`;
      await insert('media_variants', {
        media_id: id,
        width: 480,
        storage_key: `${key}-480`,
        byte_size: 10,
      });
      await rejected(
        insert('media_variants', {
          media_id: id,
          width: 960,
          storage_key: `${key}-480`,
          byte_size: 10,
        }),
        PG_UNIQUE_VIOLATION,
        'media_variants_storage_key_uq',
      );
      await rejected(
        insert('media_variants', {
          media_id: id,
          width: 700,
          storage_key: `${key}-700`,
          byte_size: 10,
        }),
        PG_CHECK_VIOLATION,
        'media_variants_width_allowed',
      );
      await rejected(
        insert('media_variants', {
          media_id: id,
          width: 480,
          storage_key: `${key}-dup`,
          byte_size: 10,
        }),
        PG_UNIQUE_VIOLATION,
        'media_variants_pk',
      );
    });
    it('removes its variants when an image row is deleted', async () => {
      const id = await media({});
      await insert('media_variants', {
        media_id: id,
        width: 1600,
        storage_key: `m/${next().toString().padStart(8, '0')}cas`,
        byte_size: 10,
      });
      await app.query('delete from media_assets where id = $1', [id]);
      const left = await app.query(
        'select count(*)::int as n from media_variants where media_id = $1',
        [id],
      );
      expect(left.rows[0].n).toBe(0);
    });
  });

  // ----- products -----
  describe('products', () => {
    const rejectedValues: [string, string, Values][] = [
      ['a blank Arabic name', 'products_name_ar_valid', { name_ar: ' ' }],
      [
        'an Arabic name over 200 characters',
        'products_name_ar_valid',
        { name_ar: 'ا'.repeat(201) },
      ],
      ['an empty English name', 'products_name_en_valid', { name_en: '' }],
      [
        'a description over 10000 characters',
        'products_description_ar_valid',
        { description_ar: 'ا'.repeat(10_001) },
      ],
      [
        'an SEO title over 120 characters',
        'products_seo_title_ar_valid',
        { seo_title_ar: 'ا'.repeat(121) },
      ],
      [
        'an SEO description over 400 characters',
        'products_seo_description_en_valid',
        { seo_description_en: 'a'.repeat(401) },
      ],
      ['an unknown concentration', 'products_concentration_valid', { concentration: 'cologne' }],
      ['an unknown gender', 'products_gender_valid', { gender: 'kids' }],
      ['an intensity of 0', 'products_intensity_range', { intensity: 0 }],
      ['an intensity of 6', 'products_intensity_range', { intensity: 6 }],
      ['an unknown status', 'products_status_valid', { status: 'live' }],
      [
        'an archived status without a date',
        'products_archived_at_matches_status',
        { status: 'archived' },
      ],
      [
        'an archive date on a draft',
        'products_archived_at_matches_status',
        { archived_at: new Date() },
      ],
    ];
    it.each(rejectedValues)('rejects %s', async (_label, constraint, values) => {
      await rejected(draft(values), PG_CHECK_VIOLATION, constraint);
    });

    // These need ids that only exist after beforeAll, so they cannot sit in the table above.
    it('rejects a secondary family without a primary one, and the same family twice', async () => {
      await rejected(
        draft({ secondary_family_id: familyId }),
        PG_CHECK_VIOLATION,
        'products_families_distinct',
      );
      await rejected(
        draft({ primary_family_id: familyId, secondary_family_id: familyId }),
        PG_CHECK_VIOLATION,
        'products_families_distinct',
      );
    });

    it('accepts valid values and defaults to an unisex draft with an empty search document', async () => {
      const id = await draft({
        concentration: 'edp',
        intensity: 3,
        primary_family_id: familyId,
        secondary_family_id: otherFamilyId,
      });
      const row = (
        await app.query('select status, gender, search_document from products where id = $1', [id])
      ).rows[0];
      expect(row).toEqual({ status: 'draft', gender: 'unisex', search_document: '' });
    });

    it('keeps slugs unique', async () => {
      await draft({ slug: 'taken-slug' });
      await rejected(draft({ slug: 'taken-slug' }), PG_UNIQUE_VIOLATION, 'products_slug_uq');
    });

    it('keeps a brand while products use it', async () => {
      const ownBrand = await insert('brands', { slug: 'doomed', name_ar: 'ا', name_en: 'Doomed' });
      await draft({ brand_id: ownBrand });
      const error = await failure(app.query('delete from brands where id = $1', [ownBrand]));
      expect(pgErrorCode(error)).toBe(PG_RESTRICT_VIOLATION);
    });

    it('keeps updated_at current without the caller touching it', async () => {
      const id = await draft();
      const before = (
        await app.query('select created_at, updated_at from products where id = $1', [id])
      ).rows[0];
      await new Promise((resolve) => setTimeout(resolve, 15));
      await app.query(`update products set name_en = 'Changed' where id = $1`, [id]);
      const after = (
        await app.query('select created_at, updated_at from products where id = $1', [id])
      ).rows[0];
      expect(after.created_at).toEqual(before.created_at);
      expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    });

    it('finds Arabic text through the trigram index on search_document', async () => {
      await draft({ search_document: 'عود ملكي oud royal' });
      const index = await app.query(
        `select indexdef from pg_indexes where indexname = 'products_search_document_trgm_idx'`,
      );
      expect(index.rows[0].indexdef).toContain('gin_trgm_ops');
      const hits = await app.query(
        `select count(*)::int as n from products where word_similarity('عود', search_document) > 0.5`,
      );
      expect(hits.rows[0].n).toBeGreaterThan(0);
    });
  });

  // ----- publish gate -----
  describe('the publish gate', () => {
    it('lets a complete product become published', async () => {
      const id = await readyToPublish();
      await publish(id);
      const row = (await app.query('select status from products where id = $1', [id])).rows[0];
      expect(row.status).toBe('published');
    });

    it('rejects a new product that starts as published', async () => {
      await rejected(
        draft({ status: 'published', published_at: new Date() }),
        PG_CHECK_VIOLATION,
        'products_publish_requires_children',
      );
    });

    it('rejects publishing with fewer than 3 notes', async () => {
      const id = await readyToPublish();
      await app.query('delete from product_notes where product_id = $1 and note_id = $2', [
        id,
        noteIds[2],
      ]);
      await rejected(publish(id), PG_CHECK_VIOLATION, 'products_publish_requires_children');
    });

    it('rejects publishing without a live variant, and an archived variant does not count', async () => {
      const id = await readyToPublish();
      await app.query('update product_variants set archived_at = now() where product_id = $1', [
        id,
      ]);
      await rejected(publish(id), PG_CHECK_VIOLATION, 'products_publish_requires_children');
    });

    it('rejects publishing without an image that has Arabic alt text', async () => {
      const id = await readyToPublish();
      await app.query('delete from product_images where product_id = $1', [id]);
      await rejected(publish(id), PG_CHECK_VIOLATION, 'products_publish_requires_children');
      await app.query('insert into product_images (product_id, media_id) values ($1, $2)', [
        id,
        mediaWithoutAlt,
      ]);
      await rejected(publish(id), PG_CHECK_VIOLATION, 'products_publish_requires_children');
    });

    const missingField: [string, Values][] = [
      ['a description', { description_ar: null }],
      ['a category', { category_id: null }],
      ['a primary family', { primary_family_id: null }],
      ['an SEO title', { seo_title_ar: null }],
      ['an SEO description', { seo_description_ar: null }],
    ];
    it.each(missingField)('rejects publishing without %s', async (_label, values) => {
      const id = await readyToPublish();
      const columns = Object.keys(values);
      await app.query(
        `update products set ${columns.map((c) => `${c} = null`).join(', ')} where id = $1`,
        [id],
      );
      await rejected(publish(id), PG_CHECK_VIOLATION, 'products_published_required_fields');
    });

    it('requires a publish date on a published product', async () => {
      const id = await readyToPublish();
      await rejected(
        app.query(`update products set status = 'published' where id = $1`, [id]),
        PG_CHECK_VIOLATION,
        'products_published_has_timestamp',
      );
    });

    it('can archive a published product and then restore it as a draft', async () => {
      const id = await readyToPublish();
      await publish(id);
      await app.query(
        `update products set status = 'archived', archived_at = now() where id = $1`,
        [id],
      );
      await app.query(`update products set status = 'draft', archived_at = null where id = $1`, [
        id,
      ]);
    });
  });

  // ----- variants -----
  describe('product variants', () => {
    let productId: string;
    beforeAll(async () => {
      productId = await draft();
    });
    const rejectedValues: [string, string, Values][] = [
      ['a lower-case SKU', 'product_variants_sku_format', { sku: 'abc-1' }],
      ['a SKU with a space', 'product_variants_sku_format', { sku: 'AB 1' }],
      ['a one-letter SKU', 'product_variants_sku_format', { sku: 'A' }],
      ['a size of zero', 'product_variants_size_value_range', { size_value: 0 }],
      ['an unknown size unit', 'product_variants_size_unit_valid', { size_unit: 'kg' }],
      ['a price of zero', 'product_variants_price_range', { price_iqd: 0 }],
      ['a negative price', 'product_variants_price_range', { price_iqd: -5 }],
      ['a price above the ceiling', 'product_variants_price_range', { price_iqd: 100_000_001 }],
      [
        'a compare-at price equal to the price',
        'product_variants_compare_at_above_price',
        { price_iqd: 1000, compare_at_iqd: 1000 },
      ],
      [
        'a compare-at price below the price',
        'product_variants_compare_at_above_price',
        { price_iqd: 1000, compare_at_iqd: 900 },
      ],
    ];
    it.each(rejectedValues)('rejects %s', async (_label, constraint, values) => {
      await rejected(
        insert('product_variants', {
          product_id: productId,
          sku: `V-${next()}`,
          size_value: 50 + next(),
          price_iqd: 1000,
          ...values,
        }),
        PG_CHECK_VIOLATION,
        constraint,
      );
    });
    it('keeps SKUs unique across all products', async () => {
      await variant(productId, { sku: 'UNIQUE-1', size_value: 11 });
      const other = await draft();
      await rejected(
        variant(other, { sku: 'UNIQUE-1' }),
        PG_UNIQUE_VIOLATION,
        'product_variants_sku_uq',
      );
    });
    it('allows one live variant per size, and an archived variant frees its size', async () => {
      const id = await draft();
      const first = await variant(id, { size_value: 100, size_unit: 'ml' });
      await rejected(
        variant(id, { size_value: 100, size_unit: 'ml' }),
        PG_UNIQUE_VIOLATION,
        'product_variants_live_size_uq',
      );
      await variant(id, { size_value: 100, size_unit: 'g' });
      await app.query('update product_variants set archived_at = now() where id = $1', [first]);
      await variant(id, { size_value: 100, size_unit: 'ml' });
    });
    it('keeps a product while it has variants', async () => {
      const id = await draft();
      await variant(id);
      const error = await failure(app.query('delete from products where id = $1', [id]));
      expect(pgErrorCode(error)).toBe(PG_RESTRICT_VIOLATION);
    });
  });

  // ----- product links -----
  describe('product notes, tags and images', () => {
    it('rejects an unknown note position, a prominence out of range and a repeated note', async () => {
      const id = await draft();
      const link = (position: string, prominence: number, noteId = noteIds[0]) =>
        app.query(
          'insert into product_notes (product_id, note_id, position, prominence) values ($1, $2, $3, $4)',
          [id, noteId, position, prominence],
        );
      await rejected(link('middle', 2), PG_CHECK_VIOLATION, 'product_notes_position_valid');
      await rejected(link('top', 0), PG_CHECK_VIOLATION, 'product_notes_prominence_range');
      await rejected(link('top', 4), PG_CHECK_VIOLATION, 'product_notes_prominence_range');
      await link('top', 3);
      await rejected(link('base', 1), PG_UNIQUE_VIOLATION, 'product_notes_pk');
    });
    it('keeps a note while a product uses it, but removes links with the product', async () => {
      const id = await draft();
      await app.query(
        `insert into product_notes (product_id, note_id, position) values ($1, $2, 'top')`,
        [id, noteIds[3]],
      );
      const error = await failure(app.query('delete from notes where id = $1', [noteIds[3]]));
      expect(pgErrorCode(error)).toBe(PG_RESTRICT_VIOLATION);
      await app.query('delete from products where id = $1', [id]);
      const left = await app.query(
        'select count(*)::int as n from product_notes where product_id = $1',
        [id],
      );
      expect(left.rows[0].n).toBe(0);
    });
    it('limits image positions and does not allow the same image twice on one product', async () => {
      const id = await draft();
      const add = (position: number) =>
        app.query(
          'insert into product_images (product_id, media_id, position) values ($1, $2, $3)',
          [id, mediaWithAlt, position],
        );
      await rejected(add(20), PG_CHECK_VIOLATION, 'product_images_position_range');
      await rejected(add(-1), PG_CHECK_VIOLATION, 'product_images_position_range');
      await add(19);
      await rejected(add(0), PG_UNIQUE_VIOLATION, 'product_images_pk');
    });
    it('does not allow the same tag twice on one product', async () => {
      const id = await draft();
      const tag = await insert('tags', {
        type: 'occasion',
        slug: `t-${next()}`,
        name_ar: 'ا',
        name_en: 'T',
      });
      await app.query('insert into product_tags (product_id, tag_id) values ($1, $2)', [id, tag]);
      await rejected(
        app.query('insert into product_tags (product_id, tag_id) values ($1, $2)', [id, tag]),
        PG_UNIQUE_VIOLATION,
        'product_tags_pk',
      );
    });
  });

  // ----- collections -----
  describe('collections', () => {
    const base = () => ({
      slug: `c-${next()}`,
      kind: 'dynamic',
      name_ar: 'مجموعة',
      rules: '{"sort":"newest"}',
    });
    const rejectedValues: [string, string, Values][] = [
      ['an unknown kind', 'collections_kind_valid', { kind: 'random' }],
      ['a manual collection with rules', 'collections_rules_match_kind', { kind: 'manual' }],
      ['a dynamic collection without rules', 'collections_rules_match_kind', { rules: null }],
      [
        'a hybrid collection without rules',
        'collections_rules_match_kind',
        { kind: 'hybrid', rules: null },
      ],
      ['rules that are a list', 'collections_rules_object', { rules: '[1]' }],
      [
        'rules over 8 KB',
        'collections_rules_object',
        { rules: JSON.stringify({ blob: 'x'.repeat(8200) }) },
      ],
      ['an unknown status', 'collections_status_valid', { status: 'live' }],
      [
        'a schedule that ends before it starts',
        'collections_schedule_ordered',
        { starts_at: '2026-12-02T00:00:00Z', ends_at: '2026-12-01T00:00:00Z' },
      ],
      ['a home position of 0', 'collections_home_position_range', { home_position: 0 }],
      ['a home position of 13', 'collections_home_position_range', { home_position: 13 }],
      [
        'an archived status without a date',
        'collections_archived_at_matches_status',
        { status: 'archived' },
      ],
      [
        'a published status without a date',
        'collections_published_has_timestamp',
        { status: 'published' },
      ],
    ];
    it.each(rejectedValues)('rejects %s', async (_label, constraint, values) => {
      await rejected(
        insert('collections', { ...base(), ...values }),
        PG_CHECK_VIOLATION,
        constraint,
      );
    });
    it('accepts a manual collection without rules and a dynamic one with rules', async () => {
      await insert('collections', { slug: `m-${next()}`, kind: 'manual', name_ar: 'يدوية' });
      await insert('collections', base());
    });
    it('gives each home slot to one collection only', async () => {
      await insert('collections', { ...base(), home_position: 7 });
      await rejected(
        insert('collections', { ...base(), home_position: 7 }),
        PG_UNIQUE_VIOLATION,
        'collections_home_position_uq',
      );
    });
    it('ties a position to pinned items and leaves excluded items without one', async () => {
      const collection = await insert('collections', {
        slug: `h-${next()}`,
        kind: 'hybrid',
        name_ar: 'ا',
        rules: '{}',
      });
      const [a, b, c] = [await draft(), await draft(), await draft()];
      const add = (productId: string, mode: string, position: number | null) =>
        app.query(
          'insert into collection_products (collection_id, product_id, mode, position) values ($1, $2, $3, $4)',
          [collection, productId, mode, position],
        );
      await add(a, 'pinned', 0);
      await add(b, 'excluded', null);
      await rejected(
        add(c, 'pinned', null),
        PG_CHECK_VIOLATION,
        'collection_products_position_matches_mode',
      );
      await rejected(
        add(c, 'excluded', 1),
        PG_CHECK_VIOLATION,
        'collection_products_position_matches_mode',
      );
      await rejected(
        add(c, 'pinned', -1),
        PG_CHECK_VIOLATION,
        'collection_products_position_matches_mode',
      );
      await rejected(add(c, 'hidden', null), PG_CHECK_VIOLATION, 'collection_products_mode_valid');
      await rejected(add(a, 'pinned', 5), PG_UNIQUE_VIOLATION, 'collection_products_pk');
    });
  });

  // ----- slug redirects -----
  describe('slug redirects', () => {
    it('points each retired slug to one entity of one type', async () => {
      const entity = '0198a4b2-0000-7000-8000-000000000042';
      await insert('slug_redirects', {
        entity_type: 'product',
        entity_id: entity,
        old_slug: 'old-name',
      });
      await rejected(
        insert('slug_redirects', {
          entity_type: 'product',
          entity_id: brandId,
          old_slug: 'old-name',
        }),
        PG_UNIQUE_VIOLATION,
        'slug_redirects_old_slug_uq',
      );
      await insert('slug_redirects', {
        entity_type: 'brand',
        entity_id: brandId,
        old_slug: 'old-name',
      });
      await rejected(
        insert('slug_redirects', { entity_type: 'order', entity_id: entity, old_slug: 'x' }),
        PG_CHECK_VIOLATION,
        'slug_redirects_entity_type_valid',
      );
    });
  });

  // ----- rules that repeat across tables: one data table per rule -----
  describe('rules shared by many tables', () => {
    const slugFor = () => `s-${next()}`;
    /** A valid row per table, built when the test runs (ids exist only after beforeAll). */
    const validRow: Record<string, () => Values> = {
      brands: () => ({ slug: slugFor(), name_ar: 'ا', name_en: `Name ${next()}` }),
      categories: () => ({ slug: slugFor(), name_ar: 'ا', name_en: `Name ${next()}` }),
      families: () => ({ slug: slugFor(), name_ar: 'ا', name_en: `Name ${next()}` }),
      note_groups: () => ({ slug: slugFor(), name_ar: 'ا', name_en: `Name ${next()}` }),
      notes: () => ({
        group_id: noteGroupId,
        slug: slugFor(),
        name_ar: 'ا',
        name_en: `Name ${next()}`,
      }),
      tags: () => ({ type: 'mood', slug: slugFor(), name_ar: 'ا', name_en: `Name ${next()}` }),
      collections: () => ({ slug: slugFor(), kind: 'manual', name_ar: 'ا' }),
      products: () => ({ slug: slugFor(), brand_id: brandId, name_ar: 'ا' }),
      media_assets: () => ({
        storage_key: `m/${next().toString().padStart(8, '0')}shr`,
        width: 800,
        height: 800,
        byte_size: 10,
      }),
    };

    // [table, column, constraint, longest allowed length]
    const bounded: [string, string, string, number][] = [
      ['brands', 'story_en', 'brands_story_en_valid', 5000],
      ['categories', 'name_ar', 'categories_name_ar_valid', 200],
      ['categories', 'name_en', 'categories_name_en_valid', 200],
      ['families', 'name_ar', 'families_name_ar_valid', 200],
      ['families', 'name_en', 'families_name_en_valid', 200],
      ['note_groups', 'name_ar', 'note_groups_name_ar_valid', 200],
      ['note_groups', 'name_en', 'note_groups_name_en_valid', 200],
      ['notes', 'name_ar', 'notes_name_ar_valid', 200],
      ['notes', 'name_en', 'notes_name_en_valid', 200],
      ['tags', 'name_ar', 'tags_name_ar_valid', 200],
      ['tags', 'name_en', 'tags_name_en_valid', 200],
      ['collections', 'name_ar', 'collections_name_ar_valid', 200],
      ['collections', 'name_en', 'collections_name_en_valid', 200],
      ['collections', 'description_ar', 'collections_description_ar_valid', 10_000],
      ['collections', 'description_en', 'collections_description_en_valid', 10_000],
      ['products', 'description_en', 'products_description_en_valid', 10_000],
      ['products', 'seo_title_en', 'products_seo_title_en_valid', 120],
      ['products', 'seo_description_ar', 'products_seo_description_ar_valid', 400],
      ['media_assets', 'original_label', 'media_assets_original_label_valid', 200],
    ];
    it.each(bounded)(
      '%s.%s rejects blank and over-long text',
      async (table, column, constraint, max) => {
        const row = validRow[table] as () => Values;
        for (const bad of ['', '   ', 'x'.repeat(max + 1)]) {
          await rejected(
            insert(table, { ...row(), [column]: bad }),
            PG_CHECK_VIOLATION,
            constraint,
          );
        }
        await insert(table, { ...row(), [column]: 'x'.repeat(max) });
      },
    );

    // [table, column holding the unique value, constraint]
    const unique: [string, string, string][] = [
      ['categories', 'slug', 'categories_slug_uq'],
      ['collections', 'slug', 'collections_slug_uq'],
      ['families', 'slug', 'families_slug_uq'],
      ['note_groups', 'slug', 'note_groups_slug_uq'],
      ['notes', 'slug', 'notes_slug_uq'],
      ['media_assets', 'storage_key', 'media_assets_storage_key_uq'],
    ];
    it.each(unique)('%s keeps %s unique', async (table, column, constraint) => {
      const row = validRow[table] as () => Values;
      const first = row();
      await insert(table, first);
      await rejected(
        insert(table, { ...row(), [column]: first[column] }),
        PG_UNIQUE_VIOLATION,
        constraint,
      );
    });

    it('notes reject a slug that is not Latin lower-case', async () => {
      for (const slug of ['Bad Slug', '-lead', 'عود', 'UP']) {
        await rejected(
          insert('notes', { ...(validRow.notes as () => Values)(), slug }),
          PG_CHECK_VIOLATION,
          'notes_slug_format',
        );
      }
    });

    it('media variants reject a path-like storage key and zero bytes', async () => {
      const id = await media({ alt_ar: 'ا' });
      await rejected(
        insert('media_variants', {
          media_id: id,
          width: 480,
          storage_key: '../../x',
          byte_size: 10,
        }),
        PG_CHECK_VIOLATION,
        'media_variants_storage_key_format',
      );
      await rejected(
        insert('media_variants', {
          media_id: id,
          width: 480,
          storage_key: `m/${next().toString().padStart(8, '0')}ok`,
          byte_size: 0,
        }),
        PG_CHECK_VIOLATION,
        'media_variants_byte_size_positive',
      );
    });

    // updated_at is the database's job on every table that has it.
    it.each(['brands', 'categories', 'notes', 'products', 'collections'])(
      '%s gets a fresh updated_at on every update',
      async (table) => {
        const id = await insert(table, (validRow[table] as () => Values)());
        const read = async () =>
          (await app.query(`select updated_at from ${table} where id = $1`, [id])).rows[0]
            .updated_at as Date;
        const before = await read();
        await new Promise((resolve) => setTimeout(resolve, 15));
        await app.query(`update ${table} set created_at = created_at where id = $1`, [id]);
        expect((await read()).getTime()).toBeGreaterThan(before.getTime());
      },
    );
    it('product variants get a fresh updated_at on every update', async () => {
      const id = await variant(await draft());
      const read = async () =>
        (await app.query('select updated_at from product_variants where id = $1', [id])).rows[0]
          .updated_at as Date;
      const before = await read();
      await new Promise((resolve) => setTimeout(resolve, 15));
      await app.query('update product_variants set created_at = created_at where id = $1', [id]);
      expect((await read()).getTime()).toBeGreaterThan(before.getTime());
    });

    it('has exactly the triggers the design relies on', async () => {
      const result = await app.query(
        `select tgname from pg_trigger where not tgisinternal order by tgname`,
      );
      expect(
        result.rows.map((row) => row.tgname).filter((name) => !name.startsWith('audit')),
      ).toEqual(
        [
          'brands_set_updated_at',
          'categories_max_depth',
          'categories_set_updated_at',
          'collections_set_updated_at',
          'notes_set_updated_at',
          'product_variants_set_updated_at',
          'products_publish_gate',
          'products_set_updated_at',
        ].sort(),
      );
    });

    // What happens to dependent rows when a parent is deleted is a design decision: link rows
    // follow their owner (cascade), anything that gives meaning to a row is protected (restrict).
    const foreignKeys: [string, 'cascade' | 'restrict'][] = [
      ['brands_logo_media_id_media_assets_id_fk', 'restrict'],
      ['categories_parent_id_categories_id_fk', 'restrict'],
      ['collection_products_collection_id_collections_id_fk', 'cascade'],
      ['collection_products_product_id_products_id_fk', 'cascade'],
      ['collections_cover_media_id_media_assets_id_fk', 'restrict'],
      ['family_adjacency_adjacent_family_id_families_id_fk', 'restrict'],
      ['family_adjacency_family_id_families_id_fk', 'restrict'],
      ['media_variants_media_id_media_assets_id_fk', 'cascade'],
      ['note_aliases_note_id_notes_id_fk', 'cascade'],
      ['notes_group_id_note_groups_id_fk', 'restrict'],
      ['product_images_media_id_media_assets_id_fk', 'restrict'],
      ['product_images_product_id_products_id_fk', 'cascade'],
      ['product_notes_note_id_notes_id_fk', 'restrict'],
      ['product_notes_product_id_products_id_fk', 'cascade'],
      ['product_tags_product_id_products_id_fk', 'cascade'],
      ['product_tags_tag_id_tags_id_fk', 'restrict'],
      ['product_variants_product_id_products_id_fk', 'restrict'],
      ['products_brand_id_brands_id_fk', 'restrict'],
      ['products_category_id_categories_id_fk', 'restrict'],
      ['products_primary_family_id_families_id_fk', 'restrict'],
      ['products_secondary_family_id_families_id_fk', 'restrict'],
    ];
    it('has every foreign key, each with its intended delete behaviour', async () => {
      const result = await app.query(
        `select conname, confdeltype from pg_constraint
         where contype = 'f' and connamespace = 'public'::regnamespace`,
      );
      const actual = Object.fromEntries(
        result.rows
          .filter((row) => !String(row.conname).startsWith('audit'))
          .map((row) => [
            row.conname as string,
            row.confdeltype === 'c' ? 'cascade' : row.confdeltype === 'r' ? 'restrict' : 'other',
          ]),
      );
      expect(actual).toEqual(Object.fromEntries(foreignKeys));
    });
  });
});
