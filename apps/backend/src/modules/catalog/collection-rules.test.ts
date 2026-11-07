// The SQL the collection rules compile to, read as text (no database). The golden strings are the
// contract: a change to the generated SQL must be a deliberate edit of this file.

import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { compileCollectionRules, parseCollectionRules } from './collection-rules.js';
import { CatalogError } from './errors.js';

const dialect = new PgDialect();
const id = (n: number) => `0198a4b2-0000-7000-8000-${String(n).padStart(12, '0')}`;

/** The WHERE and ORDER BY as `{ sql, params }`, the way they would be sent to PostgreSQL. */
function render(rules: unknown, options?: { publishedOnly?: boolean }) {
  const compiled = compileCollectionRules(rules, options);
  return {
    where: dialect.sqlToQuery(compiled.where),
    orderBy: compiled.orderBy.map((fragment) => dialect.sqlToQuery(fragment)),
    limit: compiled.limit,
  };
}

describe('golden SQL', () => {
  it('brand filter, newest first', () => {
    const { where, orderBy, limit } = render({ brandIds: [id(1), id(2)] });
    expect(where.sql).toMatchInlineSnapshot(
      `"("products"."status" = $1 and "products"."brand_id" in ($2, $3))"`,
    );
    expect(where.params).toEqual(['published', id(1), id(2)]);
    expect(orderBy.map((o) => o.sql)).toMatchInlineSnapshot(`
      [
        ""products"."published_at" desc nulls last",
        ""products"."id" desc",
      ]
    `);
    expect(limit).toBe(24);
  });

  it('category filter includes the sub-categories', () => {
    const { where } = render({ categoryIds: [id(1)] });
    expect(where.sql).toMatchInlineSnapshot(
      `"("products"."status" = $1 and ("products"."category_id" in ($2) or "products"."category_id" in (select "categories"."id" from "categories" where "categories"."parent_id" in ($3))))"`,
    );
    expect(where.params).toEqual(['published', id(1), id(1)]);
  });

  it('family filter looks at the primary and the secondary family', () => {
    const { where } = render({ familyIds: [id(1)] });
    expect(where.sql).toMatchInlineSnapshot(
      `"("products"."status" = $1 and ("products"."primary_family_id" in ($2) or "products"."secondary_family_id" in ($3)))"`,
    );
    expect(where.params).toEqual(['published', id(1), id(1)]);
  });

  it('notes: any, and all', () => {
    const any = render({ noteIds: [id(1), id(2)] });
    expect(any.where.sql).toMatchInlineSnapshot(
      `"("products"."status" = $1 and exists (select 1 from "product_notes" where "product_notes"."product_id" = "products"."id" and "product_notes"."note_id" in ($2, $3)))"`,
    );
    expect(any.where.params).toEqual(['published', id(1), id(2)]);

    const all = render({ noteIds: [id(1), id(2)], noteMatch: 'all' });
    expect(all.where.sql).toMatchInlineSnapshot(
      `"("products"."status" = $1 and (select count(*) from "product_notes" where "product_notes"."product_id" = "products"."id" and "product_notes"."note_id" in ($2, $3)) = $4)"`,
    );
    // The number of notes is a parameter too.
    expect(all.where.params).toEqual(['published', id(1), id(2), 2]);
  });

  it('tags', () => {
    const { where } = render({ tagIds: [id(7)] });
    expect(where.sql).toMatchInlineSnapshot(
      `"("products"."status" = $1 and exists (select 1 from "product_tags" where "product_tags"."product_id" = "products"."id" and "product_tags"."tag_id" in ($2)))"`,
    );
    expect(where.params).toEqual(['published', id(7)]);
  });

  it('genders and concentrations', () => {
    const { where } = render({ genders: ['women', 'unisex'], concentrations: ['edp'] });
    expect(where.sql).toMatchInlineSnapshot(
      `"("products"."status" = $1 and "products"."gender" in ($2, $3) and "products"."concentration" in ($4))"`,
    );
    expect(where.params).toEqual(['published', 'women', 'unisex', 'edp']);
  });

  it('price range, one bound or both, on live variants only', () => {
    const both = render({ priceMin: 50_000, priceMax: 200_000 });
    expect(both.where.sql).toMatchInlineSnapshot(
      `"("products"."status" = $1 and exists (select 1 from "product_variants" where "product_variants"."product_id" = "products"."id" and "product_variants"."archived_at" is null and ("product_variants"."price_iqd" >= $2 and "product_variants"."price_iqd" <= $3)))"`,
    );
    expect(both.where.params).toEqual(['published', 50_000, 200_000]);

    const minOnly = render({ priceMin: 50_000 });
    expect(minOnly.where.params).toEqual(['published', 50_000]);
    expect(minOnly.where.sql).not.toContain('<=');
    const maxOnly = render({ priceMax: 200_000 });
    expect(maxOnly.where.params).toEqual(['published', 200_000]);
    expect(maxOnly.where.sql).not.toContain('>=');
  });

  it('every sort has its own ordering, always ending on the id so pages are stable', () => {
    const sorted = (sort: string) => render({ brandIds: [id(1)], sort }).orderBy.map((o) => o.sql);
    expect(sorted('newest')).toMatchInlineSnapshot(`
      [
        ""products"."published_at" desc nulls last",
        ""products"."id" desc",
      ]
    `);
    expect(sorted('price_asc')).toMatchInlineSnapshot(`
      [
        "(select min("product_variants"."price_iqd") from "product_variants" where "product_variants"."product_id" = "products"."id" and "product_variants"."archived_at" is null) asc nulls last",
        ""products"."id" asc",
      ]
    `);
    expect(sorted('price_desc')).toMatchInlineSnapshot(`
      [
        "(select min("product_variants"."price_iqd") from "product_variants" where "product_variants"."product_id" = "products"."id" and "product_variants"."archived_at" is null) desc nulls last",
        ""products"."id" desc",
      ]
    `);
    expect(sorted('name')).toMatchInlineSnapshot(`
      [
        ""products"."name_ar" asc",
        ""products"."id" asc",
      ]
    `);
  });

  it('can include unpublished products for a Studio preview', () => {
    const { where } = render({ brandIds: [id(1)] }, { publishedOnly: false });
    expect(where.sql).not.toContain('status');
    expect(where.params).toEqual([id(1)]);
  });

  it('combines every filter with AND', () => {
    const { where, limit } = render({
      brandIds: [id(1)],
      categoryIds: [id(2)],
      genders: ['men'],
      priceMax: 100_000,
      limit: 10,
    });
    expect(where.sql.match(/ and /g)?.length).toBeGreaterThanOrEqual(4);
    expect(limit).toBe(10);
  });
});

