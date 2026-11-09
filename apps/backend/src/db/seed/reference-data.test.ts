// The reference lists as data (no database): every rule the database would enforce later is checked
// here first, so a typo in a list fails fast with a readable message.

import {
  NAME_MAX_LENGTH,
  NOTE_ALIAS_MAX_LENGTH,
  SLUG_MAX_LENGTH,
  SLUG_SQL_PATTERN,
  TAG_TYPES,
} from '@scentiq/shared';
import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  FAMILIES,
  FAMILY_ADJACENCY,
  NOTE_GROUPS,
  NOTES,
  TAGS,
} from './data/reference-data.js';

const SLUG = new RegExp(SLUG_SQL_PATTERN);
const ARABIC_LETTER = /[ء-ي]/;
const duplicates = (values: readonly string[]) =>
  values.filter((value, index) => values.indexOf(value) !== index);

describe.each([
  ['categories', CATEGORIES],
  ['families', FAMILIES],
  ['note groups', NOTE_GROUPS],
  ['notes', NOTES],
  ['tags', TAGS],
] as const)('%s', (_label, rows) => {
  it('has valid, unique slugs', () => {
    for (const row of rows) {
      expect(row.slug, row.slug).toMatch(SLUG);
      expect(row.slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    }
    // Tags are unique per type, everything else globally.
    const keys = rows.map((row) => ('type' in row ? `${row.type}/${row.slug}` : row.slug));
    expect(duplicates(keys)).toEqual([]);
  });

  it('has an Arabic and an English name inside the length limit', () => {
    for (const row of rows) {
      expect(row.nameAr, row.slug).toMatch(ARABIC_LETTER);
      expect(row.nameEn.trim(), row.slug).not.toBe('');
      expect(row.nameAr.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
      expect(row.nameEn.length).toBeLessThanOrEqual(NAME_MAX_LENGTH);
      expect(row.nameAr).toBe(row.nameAr.trim());
      expect(row.nameEn).toBe(row.nameEn.trim());
    }
  });

  it('has no two rows with the same English name (the database compares lower case)', () => {
    expect(duplicates(rows.map((row) => row.nameEn.toLowerCase()))).toEqual([]);
  });
});

describe('categories', () => {
  it('are the five approved top-level categories, in order', () => {
    expect(CATEGORIES.map((c) => c.slug)).toEqual([
      'perfumes',
      'oud-and-oud-oil',
      'bakhoor-and-home-fragrance',
      'gift-sets',
      'body-and-hair-mists',
    ]);
  });

  it('do not use gender as a category (it is an attribute: ADR-0012)', () => {
    for (const row of CATEGORIES) expect(row.nameEn).not.toMatch(/\b(men|women|unisex)\b/i);
  });
});

describe('family adjacency', () => {
  const slugs = new Set(FAMILIES.map((family) => family.slug));

  it('only names families that exist and never pairs a family with itself', () => {
    for (const [a, b] of FAMILY_ADJACENCY) {
      expect(slugs.has(a), a).toBe(true);
      expect(slugs.has(b), b).toBe(true);
      expect(a).not.toBe(b);
    }
  });

  it('lists each pair once, in either order', () => {
    const keys = FAMILY_ADJACENCY.map(([a, b]) => [a, b].sort().join('|'));
    expect(duplicates(keys)).toEqual([]);
  });

  it('gives every family at least two neighbours, so recommendations have somewhere to go', () => {
    for (const family of FAMILIES) {
      const neighbours = FAMILY_ADJACENCY.filter(
        ([a, b]) => a === family.slug || b === family.slug,
      );
      expect(neighbours.length, family.slug).toBeGreaterThanOrEqual(2);
    }
  });

  it('connects all families into one network', () => {
    const reached = new Set([FAMILIES[0]?.slug ?? '']);
    for (let round = 0; round < FAMILIES.length; round += 1) {
      for (const [a, b] of FAMILY_ADJACENCY) {
        if (reached.has(a) || reached.has(b)) {
          reached.add(a);
          reached.add(b);
        }
      }
    }
    expect([...reached].sort()).toEqual([...slugs].sort());
  });
});

describe('notes', () => {
  const groups = new Set(NOTE_GROUPS.map((group) => group.slug));

  it('belong to a group that exists, and every group has notes', () => {
    for (const note of NOTES) expect(groups.has(note.group), note.slug).toBe(true);
    for (const group of NOTE_GROUPS) {
      expect(
        NOTES.some((note) => note.group === group.slug),
        group.slug,
      ).toBe(true);
    }
  });

  it('have no two notes with the same Arabic name', () => {
    expect(duplicates(NOTES.map((note) => note.nameAr))).toEqual([]);
  });

  it('have aliases that fit, are not empty and are unique within the note', () => {
    for (const note of NOTES) {
      const aliases = (note.aliases ?? []).map((alias) => alias.toLowerCase());
      expect(duplicates(aliases), note.slug).toEqual([]);
      for (const alias of note.aliases ?? []) {
        expect(alias.trim(), note.slug).not.toBe('');
        expect(alias.length).toBeLessThanOrEqual(NOTE_ALIAS_MAX_LENGTH);
      }
    }
  });

  it('include the notes the Iraqi and Gulf market depends on', () => {
    const slugs = new Set(NOTES.map((note) => note.slug));
    for (const slug of ['oud', 'musk', 'amber', 'rose', 'saffron', 'frankincense', 'sandalwood']) {
      expect(slugs.has(slug), slug).toBe(true);
    }
  });
});

describe('tags', () => {
  it('use only the controlled types, and every type has tags', () => {
    for (const tag of TAGS) expect(TAG_TYPES).toContain(tag.type);
    for (const type of TAG_TYPES)
      expect(
        TAGS.some((tag) => tag.type === type),
        type,
      ).toBe(true);
  });
});
