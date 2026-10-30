// The only place that creates a database connection pool (ADR-0004). Modules receive a `Db`
// and never import `pg` themselves.
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Db = NodePgDatabase<typeof schema>;
/** What `db.transaction(async (tx) => ...)` hands to the callback. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Either a connection pool or an open transaction: code that only runs queries accepts both. */
export type DbExecutor = Db | Tx;

export interface Database {
  db: Db;
  /** True when a trivial query answers within `timeoutMs`. Never throws. */
  ping(timeoutMs?: number): Promise<boolean>;
  /** Waits for running queries, then closes every connection. Safe to call twice. */
  close(): Promise<void>;
}

export interface DatabaseOptions {
  url: string;
  poolMax: number;
  applicationName?: string;
  /** Called when an idle connection fails (for example when the database restarts). */
  onPoolError?: (error: Error) => void;
}

const DEFAULT_PING_TIMEOUT_MS = 2_000;

export function createDatabase(options: DatabaseOptions): Database {
  const pool = new pg.Pool({
    connectionString: options.url,
    max: options.poolMax,
    application_name: options.applicationName ?? 'scentiq-backend',
    // Fail fast instead of letting requests pile up behind a database that is gone.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // PostgreSQL itself stops a runaway query or a forgotten open transaction.
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 15_000,
  });

  // Without this listener a dropped idle connection would crash the whole process.
  pool.on('error', (error) => options.onPoolError?.(error));

  const db = drizzle(pool, { schema });
  let closing: Promise<void> | undefined;

  return {
    db,
    async ping(timeoutMs = DEFAULT_PING_TIMEOUT_MS) {
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          pool.query('select 1'),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('database ping timed out')), timeoutMs);
          }),
        ]);
        return true;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    },
    close() {
      closing ??= pool.end();
      return closing;
    },
  };
}