describe('the compiler is fully parameterized', () => {
  const everything = {
    brandIds: [id(1), id(2)],
    categoryIds: [id(3)],
    familyIds: [id(4)],
    noteIds: [id(5), id(6)],
    noteMatch: 'all',
    tagIds: [id(7)],
    genders: ['women', 'men'],
    concentrations: ['edp', 'oil'],
    priceMin: 12_345,
    priceMax: 98_765,
  };

  it('puts no value into the SQL text: ids, enums and prices are all parameters', () => {
    for (const sort of ['newest', 'price_asc', 'price_desc', 'name']) {
      const { where, orderBy } = render({ ...everything, sort });
      const text = [where.sql, ...orderBy.map((o) => o.sql)].join(' ');
      for (const value of [
        '0198a4b2',
        'women',
        'men',
        'edp',
        'oil',
        '12345',
        '98765',
        // Quoted: the identifier "published_at" legitimately contains the word.
        "'published'",
      ]) {
        expect(text, `${value} in the SQL text`).not.toContain(value);
      }
      for (const value of [id(1), id(7), 'women', 'oil', 12_345, 98_765, 'published']) {
        expect(where.params).toContain(value);
      }
    }
  });

  it('names only whitelisted tables and columns', () => {
    const allowed = new Set([
      'products',
      'product_variants',
      'product_notes',
      'product_tags',
      'categories',
      'id',
      'status',
      'brand_id',
      'category_id',
      'primary_family_id',
      'secondary_family_id',
      'gender',
      'concentration',
      'published_at',
      'name_ar',
      'product_id',
      'note_id',
      'tag_id',
      'parent_id',
      'price_iqd',
      'archived_at',
    ]);
    for (const sort of ['newest', 'price_asc', 'price_desc', 'name']) {
      const { where, orderBy } = render({ ...everything, sort });
      const text = [where.sql, ...orderBy.map((o) => o.sql)].join(' ');
      const identifiers = [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? '');
      expect(identifiers.length).toBeGreaterThan(10);
      for (const identifier of identifiers) {
        expect(allowed.has(identifier), `unexpected identifier ${identifier}`).toBe(true);
      }
    }
  });

  it('the placeholders are numbered in order and match the parameter count', () => {
    const { where } = render(everything);
    const placeholders = [...where.sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...placeholders)).toBe(where.params.length);
    expect(new Set(placeholders).size).toBe(where.params.length);
  });
});

describe('the compiler rejects anything outside the whitelist', () => {
  const rejected = (rules: unknown) => {
    try {
      compileCollectionRules(rules);
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogError);
      expect((error as CatalogError).reason).toBe('collection_rules_invalid');
      return error as CatalogError;
    }
    throw new Error('The rules were accepted.');
  };

  it.each([
    ['an unknown field', { brandIds: [id(1)], where: '1=1' }],
    ['a SQL fragment in an id', { brandIds: ["x'); drop table products; --"] }],
    ['a SQL fragment as the sort', { brandIds: [id(1)], sort: 'price; drop table products' }],
    ['a column name as the sort', { brandIds: [id(1)], sort: 'cost_iqd' }],
    ['an unknown gender', { genders: ["women' or '1'='1"] }],
    ['a price as text', { priceMin: '1; select 1' }],
    ['an object where an id is expected', { brandIds: [{ $ne: null }] }],
    ['a string where a list is expected', { brandIds: id(1) }],
    ['no filter at all', {}],
    ['a null rules object', null],
    ['a text rules value', 'brandIds'],
    ['a list rules value', [id(1)]],
    ['an unsupported stock rule', { brandIds: [id(1)], inStockOnly: true }],
  ])('%s', (_label, rules) => {
    rejected(rules);
  });

  it('reports which fields are wrong, but never their values', () => {
    const error = rejected({ brandIds: ["x'); drop table products; --"], sort: 'zzz-secret' });
    expect(error.details.problems).toEqual(expect.arrayContaining(['brandIds.0', 'sort']));
    expect(JSON.stringify(error.details)).not.toContain('drop table');
    expect(JSON.stringify(error.details)).not.toContain('zzz-secret');
  });
});

describe('parseCollectionRules', () => {
  it('fills the defaults', () => {
    expect(parseCollectionRules({ tagIds: [id(1)] })).toMatchObject({
      noteMatch: 'any',
      sort: 'newest',
      limit: 24,
    });
  });
});
