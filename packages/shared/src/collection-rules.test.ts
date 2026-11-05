import { describe, expect, it } from 'vitest';
import { COLLECTION_RULES_MAX_BYTES, CONCENTRATIONS, GENDERS } from './catalog-constants.js';
import {
  COLLECTION_FILTER_KEYS,
  COLLECTION_RULE_DEFAULT_LIMIT,
  COLLECTION_RULE_MAX_IDS,
  collectionInputSchema,
  collectionItemsSchema,
  collectionRulesSchema,
} from './collection-rules.js';

const id = (n: number) => `0198a4b2-0000-7000-8000-${String(n).padStart(12, '0')}`;
const ids = (count: number, from = 1) => Array.from({ length: count }, (_, i) => id(from + i));

describe('collectionRulesSchema', () => {
  it('fills in the defaults: any note, newest first, 24 results', () => {
    const rules = collectionRulesSchema.parse({ brandIds: [id(1)] });
    expect(rules).toEqual({
      brandIds: [id(1)],
      noteMatch: 'any',
      sort: 'newest',
      limit: COLLECTION_RULE_DEFAULT_LIMIT,
    });
  });

  it('accepts every filter at once', () => {
    const result = collectionRulesSchema.safeParse({
      brandIds: ids(2),
      categoryIds: ids(1, 10),
      familyIds: ids(2, 20),
      noteIds: ids(3, 30),
      noteMatch: 'all',
      tagIds: ids(1, 40),
      genders: ['women', 'unisex'],
      concentrations: ['edp', 'parfum'],
      priceMin: 50_000,
      priceMax: 300_000,
      sort: 'price_asc',
      limit: 50,
    });
    expect(result.success).toBe(true);
  });

  it.each(COLLECTION_FILTER_KEYS)('%s alone is enough to make valid rules', (key) => {
    const sample: Record<string, unknown> = {
      brandIds: [id(1)],
      categoryIds: [id(1)],
      familyIds: [id(1)],
      noteIds: [id(1)],
      tagIds: [id(1)],
      genders: ['men'],
      concentrations: ['oil'],
      priceMin: 1000,
      priceMax: 2000,
    };
    expect(collectionRulesSchema.safeParse({ [key]: sample[key] }).success).toBe(true);
  });

  it('needs at least one filter: sort and limit alone would select every product', () => {
    expect(collectionRulesSchema.safeParse({}).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ sort: 'name', limit: 10 }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ noteMatch: 'all' }).success).toBe(false);
  });

  it('rejects unknown keys: only whitelisted fields can ever reach the SQL builder', () => {
    for (const extra of [
      { where: '1=1' },
      { orderBy: 'price' },
      { inStockOnly: true },
      { sql: 'drop table products' },
      { 'brandIds; drop table x': [id(1)] },
      { constructor: 'x' },
    ]) {
      const parsed = collectionRulesSchema.safeParse({ brandIds: [id(1)], ...extra });
      expect(parsed.success, JSON.stringify(extra)).toBe(false);
    }
    // A JSON payload can carry an own "__proto__" key; it must be rejected like any other unknown key.
    const fromJson = JSON.parse(`{"brandIds":["${id(1)}"],"__proto__":{"admin":true}}`);
    expect(collectionRulesSchema.safeParse(fromJson).success).toBe(false);
  });

  it('rejects ids that are not uuids, so no text from the rules can become SQL', () => {
    for (const bad of ["x' OR '1'='1", '1; DROP TABLE products', '', 123, null, { $ne: 1 }]) {
      expect(collectionRulesSchema.safeParse({ brandIds: [bad] }).success).toBe(false);
    }
  });

  it('rejects empty lists, repeated ids and lists over the limit', () => {
    expect(collectionRulesSchema.safeParse({ brandIds: [] }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ brandIds: [id(1), id(1)] }).success).toBe(false);
    expect(
      collectionRulesSchema.safeParse({ brandIds: ids(COLLECTION_RULE_MAX_IDS) }).success,
    ).toBe(true);
    expect(
      collectionRulesSchema.safeParse({ brandIds: ids(COLLECTION_RULE_MAX_IDS + 1) }).success,
    ).toBe(false);
  });

  it('only allows the known genders, concentrations, sorts and match modes', () => {
    expect(collectionRulesSchema.safeParse({ genders: ['kids'] }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ genders: ['men', 'men'] }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ genders: [...GENDERS] }).success).toBe(true);
    expect(collectionRulesSchema.safeParse({ concentrations: ['cologne'] }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ concentrations: [...CONCENTRATIONS] }).success).toBe(
      true,
    );
    expect(collectionRulesSchema.safeParse({ brandIds: [id(1)], sort: 'random' }).success).toBe(
      false,
    );
    expect(collectionRulesSchema.safeParse({ brandIds: [id(1)], sort: 'price; --' }).success).toBe(
      false,
    );
    expect(collectionRulesSchema.safeParse({ noteIds: [id(1)], noteMatch: 'none' }).success).toBe(
      false,
    );
  });

  it('validates prices and the limit', () => {
    expect(collectionRulesSchema.safeParse({ priceMin: 0 }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ priceMin: 10.5 }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ priceMin: '100' }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ priceMin: 500, priceMax: 100 }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ priceMin: 100, priceMax: 100 }).success).toBe(true);
    expect(collectionRulesSchema.safeParse({ brandIds: [id(1)], limit: 0 }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ brandIds: [id(1)], limit: 101 }).success).toBe(false);
    expect(collectionRulesSchema.safeParse({ brandIds: [id(1)], limit: 100 }).success).toBe(true);
    expect(collectionRulesSchema.safeParse({ brandIds: [id(1)], limit: 2.5 }).success).toBe(false);
  });

  it('the largest valid rules always fit the database size limit', () => {
    const largest = collectionRulesSchema.parse({
      brandIds: ids(COLLECTION_RULE_MAX_IDS, 100),
      categoryIds: ids(COLLECTION_RULE_MAX_IDS, 200),
      familyIds: ids(COLLECTION_RULE_MAX_IDS, 300),
      noteIds: ids(COLLECTION_RULE_MAX_IDS, 400),
      tagIds: ids(COLLECTION_RULE_MAX_IDS, 500),
      genders: [...GENDERS],
      concentrations: [...CONCENTRATIONS],
      priceMin: 1,
      priceMax: 100_000_000,
      noteMatch: 'all',
      sort: 'price_desc',
      limit: 100,
    });
    // jsonb prints ", " and ": " with a space, so measure that form (it is longer than JSON.stringify).
    // The text is pure ASCII (uuids and key names), so its length in characters is its length in bytes.
    const asJsonb = JSON.stringify(largest).replace(/([,:])(?=["[\d{tfn])/g, '$1 ');
    expect(asJsonb.length).toBeLessThan(COLLECTION_RULES_MAX_BYTES);
  });
});

describe('collectionInputSchema', () => {
  const base = { nameAr: 'مجموعة الصيف', slug: 'summer' };

  it('a manual collection has no rules', () => {
    expect(collectionInputSchema.safeParse({ kind: 'manual', ...base }).success).toBe(true);
    expect(
      collectionInputSchema.safeParse({ kind: 'manual', ...base, rules: { brandIds: [id(1)] } })
        .success,
    ).toBe(false);
  });

  it('dynamic and hybrid collections must have valid rules', () => {
    for (const kind of ['dynamic', 'hybrid'] as const) {
      expect(collectionInputSchema.safeParse({ kind, ...base }).success, kind).toBe(false);
      expect(collectionInputSchema.safeParse({ kind, ...base, rules: {} }).success, kind).toBe(
        false,
      );
      expect(
        collectionInputSchema.safeParse({ kind, ...base, rules: { brandIds: [id(1)] } }).success,
        kind,
      ).toBe(true);
    }
  });

  it('stores the rules with their defaults filled in', () => {
    const parsed = collectionInputSchema.parse({
      kind: 'dynamic',
      ...base,
      rules: { genders: ['women'] },
    });
    expect(parsed.kind === 'dynamic' && parsed.rules).toEqual({
      genders: ['women'],
      noteMatch: 'any',
      sort: 'newest',
      limit: COLLECTION_RULE_DEFAULT_LIMIT,
    });
  });

  it('rejects an unknown kind and unknown keys', () => {
    expect(collectionInputSchema.safeParse({ kind: 'smart', ...base }).success).toBe(false);
    expect(
      collectionInputSchema.safeParse({ kind: 'manual', ...base, status: 'published' }).success,
    ).toBe(false);
  });

  it('the schedule must end after it starts, and home position is 1 to 12', () => {
    const schedule = (startsAt: string, endsAt: string) =>
      collectionInputSchema.safeParse({ kind: 'manual', ...base, startsAt, endsAt }).success;
    expect(schedule('2026-12-01T00:00:00Z', '2026-12-02T00:00:00Z')).toBe(true);
    expect(schedule('2026-12-02T00:00:00Z', '2026-12-01T00:00:00Z')).toBe(false);
    expect(schedule('2026-12-01T00:00:00Z', '2026-12-01T00:00:00Z')).toBe(false);
    expect(schedule('tomorrow', '2026-12-01T00:00:00Z')).toBe(false);

    for (const [homePosition, ok] of [
      [1, true],
      [12, true],
      [0, false],
      [13, false],
    ] as const) {
      expect(
        collectionInputSchema.safeParse({ kind: 'manual', ...base, homePosition }).success,
      ).toBe(ok);
    }
  });
});

describe('collectionItemsSchema', () => {
  it('pinned items carry a position, excluded items do not', () => {
    expect(
      collectionItemsSchema.safeParse([
        { mode: 'pinned', productId: id(1), position: 0 },
        { mode: 'pinned', productId: id(2), position: 1 },
        { mode: 'excluded', productId: id(3) },
      ]).success,
    ).toBe(true);
    expect(collectionItemsSchema.safeParse([{ mode: 'pinned', productId: id(1) }]).success).toBe(
      false,
    );
    expect(
      collectionItemsSchema.safeParse([{ mode: 'excluded', productId: id(1), position: 1 }])
        .success,
    ).toBe(false);
  });

  it('a product appears once, as pinned or excluded', () => {
    expect(
      collectionItemsSchema.safeParse([
        { mode: 'pinned', productId: id(1), position: 0 },
        { mode: 'excluded', productId: id(1) },
      ]).success,
    ).toBe(false);
  });

  it('rejects an unknown mode and more than 200 items', () => {
    expect(collectionItemsSchema.safeParse([{ mode: 'hidden', productId: id(1) }]).success).toBe(
      false,
    );
    const many = ids(201).map((productId) => ({ mode: 'excluded' as const, productId }));
    expect(collectionItemsSchema.safeParse(many).success).toBe(false);
  });
});
