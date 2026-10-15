import { buildApp } from './app.js';
import { type AppConfig, EnvError, loadEnv } from './config/env.js';

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

  const app = await buildApp({ config });

  // SIGINT covers Ctrl+C on Windows too; SIGTERM is what Docker and systemd send.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'shutting down');
      app.close().then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
  }

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
