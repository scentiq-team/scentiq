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
