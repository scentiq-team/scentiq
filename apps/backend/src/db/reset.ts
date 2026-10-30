// Development only: empties the database and applies every migration again.
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { AppEnv } from '../config/env.js';
import { isLocalDatabaseUrl } from './local-guard.js';
import { runMigrations } from './migrate.js';

export class ResetRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResetRefusedError';
  }
}

/** Throws unless wiping this database is clearly safe. Exported so the rule is tested. */
export function assertResetAllowed(appEnv: AppEnv, url: string): void {
  if (appEnv !== 'development' && appEnv !== 'test') {
    throw new ResetRefusedError(`db:reset refuses to run when APP_ENV is "${appEnv}".`);
  }
  if (!isLocalDatabaseUrl(url)) {
    throw new ResetRefusedError(
      'db:reset only runs against a database on this computer (localhost or 127.0.0.1).',
    );
  }
}

export async function resetDatabase(appEnv: AppEnv, ownerUrl: string): Promise<void> {
  assertResetAllowed(appEnv, ownerUrl);
  const pool = new pg.Pool({ connectionString: ownerUrl, max: 1 });
  pool.on('error', () => undefined);
  try {
    const db = drizzle(pool);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`create schema public`);
  } finally {
    await pool.end();
  }
  await runMigrations(ownerUrl);
}
