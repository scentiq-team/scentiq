// Registers every row a dev seeder inserts in `sample_data_registry` (ADR-0015), without the seeder
// having to remember each table. The registry is what the production gate checks, so a table that
// is forgotten here would be sample data the gate cannot see. This helper looks at EVERY table in
// the public schema before and after the work, and registers whatever is new.
//
// A row is identified by its primary key: the uuid for most tables, and the key columns joined with
// ":" for join tables (`product_id:note_id`). `sample_data_registry` itself is not tracked.

import { sql } from 'drizzle-orm';
import type { Tx } from '../client.js';
import type { SeedContext } from './runner.js';

interface TrackedTable {
  name: string;
  keyColumns: string[];
}

/** Every ordinary table in `public` that has a primary key, and the columns of that key in order. */
async function trackedTables(tx: Tx): Promise<TrackedTable[]> {
  const result = await tx.execute<{ table_name: string; key_columns: string[] }>(sql`
    select c.relname::text as table_name,
           array_agg(a.attname::text order by array_position(i.indkey::int2[], a.attnum)) as key_columns
      from pg_index i
      join pg_class c on c.oid = i.indrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum = any (i.indkey)
     where i.indisprimary
       and n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relname <> 'sample_data_registry'
     group by c.relname
     order by c.relname`);
  return result.rows.map((row) => ({ name: row.table_name, keyColumns: row.key_columns }));
}

/** The primary keys of every row in the table, as text. */
async function keysOf(tx: Tx, table: TrackedTable): Promise<string[]> {
  const columns = table.keyColumns.map((column) => sql`${sql.identifier(column)}::text`);
  const result = await tx.execute<{ key: string }>(
    sql`select concat_ws(':', ${sql.join(columns, sql`, `)}) as key from ${sql.identifier(table.name)}`,
  );
  return result.rows.map((row) => row.key);
}

async function snapshot(
  tx: Tx,
  tables: readonly TrackedTable[],
): Promise<Map<string, Set<string>>> {
  const keys = new Map<string, Set<string>>();
  // One query at a time: a transaction has a single connection.
  for (const table of tables) keys.set(table.name, new Set(await keysOf(tx, table)));
  return keys;
}

/**
 * Runs `work`, then registers every row that appeared in any table while it ran. Returns what it
 * registered, per table, so a test (or a log line) can show it.
 */
export async function trackNewRows<T>(
  tx: Tx,
  context: SeedContext,
  work: () => Promise<T>,
): Promise<{ result: T; registered: Record<string, number> }> {
  const tables = await trackedTables(tx);
  const before = await snapshot(tx, tables);
  const result = await work();
  const after = await snapshot(tx, tables);

  const registered: Record<string, number> = {};
  for (const table of tables) {
    const known = before.get(table.name) ?? new Set<string>();
    for (const key of after.get(table.name) ?? []) {
      if (known.has(key)) continue;
      await context.registerSample(table.name, key);
      registered[table.name] = (registered[table.name] ?? 0) + 1;
    }
  }
  return { result, registered };
}
