import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { type AppConfig, loadEnv } from '../config/env.js';
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
} as const;

export async function makeApp(
  env: Record<string, string> = {},
  products?: ProductSource,
): Promise<FastifyInstance> {
  const app = await buildApp({
    config: testConfig(env),
    logger: false,
    ...(products === undefined ? {} : { products }),
  });
  return app;
}
