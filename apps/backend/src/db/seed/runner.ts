// Seed system (ADR-0015). Two levels run through here:
//   reference  real, production-safe data (governorates, roles, families...). Must be idempotent.
//   dev        fake brands, products, orders... Refuses to run unless APP_ENV is development or
//              staging, and records every row it inserts in sample_data_registry so that
//              production can be proven free of sample data.
// `seed:owner` (first Owner account) arrives with the users table in Phase 7A.
import type { AppEnv } from '../../config/env.js';
import type { MediaStorage } from '../../modules/media/storage.js';
import type { Db, Tx } from '../client.js';
import { isLocalDatabaseUrl } from '../local-guard.js';
import { sampleDataRegistry } from '../schema/sample-data.js';

export type SeedLevel = 'reference' | 'dev';

export interface SeedContext {
  /** Dev seeders call this for every row they insert, with the table name and the row id. */
  registerSample(tableName: string, rowId: string): Promise<void>;
  /** Where seeders that create images put the files. Absent when the caller has no storage. */
  mediaStorage?: MediaStorage;
  /** A line of progress for the person running the tool. */
  log(line: string): void;
}

export interface Seeder {
  /** Stable name, shown in the output. */
  name: string;
  level: SeedLevel;
  run(tx: Tx, context: SeedContext): Promise<void>;
}

export class SeedRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedRefusedError';
  }
}

const DEV_SEED_ENVS: readonly AppEnv[] = ['development', 'staging'];

/**
 * Checked by the command line tool before it connects. Besides APP_ENV, a development seed must
 * point at a database on this computer, so a DATABASE_URL copied from a shared server into a
 * developer's .env cannot be filled with fake products. Staging is a shared server by design.
 */
export function assertSeedAllowed(level: SeedLevel, appEnv: AppEnv, databaseUrl: string): void {
  if (level !== 'dev') return;
  if (!DEV_SEED_ENVS.includes(appEnv)) {
    throw new SeedRefusedError(
      `seed:dev refuses to run when APP_ENV is "${appEnv}". It only runs in development or staging.`,
    );
  }
  if (appEnv === 'development' && !isLocalDatabaseUrl(databaseUrl)) {
    throw new SeedRefusedError(
      'seed:dev in development only runs against a database on this computer (localhost or 127.0.0.1).',
    );
  }
}

export interface RunSeedsOptions {
  db: Db;
  level: SeedLevel;
  appEnv: AppEnv;
  seeders: readonly Seeder[];
  /** Needed only by seeders that create images (the dev catalog). */
  mediaStorage?: MediaStorage;
  now?: () => Date;
  log?: (line: string) => void;
}

export async function runSeeds(options: RunSeedsOptions): Promise<{ ran: string[] }> {
  const {
    db,
    level,
    appEnv,
    seeders,
    mediaStorage,
    now = () => new Date(),
    log = () => undefined,
  } = options;

  if (level === 'dev' && !DEV_SEED_ENVS.includes(appEnv)) {
    throw new SeedRefusedError(
      `seed:dev refuses to run when APP_ENV is "${appEnv}". It only runs in development or staging.`,
    );
  }

  const selected = seeders.filter((seeder) => seeder.level === level);
  const batch = `${level}-${now().toISOString()}`;
  const ran: string[] = [];

  // One transaction: either every seeder of this level succeeds or nothing is written.
  await db.transaction(async (tx) => {
    const context: SeedContext = {
      async registerSample(tableName, rowId) {
        await tx
          .insert(sampleDataRegistry)
          .values({ tableName, rowId, seedBatch: batch })
          .onConflictDoNothing();
      },
      ...(mediaStorage === undefined ? {} : { mediaStorage }),
      log,
    };
    for (const seeder of selected) {
      log(`seeding ${seeder.name}`);
      await seeder.run(tx, context);
      ran.push(seeder.name);
    }
  });

  return { ran };
}
