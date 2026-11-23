// `seed:reference` for the catalog (ADR-0015): categories, olfactive families and their adjacency,
// note groups, starter notes with search aliases, and the tag vocabulary.
//
// Safe to run in production and safe to run again:
//   - it only INSERTS what is missing, identified by slug; it never updates or deletes, so a name
//     that staff changed in Studio is never overwritten
//   - a slug that was retired on purpose (a redirect exists) is not brought back
//   - when nothing was missing it writes nothing, not even an audit row

import { eq, inArray } from 'drizzle-orm';
import { recordAudit } from '../audit.js';
import type { Tx } from '../client.js';
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
  ADJACENCY_WEIGHT_PERCENT,
  CATEGORIES,
  FAMILIES,
  FAMILY_ADJACENCY,
  NOTE_GROUPS,
  NOTES,
  TAGS,
} from './data/reference-data.js';
import type { Seeder } from './runner.js';

export interface ReferenceCounts {
  categories: number;
  families: number;
  familyAdjacency: number;
  noteGroups: number;
  notes: number;
  noteAliases: number;
  tags: number;
}

const SORT_STEP = 10;

/** Slugs that used to belong to an entity of this type and now redirect elsewhere. */
async function retiredSlugs(tx: Tx, entityType: 'category' | 'note'): Promise<Set<string>> {
  const rows = await tx
    .select({ slug: slugRedirects.oldSlug })
    .from(slugRedirects)
    .where(eq(slugRedirects.entityType, entityType));
  return new Set(rows.map((row) => row.slug));
}

/**
 * The two ids of an adjacency pair in the order the table stores them: smaller first. Canonical
 * lower-case UUID text sorts the same way PostgreSQL orders uuid values.
 */
export function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Inserts the missing reference rows. Returns how many rows each table gained. */
export async function applyReferenceCatalog(tx: Tx): Promise<ReferenceCounts> {
  const retiredCategories = await retiredSlugs(tx, 'category');
  const retiredNotes = await retiredSlugs(tx, 'note');

  const categoryRows = CATEGORIES.flatMap((row, index) =>
    retiredCategories.has(row.slug) ? [] : [{ ...row, sortOrder: (index + 1) * SORT_STEP }],
  );
  const insertedCategories =
    categoryRows.length === 0
      ? []
      : await tx
          .insert(categories)
          .values(categoryRows)
          .onConflictDoNothing()
          .returning({ id: categories.id });

  const insertedFamilies = await tx
    .insert(families)
    .values(FAMILIES.map((row, index) => ({ ...row, sortOrder: (index + 1) * SORT_STEP })))
    .onConflictDoNothing()
    .returning({ id: families.id });

  const familyIds = new Map(
    (await tx.select({ id: families.id, slug: families.slug }).from(families)).map((row) => [
      row.slug,
      row.id,
    ]),
  );
  const pairs = FAMILY_ADJACENCY.map(([first, second]) => {
    const a = familyIds.get(first);
    const b = familyIds.get(second);
    if (a === undefined || b === undefined) {
      throw new Error(`Reference data names a family that does not exist: ${first} / ${second}`);
    }
    const [familyId, adjacentFamilyId] = orderPair(a, b);
    return { familyId, adjacentFamilyId, weightPercent: ADJACENCY_WEIGHT_PERCENT };
  });
  const insertedAdjacency = await tx
    .insert(familyAdjacency)
    .values(pairs)
    .onConflictDoNothing()
    .returning({ id: familyAdjacency.familyId });

  const insertedGroups = await tx
    .insert(noteGroups)
    .values(NOTE_GROUPS.map((row, index) => ({ ...row, sortOrder: (index + 1) * SORT_STEP })))
    .onConflictDoNothing()
    .returning({ id: noteGroups.id });

  const groupIds = new Map(
    (await tx.select({ id: noteGroups.id, slug: noteGroups.slug }).from(noteGroups)).map((row) => [
      row.slug,
      row.id,
    ]),
  );
  const noteRows = NOTES.filter((row) => !retiredNotes.has(row.slug)).map((row) => {
    const groupId = groupIds.get(row.group);
    if (groupId === undefined) {
      throw new Error(`Reference data names a note group that does not exist: ${row.group}`);
    }
    return { groupId, slug: row.slug, nameAr: row.nameAr, nameEn: row.nameEn };
  });
  const insertedNotes =
    noteRows.length === 0
      ? []
      : await tx.insert(notes).values(noteRows).onConflictDoNothing().returning({ id: notes.id });

  // Aliases for every starter note that exists now (new or already there).
  const aliasSlugs = NOTES.filter((row) => (row.aliases?.length ?? 0) > 0).map((row) => row.slug);
  const noteIds = new Map(
    (
      await tx
        .select({ id: notes.id, slug: notes.slug })
        .from(notes)
        .where(inArray(notes.slug, aliasSlugs))
    ).map((row) => [row.slug, row.id]),
  );
  const aliasRows = NOTES.flatMap((row) => {
    const noteId = noteIds.get(row.slug);
    return noteId === undefined ? [] : (row.aliases ?? []).map((alias) => ({ noteId, alias }));
  });
  const insertedAliases =
    aliasRows.length === 0
      ? []
      : await tx
          .insert(noteAliases)
          .values(aliasRows)
          .onConflictDoNothing()
          .returning({ id: noteAliases.id });

  const insertedTags = await tx
    .insert(tags)
    .values(TAGS.map((row) => ({ ...row })))
    .onConflictDoNothing()
    .returning({ id: tags.id });

  const counts: ReferenceCounts = {
    categories: insertedCategories.length,
    families: insertedFamilies.length,
    familyAdjacency: insertedAdjacency.length,
    noteGroups: insertedGroups.length,
    notes: insertedNotes.length,
    noteAliases: insertedAliases.length,
    tags: insertedTags.length,
  };
  if (Object.values(counts).some((count) => count > 0)) {
    await recordAudit(tx, {
      actor: { type: 'system' },
      action: 'seed.reference_catalog_applied',
      details: { ...counts },
    });
  }
  return counts;
}

export const referenceCatalog: Seeder = {
  name: 'reference catalog (categories, families, notes, tags)',
  level: 'reference',
  async run(tx) {
    await applyReferenceCatalog(tx);
  },
};
