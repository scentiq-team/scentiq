import { describe, expect, it } from 'vitest';
import type { Db } from '../client.js';
import { runSeeds, type Seeder, SeedRefusedError } from './runner.js';

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
