import { buildApp } from './app.js';
import { type AppConfig, EnvError, loadEnv } from './config/env.js';
import { createDatabase, type Database } from './db/client.js';
import { inspectRole, roleVerdict } from './db/role-check.js';

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
 * Staging and production refuse to run as a powerful database role. If the database cannot be
 * reached right now the check is skipped (/readyz reports the outage); development only warns.
 */
async function checkDatabaseRole(
  log: { warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void },
  config: AppConfig,
  database: Database,
): Promise<void> {
  let report: Awaited<ReturnType<typeof inspectRole>>;
  try {
    report = await inspectRole(database.db);
  } catch {
    log.warn({}, 'database not reachable at startup: skipped the database role check');
    return;
  }
  const verdict = roleVerdict(report, config.appEnv);
  if (verdict === 'ok') return;

  const fields = { role: report.role, attributes: report.dangerousAttributes };
  if (verdict === 'refuse') {
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
