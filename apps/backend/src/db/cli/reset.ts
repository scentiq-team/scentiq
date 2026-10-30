import { resetDatabase } from '../reset.js';
import { fail, loadConfigOrExit, runTool } from './context.js';

runTool(async () => {
  const config = loadConfigOrExit();
  if (config.migrationDatabaseUrl === undefined) {
    fail('MIGRATION_DATABASE_URL is required (the owner role). See apps/backend/.env.example.');
  }
  await resetDatabase(config.appEnv, config.migrationDatabaseUrl);
  console.log('Database reset and migrated.');
});
