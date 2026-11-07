// Collection rules to SQL (ADR-0012). The stored `rules` JSON is DATA: it is re-validated here with the
// strict schema from @scentiq/shared (so a row edited by hand cannot smuggle in a field), and every
// value becomes a bound parameter. The only text that reaches the SQL string is table and column
// names written in THIS file, plus the sort, which is chosen from a fixed map by key.
//
// What a collection returns (published products only; `publishedOnly: false` is for Studio previews):
//   manual   the pinned products, in their saved order
//   dynamic  the products that match the rules, sorted, at most `limit`
//   hybrid   the pinned products first, then the matching ones, without the pinned and the excluded
//            ones, at most `limit` of the matching ones (pinned products are never cut)
// Stock ("in stock only") is not a rule until the inventory ledger exists (Phase 6A).

import { COLLECTION_KINDS, type CollectionRules, collectionRulesSchema } from '@scentiq/shared';
import { and, asc, desc, eq, inArray, or, type SQL, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import { collectionProducts } from '../../db/schema/collections.js';
import { productNotes, products, productTags, productVariants } from '../../db/schema/products.js';
import { categories } from '../../db/schema/taxonomy.js';
import { CatalogError } from './errors.js';

/** Validates stored or submitted rules. Only the paths of the problems are reported, never values. */
export function parseCollectionRules(raw: unknown): CollectionRules {
  const result = collectionRulesSchema.safeParse(raw);
  if (!result.success) {
    throw new CatalogError('invalid', 'collection_rules_invalid', {
      problems: result.error.issues.map((issue) => issue.path.join('.') || '(rules)'),
    });
  }
  return result.data;
}

/** The cheapest live variant: what a shopper sees as "from X IQD". */
const lowestLivePrice = sql`(select min(${productVariants.priceIqd}) from ${productVariants} where ${productVariants.productId} = ${products.id} and ${productVariants.archivedAt} is null)`;

/** The only orderings a rule can ask for. A key outside this map cannot reach the SQL. */
const ORDER_BY: Record<CollectionRules['sort'], SQL[]> = {
  newest: [sql`${products.publishedAt} desc nulls last`, desc(products.id)],
  price_asc: [sql`${lowestLivePrice} asc nulls last`, asc(products.id)],
  price_desc: [sql`${lowestLivePrice} desc nulls last`, desc(products.id)],
  // Arabic name, in database order: Arabic letters sit in alphabetical order in Unicode.
  name: [asc(products.nameAr), asc(products.id)],
};

export interface CompiledRules {
  where: SQL;
  orderBy: SQL[];
  limit: number;
}

/**
 * Turns validated rules into a WHERE clause, an ORDER BY and a limit. Pure: it builds fragments and
 * runs nothing, so it is tested by reading the SQL it produces.
 */
export function compileCollectionRules(
  raw: unknown,
  options: { publishedOnly?: boolean } = {},
): CompiledRules {
  const rules = parseCollectionRules(raw);
  const conditions: SQL[] = [];

  if (options.publishedOnly ?? true) conditions.push(eq(products.status, 'published'));

  if (rules.brandIds) conditions.push(inArray(products.brandId, rules.brandIds));

  if (rules.categoryIds) {
    // A category also matches the products of its sub-categories (the tree is two levels deep).
    const children = sql`(select ${categories.id} from ${categories} where ${inArray(categories.parentId, rules.categoryIds)})`;
    const either = or(
      inArray(products.categoryId, rules.categoryIds),
      sql`${products.categoryId} in ${children}`,
    );
    if (either) conditions.push(either);
  }

  if (rules.familyIds) {
    const either = or(
      inArray(products.primaryFamilyId, rules.familyIds),
      inArray(products.secondaryFamilyId, rules.familyIds),
    );
    if (either) conditions.push(either);
  }

  if (rules.noteIds) {
    conditions.push(
      rules.noteMatch === 'all'
        ? // Every listed note: the product has as many matching note rows as the rule lists notes
          // (a product has each note at most once, enforced by the primary key).
          sql`(select count(*) from ${productNotes} where ${productNotes.productId} = ${products.id} and ${inArray(productNotes.noteId, rules.noteIds)}) = ${rules.noteIds.length}`
        : sql`exists (select 1 from ${productNotes} where ${productNotes.productId} = ${products.id} and ${inArray(productNotes.noteId, rules.noteIds)})`,
    );
  }

  if (rules.tagIds) {
    conditions.push(
      sql`exists (select 1 from ${productTags} where ${productTags.productId} = ${products.id} and ${inArray(productTags.tagId, rules.tagIds)})`,
    );
  }

  if (rules.genders) conditions.push(inArray(products.gender, rules.genders));
  if (rules.concentrations) conditions.push(inArray(products.concentration, rules.concentrations));

  if (rules.priceMin !== undefined || rules.priceMax !== undefined) {
    // Some live variant is inside the range. Bounds are optional and independent.
    const bounds: SQL[] = [];
    if (rules.priceMin !== undefined)
      bounds.push(sql`${productVariants.priceIqd} >= ${rules.priceMin}`);
    if (rules.priceMax !== undefined)
      bounds.push(sql`${productVariants.priceIqd} <= ${rules.priceMax}`);
    conditions.push(
      sql`exists (select 1 from ${productVariants} where ${productVariants.productId} = ${products.id} and ${productVariants.archivedAt} is null and ${and(...bounds)})`,
    );
  }

  return {
    where: and(...conditions) ?? sql`true`,
    orderBy: ORDER_BY[rules.sort],
    limit: rules.limit,
  };
}

export interface CollectionForQuery {
  id: string;
  kind: string;
  rules: unknown;
}

/**
 * The ids of the products in a collection, in display order. Ids only: the storefront (Phase 4)
 * loads the cards for them.
 */
export async function findCollectionProductIds(
  executor: DbExecutor,
  collection: CollectionForQuery,
  options: { publishedOnly?: boolean } = {},
): Promise<string[]> {
  const kind = COLLECTION_KINDS.find((k) => k === collection.kind);
  if (kind === undefined) throw new CatalogError('invalid', 'collection_kind_invalid');
  const publishedOnly = options.publishedOnly ?? true;

  const pinned = async (): Promise<string[]> => {
    const rows = await executor
      .select({ id: collectionProducts.productId })
      .from(collectionProducts)
      .innerJoin(products, eq(products.id, collectionProducts.productId))
      .where(
        and(
          eq(collectionProducts.collectionId, collection.id),
          eq(collectionProducts.mode, 'pinned'),
          publishedOnly ? eq(products.status, 'published') : undefined,
        ),
      )
      .orderBy(asc(collectionProducts.position), asc(collectionProducts.productId));
    return rows.map((r) => r.id);
  };

  if (kind === 'manual') return pinned();

  const compiled = compileCollectionRules(collection.rules, { publishedOnly });
  // A hybrid collection leaves out everything it lists, pinned or excluded: pinned ones come first
  // from the list above, excluded ones must not come back through the rules.
  const where =
    kind === 'hybrid'
      ? and(
          compiled.where,
          sql`${products.id} not in (select ${collectionProducts.productId} from ${collectionProducts} where ${collectionProducts.collectionId} = ${collection.id})`,
        )
      : compiled.where;

  const matched = await executor
    .select({ id: products.id })
    .from(products)
    .where(where)
    .orderBy(...compiled.orderBy)
    .limit(compiled.limit);

  return kind === 'hybrid'
    ? [...(await pinned()), ...matched.map((r) => r.id)]
    : matched.map((r) => r.id);
}
