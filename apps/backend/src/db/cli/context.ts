// Shared by the command line tools in this folder (pnpm db:migrate, db:reset, seed:*).
import { type AppConfig, EnvError, loadEnv } from '../../config/env.js';

export function loadConfigOrExit(): AppConfig {
  try {
    return loadEnv();
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Runs a tool and turns any error into a short message and a non-zero exit code. */
export function runTool(main: () => Promise<void>): void {
  main().then(
    () => process.exit(0),
    (error: unknown) => {
      // The message may come from the database; it never contains the connection URL.
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
