import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { type AppConfig, loadEnv } from '../config/env.js';
import type { Database } from '../db/client.js';
import type { ProductSource } from '../modules/seo/types.js';

// A tiny stand-in for the built frontend. It must not be called "dist": the root .gitignore
// ignores every folder with that name, so the fixture would exist on this disk but never reach
// Git, and the tests would fail on a clean checkout (which is how CI caught it).
export const fixtureDist = fileURLToPath(new URL('./fixtures/frontend-build', import.meta.url));

/** A validated config pointing at the fixture frontend; pass env overrides per test. */
export function testConfig(env: Record<string, string> = {}): AppConfig {
  return loadEnv({
    APP_ENV: 'test',
    LOG_LEVEL: 'silent',
    FRONTEND_DIST_DIR: fixtureDist,
    ...env,
  });
}

export const productionEnv = {
  APP_ENV: 'production',
  SITE_ORIGIN: 'https://scentiq.example',
  // Only validated, never connected to: the tests that use this config pass no database.
  DATABASE_URL: 'postgres://scentiq_app:Pq7-r3al-looking@db.internal:5432/scentiq',
} as const;

export async function makeApp(
  env: Record<string, string> = {},
  products?: ProductSource,
  database?: Pick<Database, 'ping'>,
): Promise<FastifyInstance> {
  const app = await buildApp({
    config: testConfig(env),
    logger: false,
    ...(products === undefined ? {} : { products }),
    ...(database === undefined ? {} : { database }),
  });
  return app;
}
