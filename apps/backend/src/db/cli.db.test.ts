// Runs the real command line tools (the same code `pnpm db:migrate`, `pnpm seed:dev` and the
// deployment gate run) as separate processes, so the wiring, the exit codes and the messages
// are tested, not only the functions behind them.
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, describeDb, type TestDatabase } from '../test/database.js';

const run = promisify(execFile);
const BACKEND_DIR = fileURLToPath(new URL('../..', import.meta.url));

async function cli(tool: string, args: string[], env: Record<string, string>) {
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      ['--import', 'tsx', `src/db/cli/${tool}.ts`, ...args],
      { cwd: BACKEND_DIR, env: { PATH: process.env.PATH ?? '', ...env }, timeout: 30_000 },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, stdout: failed.stdout ?? '', stderr: failed.stderr ?? '' };
  }
}

describeDb('command line tools', () => {
  let fresh: TestDatabase;
  let ready: TestDatabase;
  let readyApp: pg.Pool;

  beforeAll(async () => {
    fresh = await createTestDatabase({ migrate: false });
    ready = await createTestDatabase();
    readyApp = new pg.Pool({ connectionString: ready.appUrl, max: 1 });
  });
  afterAll(async () => {
    await readyApp.end();
    await Promise.all([fresh.drop(), ready.drop()]);
  });

  describe('db:migrate', () => {
    it('migrates an empty database with the owner URL', async () => {
      const result = await cli('migrate', [], {
        APP_ENV: 'development',
        MIGRATION_DATABASE_URL: fresh.ownerUrl,
      });
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Migrations are up to date.');
      const pool = new pg.Pool({ connectionString: fresh.ownerUrl, max: 1 });
      const tables = await pool.query(`select 1 from pg_tables where tablename = 'audit_logs'`);
      await pool.end();
      expect(tables.rowCount).toBe(1);
    });

    it('stops with a clear message when the owner URL is missing, and shows no password', async () => {
      const result = await cli('migrate', [], {
        APP_ENV: 'development',
        DATABASE_URL: ready.appUrl,
      });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('MIGRATION_DATABASE_URL is required');
      expect(result.stderr + result.stdout).not.toContain('devonly');
    });

    it('does not print the password when the connection fails', async () => {
      const result = await cli('migrate', [], {
        APP_ENV: 'development',
        MIGRATION_DATABASE_URL: 'postgres://scentiq_owner:devonly_owner@127.0.0.1:1/none',
      });
      expect(result.code).toBe(1);
      expect(result.stderr + result.stdout).not.toContain('devonly_owner');
    });
  });

  describe('db:reset', () => {
    it('wipes the data, migrates again and the application role still works', async () => {
      const owner = new pg.Pool({ connectionString: ready.ownerUrl, max: 1 });
      await owner.query(`insert into sample_data_registry (table_name, row_id, seed_batch)
                         values ('brands', 'to-be-wiped', 'b')`);
      const result = await cli('reset', [], {
        APP_ENV: 'development',
        MIGRATION_DATABASE_URL: ready.ownerUrl,
      });
      expect(result.code).toBe(0);
      const after = await owner.query('select count(*) from sample_data_registry');
      expect(Number(after.rows[0].count)).toBe(0);
      await owner.end();
      // Privileges came back with the migrations, so the server can still write.
      await readyApp.query(
        `insert into audit_logs (actor_type, action) values ('system', 'reset.check')`,
      );
    });
  });

  describe('seed:dev', () => {
    it('refuses to run when APP_ENV is test or production-like, and says why', async () => {
      const result = await cli('seed', ['dev'], { APP_ENV: 'test', DATABASE_URL: ready.appUrl });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('only runs in development or staging');
    });

    it('runs in development', async () => {
      const result = await cli('seed', ['dev'], {
        APP_ENV: 'development',
        DATABASE_URL: ready.appUrl,
      });
      expect(result.code).toBe(0);
    });

    it('rejects an unknown level', async () => {
      const result = await cli('seed', ['everything'], {
        APP_ENV: 'development',
        DATABASE_URL: ready.appUrl,
      });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Usage');
    });
  });

  describe('db:assert-no-sample-data (deployment gate)', () => {
    const env = () => ({ APP_ENV: 'development', DATABASE_URL: ready.appUrl });

    it('passes when the registry is empty', async () => {
      const result = await cli('assert-no-sample-data', [], env());
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('No sample data found.');
    });

    it('fails, with the number of rows, when sample data exists', async () => {
      await readyApp.query(
        `insert into sample_data_registry (table_name, row_id, seed_batch) values ('brands', 'x', 'b')`,
      );
      const result = await cli('assert-no-sample-data', [], env());
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('Found 1 sample data row(s)');
    });

    it('fails when DATABASE_URL is missing instead of passing by accident', async () => {
      const result = await cli('assert-no-sample-data', [], { APP_ENV: 'development' });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('DATABASE_URL is required');
    });
  });
});
