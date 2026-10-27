import { createDatabase } from '../client.js';
import { runSeeds, type SeedLevel } from '../seed/runner.js';
import { seeders } from '../seed/seeders.js';
import { fail, loadConfigOrExit, runTool } from './context.js';

runTool(async () => {
  const level = process.argv[2];
  if (level !== 'reference' && level !== 'dev') fail('Usage: seed <reference|dev>');
  const config = loadConfigOrExit();
  if (config.databaseUrl === undefined) fail('DATABASE_URL is required.');

  const database = createDatabase({
    url: config.databaseUrl,
    poolMax: 1,
    applicationName: 'scentiq-seed',
  });
  try {
    const { ran } = await runSeeds({
      db: database.db,
      level: level as SeedLevel,
      appEnv: config.appEnv,
      seeders,
      log: console.log,
    });
    console.log(
      ran.length === 0
        ? `No "${level}" seeders are registered yet.`
        : `Seeded ${ran.length} "${level}" seeder(s).`,
    );
  } finally {
    await database.close();
  }
});
