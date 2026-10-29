import { describe, expect, it } from 'vitest';
import type { Db } from '../client.js';
import { assertSeedAllowed, runSeeds, type Seeder, SeedRefusedError } from './runner.js';

// The refusal happens before the database is touched, so no database is needed here.
const noDb = undefined as unknown as Db;
const devSeeder: Seeder = {
  name: 'sample brands',
  level: 'dev',
  run: async () => {
    throw new Error('must not run');
  },
};

describe('seed:dev guard', () => {
  it('refuses to run in production and test', async () => {
    for (const appEnv of ['production', 'test'] as const) {
      await expect(
        runSeeds({ db: noDb, level: 'dev', appEnv, seeders: [devSeeder] }),
      ).rejects.toThrow(SeedRefusedError);
    }
  });

  it('tells the person why, without running any seeder', async () => {
    await expect(
      runSeeds({ db: noDb, level: 'dev', appEnv: 'production', seeders: [devSeeder] }),
    ).rejects.toThrow(/only runs in development or staging/);
  });
});

describe('assertSeedAllowed', () => {
  const LOCAL = 'postgres://scentiq_app:x@127.0.0.1:5432/scentiq_dev';
  const SHARED = 'postgres://scentiq_app:x@db.internal:5432/scentiq';

  it('lets reference data through anywhere', () => {
    expect(() => assertSeedAllowed('reference', 'production', SHARED)).not.toThrow();
  });

  it('allows seed:dev in development on this computer, and in staging', () => {
    expect(() => assertSeedAllowed('dev', 'development', LOCAL)).not.toThrow();
    expect(() => assertSeedAllowed('dev', 'staging', SHARED)).not.toThrow();
  });

  it('refuses seed:dev in production and test', () => {
    for (const env of ['production', 'test'] as const) {
      expect(() => assertSeedAllowed('dev', env, LOCAL)).toThrow(SeedRefusedError);
    }
  });

  it('refuses seed:dev in development when the database is not on this computer', () => {
    expect(() => assertSeedAllowed('dev', 'development', SHARED)).toThrow(/this computer/);
    expect(() =>
      assertSeedAllowed('dev', 'development', 'postgres://u:x@localhost/db?host=prod.example.com'),
    ).toThrow(SeedRefusedError);
  });
});
