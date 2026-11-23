import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDatabase, describeDb, type TestDatabase } from '../test/database.js';
import { runMigrations } from './migrate.js';

// Every migration in the journal must be applied exactly once (read from the file, so adding a
// migration never needs a number edited here).
const journal = JSON.parse(
  readFileSync(new URL('../../migrations/meta/_journal.json', import.meta.url), 'utf8'),
) as { entries: unknown[] };
const EXPECTED_MIGRATIONS = journal.entries.length;

const EXPECTED_TABLES = [
  'audit_logs',
  'brands',
  'categories',
  'collection_products',
  'collections',
  'families',
  'family_adjacency',
  'media_assets',
  'media_variants',
  'note_aliases',
  'note_groups',
  'notes',
  'product_images',
  'product_notes',
  'product_tags',
  'product_variants',
  'products',
  'sample_data_registry',
  'slug_redirects',
  'tags',
];

async function scalar<T>(url: string, text: string): Promise<T> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const result = await pool.query(text);
    return result.rows[0] ? (Object.values(result.rows[0])[0] as T) : (undefined as T);
  } finally {
    await pool.end();
  }
}

describeDb('migrations on an empty database', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false });
  });
  afterAll(async () => {
    await database.drop();
  });

  it('apply cleanly, create the tables and record every migration', async () => {
    await runMigrations(database.ownerUrl);
    const tables = await scalar<string[]>(
      database.ownerUrl,
      `select array_agg(tablename::text order by tablename) from pg_tables where schemaname = 'public'`,
    );
    expect(tables).toEqual(EXPECTED_TABLES);
    const applied = await scalar<string>(
      database.ownerUrl,
      'select count(*) from drizzle.__drizzle_migrations',
    );
    expect(Number(applied)).toBe(EXPECTED_MIGRATIONS);
  });

  it('can be run again without changing anything', async () => {
    await runMigrations(database.ownerUrl);
    const applied = await scalar<string>(
      database.ownerUrl,
      'select count(*) from drizzle.__drizzle_migrations',
    );
    expect(Number(applied)).toBe(EXPECTED_MIGRATIONS);
  });

  it('leave trigram search working for Arabic text', async () => {
    const trigrams = await scalar<number>(database.appUrl, `select cardinality(show_trgm('عود'))`);
    expect(trigrams).toBeGreaterThan(0);
  });
});

describeDb('migrations on a database with the wrong locale', () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase({ migrate: false, locale: 'plain-c' });
  });
  afterAll(async () => {
    await database.drop();
  });

  it('fail loudly because Arabic letters are not word characters, and change nothing', async () => {
    await expect(runMigrations(database.ownerUrl)).rejects.toThrow(
      /does not treat Arabic letters as word characters/,
    );
    // All migrations run in one transaction, so nothing was left behind.
    const tables = await scalar<string>(
      database.ownerUrl,
      `select count(*) from pg_tables where schemaname = 'public'`,
    );
    expect(Number(tables)).toBe(0);
  });
});
