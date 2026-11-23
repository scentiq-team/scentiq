// Keeps `products.search_document` in step with the data it is built from (ADR-0005): the product's
// own names, its brand, category, families, notes (with aliases) and tags. It runs inside the same
// transaction as the change that made it stale, so a reader never sees a product whose document
// disagrees with its data.

import { buildSearchDocument } from '@scentiq/shared';
import { eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import { productNotes, products, productTags } from '../../db/schema/products.js';
import {
  brands,
  categories,
  families,
  noteAliases,
  notes,
  tags,
} from '../../db/schema/taxonomy.js';

/** Rebuilds the document of each product and writes it when it changed. Returns how many changed. */
export async function refreshProductSearchDocuments(
  executor: DbExecutor,
  productIds: readonly string[],
): Promise<number> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return 0;

  const rows = await executor.select().from(products).where(inArray(products.id, ids));
  if (rows.length === 0) return 0;

  const brandIds = [...new Set(rows.map((r) => r.brandId))];
  const categoryIds = [...new Set(rows.flatMap((r) => (r.categoryId ? [r.categoryId] : [])))];
  const familyIds = [
    ...new Set(
      rows.flatMap((r) => [r.primaryFamilyId, r.secondaryFamilyId].filter((v): v is string => !!v)),
    ),
  ];

  // Sequential on purpose: see completion.ts (one connection inside a transaction).
  const brandRows = await executor.select().from(brands).where(inArray(brands.id, brandIds));
  const categoryRows = categoryIds.length
    ? await executor.select().from(categories).where(inArray(categories.id, categoryIds))
    : [];
  const familyRows = familyIds.length
    ? await executor.select().from(families).where(inArray(families.id, familyIds))
    : [];
  const noteLinks = await executor
    .select({ productId: productNotes.productId, note: notes })
    .from(productNotes)
    .innerJoin(notes, eq(notes.id, productNotes.noteId))
    .where(inArray(productNotes.productId, ids));
  const tagLinks = await executor
    .select({ productId: productTags.productId, tag: tags })
    .from(productTags)
    .innerJoin(tags, eq(tags.id, productTags.tagId))
    .where(inArray(productTags.productId, ids));

  const noteIds = [...new Set(noteLinks.map((l) => l.note.id))];
  const aliasRows = noteIds.length
    ? await executor.select().from(noteAliases).where(inArray(noteAliases.noteId, noteIds))
    : [];

  const brandById = new Map(brandRows.map((b) => [b.id, b]));
  const categoryById = new Map(categoryRows.map((c) => [c.id, c]));
  const familyById = new Map(familyRows.map((f) => [f.id, f]));
  const aliasesByNote = new Map<string, string[]>();
  for (const alias of aliasRows) {
    aliasesByNote.set(alias.noteId, [...(aliasesByNote.get(alias.noteId) ?? []), alias.alias]);
  }

  let changed = 0;
  for (const row of rows) {
    const brand = brandById.get(row.brandId);
    const category = row.categoryId ? categoryById.get(row.categoryId) : undefined;
    const familyNames = [row.primaryFamilyId, row.secondaryFamilyId].flatMap((id) => {
      const family = id ? familyById.get(id) : undefined;
      return family ? [family.nameAr, family.nameEn] : [];
    });

    const document = buildSearchDocument({
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      brandNameAr: brand?.nameAr ?? '',
      brandNameEn: brand?.nameEn,
      categoryNameAr: category?.nameAr,
      categoryNameEn: category?.nameEn,
      familyNames,
      notes: noteLinks
        .filter((l) => l.productId === row.id)
        .map((l) => ({
          nameAr: l.note.nameAr,
          nameEn: l.note.nameEn,
          aliases: aliasesByNote.get(l.note.id) ?? [],
        })),
      tagNames: tagLinks
        .filter((l) => l.productId === row.id)
        .flatMap((l) => [l.tag.nameAr, l.tag.nameEn]),
    });

    if (document !== row.searchDocument) {
      await executor
        .update(products)
        .set({ searchDocument: document })
        .where(eq(products.id, row.id));
      changed += 1;
    }
  }
  return changed;
}

/** The products that mention an entity in their document, so a rename can refresh exactly those. */
export type SearchDependency =
  | { brandId: string }
  | { categoryId: string }
  | { familyId: string }
  | { noteId: string }
  | { tagId: string };

export async function productIdsDependingOn(
  executor: DbExecutor,
  dependency: SearchDependency,
): Promise<string[]> {
  if ('brandId' in dependency) {
    const rows = await executor
      .select({ id: products.id })
      .from(products)
      .where(eq(products.brandId, dependency.brandId));
    return rows.map((r) => r.id);
  }
  if ('categoryId' in dependency) {
    const rows = await executor
      .select({ id: products.id })
      .from(products)
      .where(eq(products.categoryId, dependency.categoryId));
    return rows.map((r) => r.id);
  }
  if ('familyId' in dependency) {
    const primary = await executor
      .select({ id: products.id })
      .from(products)
      .where(eq(products.primaryFamilyId, dependency.familyId));
    const secondary = await executor
      .select({ id: products.id })
      .from(products)
      .where(eq(products.secondaryFamilyId, dependency.familyId));
    return [...primary, ...secondary].map((r) => r.id);
  }
  if ('noteId' in dependency) {
    const rows = await executor
      .select({ id: productNotes.productId })
      .from(productNotes)
      .where(eq(productNotes.noteId, dependency.noteId));
    return rows.map((r) => r.id);
  }
  const rows = await executor
    .select({ id: productTags.productId })
    .from(productTags)
    .where(eq(productTags.tagId, dependency.tagId));
  return rows.map((r) => r.id);
}
