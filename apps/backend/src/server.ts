import { buildApp } from './app.js';
import { type AppConfig, EnvError, loadEnv } from './config/env.js';
import { createDatabase, type Database } from './db/client.js';
import {
  checkRoleAtStartup,
  inspectRole,
  isStrictEnv,
  startupRoleOptions,
} from './db/role-check.js';

async function main(): Promise<void> {
  let config: AppConfig;
  try {
    config = loadEnv();
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  let database: Database | undefined;
  if (config.databaseUrl !== undefined) {
    database = createDatabase({
      url: config.databaseUrl,
      poolMax: config.databasePoolMax,
      onPoolError: (error) => console.error(`database connection error: ${error.message}`),
    });
  }

  const app = await buildApp({ config, ...(database === undefined ? {} : { database }) });

  if (database === undefined) {
    app.log.warn('DATABASE_URL is not set: running without a database (development only).');
  } else {
    await checkDatabaseRole(app.log, config, database);
  }

  // SIGINT covers Ctrl+C on Windows too; SIGTERM is what Docker and systemd send.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'shutting down');
      // Stop taking requests and finish the running ones first, then close the database.
      app
        .close()
        .then(() => database?.close())
        .then(
          () => process.exit(0),
          () => process.exit(1),
        );
    });
  }

  await app.listen({ host: config.host, port: config.port });
}

/**
 * Staging and production refuse to run as a powerful database role, and also refuse to start
 * when the role cannot be checked (the database stayed unreachable). Development only warns.
 */
async function checkDatabaseRole(
  log: { warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void },
  config: AppConfig,
  database: Database,
): Promise<void> {
  const result = await checkRoleAtStartup(
    () => inspectRole(database.db),
    config.appEnv,
    startupRoleOptions(config.appEnv),
  );
  if (result.status === 'ok') return;

  if (result.status === 'unreachable') {
    if (isStrictEnv(config.appEnv)) {
      log.error({}, 'The database is not reachable, so its role cannot be checked. Not starting.');
      await database.close();
      process.exit(1);
    }
    log.warn({}, 'database not reachable at startup: skipped the database role check');
    return;
  }

  const fields = { role: result.report.role, attributes: result.report.dangerousAttributes };
  if (result.status === 'refuse') {
    log.error(
      fields,
      'DATABASE_URL uses a role with dangerous privileges. Use the scentiq_app role.',
    );
    await database.close();
    process.exit(1);
  }
  log.warn(
    fields,
    'DATABASE_URL uses a role with dangerous privileges (allowed in development only)',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
