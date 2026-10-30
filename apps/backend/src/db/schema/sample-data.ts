// Every row that `seed:dev` inserts is recorded here (ADR-0015). The deployment gate
// `assert-no-sample-data` fails when this table is not empty in production.
import { sql } from 'drizzle-orm';
import { check, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from './columns.js';

export const sampleDataRegistry = pgTable(
  'sample_data_registry',
  {
    id: primaryId(),
    tableName: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    /** Which seed run created the row, for example `dev-2026-10-27T09:00:00.000Z`. */
    seedBatch: text('seed_batch').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('sample_data_registry_table_name_format', sql`${t.tableName} ~ '^[a-z][a-z0-9_]*$'`),
    uniqueIndex('sample_data_registry_row_uq').on(t.tableName, t.rowId),
  ],
);
