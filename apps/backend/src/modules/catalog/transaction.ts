import { sql } from 'drizzle-orm';
import type { Db, DbExecutor, Tx } from '../../db/client.js';

/**
 * Runs `work` in a transaction. Given the pool it opens a new one; given a transaction it opens a
 * savepoint inside it, so services compose: a seed or a bigger service can call several of them in one
 * transaction, and a failure in any of them rolls back the whole thing.
 */
export function inTransaction<T>(executor: DbExecutor, work: (tx: Tx) => Promise<T>): Promise<T> {
  // Both `Db` and `Tx` have `transaction()` with the same callback type; TypeScript cannot call a
  // method on the union directly, hence the one cast.
  return (executor as Db).transaction(work);
}

/**
 * Serializes the changes of alt text. Whether a published product still has an image with Arabic alt
 * text depends on several image rows, so locking the product is not enough: two staff members
 * clearing the alt text of two DIFFERENT images of the same product would each see the other image
 * still described (that change is not committed yet) and both pass. The lock is taken before any row
 * lock, so two services can never wait on each other, and it is released when the outermost
 * transaction ends.
 *
 * `setProductImages` does not need it: it inserts rows that point at the image, and that takes a
 * row lock on the image which conflicts with the `FOR UPDATE` of `setMediaAlt`, so the two always
 * queue (both orders are covered by tests).
 */
export async function lockImageDescriptions(tx: Tx): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('catalog.image_descriptions', 0))`,
  );
}
