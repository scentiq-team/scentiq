// Deployment gate (ADR-0015): production must contain no sample data.
import { count } from 'drizzle-orm';
import type { Db } from './client.js';
import { sampleDataRegistry } from './schema/sample-data.js';

export async function countSampleRows(db: Db): Promise<number> {
  const [row] = await db.select({ total: count() }).from(sampleDataRegistry);
  return row?.total ?? 0;
}
