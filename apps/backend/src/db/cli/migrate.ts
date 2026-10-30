import { runMigrations } from '../migrate.js';
import { fail, loadConfigOrExit, runTool } from './context.js';

runTool(async () => {
  const config = loadConfigOrExit();
  if (config.migrationDatabaseUrl === undefined) {
    fail('MIGRATION_DATABASE_URL is required (the owner role). See apps/backend/.env.example.');
  }
  await runMigrations(config.migrationDatabaseUrl);
  console.log('Migrations are up to date.');
});
