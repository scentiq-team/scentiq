// Slugs and redirects (ADR-0002). A slug is unique within its entity type, and a slug that used to
// belong to an entity keeps answering with a 301 to the entity's CURRENT slug. Redirect rows point at
// the entity id, never at another slug, so a chain (a -> b -> c) cannot form: renaming twice leaves two
// rows that both resolve to the latest slug.
//
// Every function takes an executor so it can run inside the caller's transaction.

import { nextAvailableSlug, type RedirectEntityType, slugify } from '@scentiq/shared';
import { and, eq, like } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import { collections } from '../../db/schema/collections.js';
import { products } from '../../db/schema/products.js';
import { slugRedirects } from '../../db/schema/slugs.js';
import { brands, categories, notes } from '../../db/schema/taxonomy.js';
import { CatalogError } from './errors.js';

interface SlugOps {
  /** The id of the row that has this slug right now. */
  idOf(executor: DbExecutor, slug: string): Promise<string | undefined>;
  /** The slug the row with this id has right now. */
  slugOf(executor: DbExecutor, id: string): Promise<string | undefined>;
  /** Every live slug that starts with `prefix`. */
  withPrefix(executor: DbExecutor, prefix: string): Promise<string[]>;
}

// One explicit set of queries per table: a generic helper over "any table with id and slug" does not
// type-check cleanly with Drizzle, and five small blocks are easier to read than a clever one.
const OPS: Record<RedirectEntityType, SlugOps> = {
  product: {
    idOf: async (e, slug) =>
      (
        await e.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1)
      )[0]?.id,
    slugOf: async (e, id) =>
      (
        await e.select({ slug: products.slug }).from(products).where(eq(products.id, id)).limit(1)
      )[0]?.slug,
    withPrefix: async (e, prefix) =>
      (
        await e
          .select({ slug: products.slug })
          .from(products)
          .where(like(products.slug, `${prefix}%`))
      ).map((r) => r.slug),
  },
  brand: {
    idOf: async (e, slug) =>
      (await e.select({ id: brands.id }).from(brands).where(eq(brands.slug, slug)).limit(1))[0]?.id,
    slugOf: async (e, id) =>
      (await e.select({ slug: brands.slug }).from(brands).where(eq(brands.id, id)).limit(1))[0]
        ?.slug,
    withPrefix: async (e, prefix) =>
      (
        await e
          .select({ slug: brands.slug })
          .from(brands)
          .where(like(brands.slug, `${prefix}%`))
      ).map((r) => r.slug),
  },
  category: {
    idOf: async (e, slug) =>
      (
        await e
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.slug, slug))
          .limit(1)
      )[0]?.id,
    slugOf: async (e, id) =>
      (
        await e
          .select({ slug: categories.slug })
          .from(categories)
          .where(eq(categories.id, id))
          .limit(1)
      )[0]?.slug,
    withPrefix: async (e, prefix) =>
      (
        await e
          .select({ slug: categories.slug })
          .from(categories)
          .where(like(categories.slug, `${prefix}%`))
      ).map((r) => r.slug),
  },
  collection: {
    idOf: async (e, slug) =>
      (
        await e
          .select({ id: collections.id })
          .from(collections)
          .where(eq(collections.slug, slug))
          .limit(1)
      )[0]?.id,
    slugOf: async (e, id) =>
      (
        await e
          .select({ slug: collections.slug })
          .from(collections)
          .where(eq(collections.id, id))
          .limit(1)
      )[0]?.slug,
    withPrefix: async (e, prefix) =>
      (
        await e
          .select({ slug: collections.slug })
          .from(collections)
          .where(like(collections.slug, `${prefix}%`))
      ).map((r) => r.slug),
  },
  note: {
    idOf: async (e, slug) =>
      (await e.select({ id: notes.id }).from(notes).where(eq(notes.slug, slug)).limit(1))[0]?.id,
    slugOf: async (e, id) =>
      (await e.select({ slug: notes.slug }).from(notes).where(eq(notes.id, id)).limit(1))[0]?.slug,
    withPrefix: async (e, prefix) =>
      (
        await e
          .select({ slug: notes.slug })
          .from(notes)
          .where(like(notes.slug, `${prefix}%`))
      ).map((r) => r.slug),
  },
};

/** The redirect row for a retired slug, if there is one. */
async function redirectFor(executor: DbExecutor, type: RedirectEntityType, slug: string) {
  const [row] = await executor
    .select({ id: slugRedirects.id, entityId: slugRedirects.entityId })
    .from(slugRedirects)
    .where(and(eq(slugRedirects.entityType, type), eq(slugRedirects.oldSlug, slug)))
    .limit(1);
  return row;
}

/**
 * Picks the slug for an entity that is being created or renamed, and returns it.
 *
 * - `desired` given: it must be free. Taken by another entity, or retired by another entity (its
 *   redirect must keep working): a `conflict`. Retired by THIS entity: allowed (the entity takes it
 *   back and the redirect row is deleted, so a slug is never both live and a redirect).
 * - `desired` missing: a slug is suggested from `source` (`slugify`, then `-2`, `-3`... until free).
 *
 * `entityId` is the entity being renamed; leave it out when creating.
 */
export async function claimSlug(
  executor: DbExecutor,
  type: RedirectEntityType,
  options: { desired?: string | undefined; source: string; entityId?: string },
): Promise<string> {
  const ops = OPS[type];
  const { desired, source, entityId } = options;

  if (desired !== undefined) {
    const holder = await ops.idOf(executor, desired);
    if (holder !== undefined && holder !== entityId)
      throw new CatalogError('conflict', 'slug_taken');
    const redirect = await redirectFor(executor, type, desired);
    if (redirect !== undefined) {
      if (redirect.entityId !== entityId) throw new CatalogError('conflict', 'slug_reserved');
      await executor.delete(slugRedirects).where(eq(slugRedirects.id, redirect.id));
    }
    return desired;
  }

  const base = slugify(source) || type;
  const live = new Set(await ops.withPrefix(executor, base));
  const retired = await executor
    .select({ slug: slugRedirects.oldSlug })
    .from(slugRedirects)
    .where(and(eq(slugRedirects.entityType, type), like(slugRedirects.oldSlug, `${base}%`)));
  const unavailable = new Set([...live, ...retired.map((r) => r.slug)]);
  return nextAvailableSlug(base, (candidate) => unavailable.has(candidate));
}

/** Records that `oldSlug` used to belong to this entity, so its old address keeps working. */
export async function retireSlug(
  executor: DbExecutor,
  type: RedirectEntityType,
  entityId: string,
  oldSlug: string,
): Promise<void> {
  await executor.insert(slugRedirects).values({ entityType: type, entityId, oldSlug });
}

/**
 * Where an old address should go: the entity's current slug, or `undefined` when `slug` was never
 * retired (or its entity is gone). The storefront turns a hit into a 301.
 */
export async function findRedirectTarget(
  executor: DbExecutor,
  type: RedirectEntityType,
  slug: string,
): Promise<string | undefined> {
  const redirect = await redirectFor(executor, type, slug);
  if (redirect === undefined) return undefined;
  return OPS[type].slugOf(executor, redirect.entityId);
}
