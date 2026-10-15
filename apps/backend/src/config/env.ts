// Environment handling (ADR-0003): every variable is validated once at startup with Zod and the
// process refuses to start with a readable message when something is wrong. Values are never
// echoed back, only variable names and the rule that failed, so secrets cannot leak into logs.
import { resolve } from 'node:path';
import { z } from 'zod';

const APP_ENVS = ['development', 'test', 'staging', 'production'] as const;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type AppEnv = (typeof APP_ENVS)[number];

/** An empty value in .env (for example `SITE_ORIGIN=`) means "not set". */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const originSchema = z.preprocess(
  blankToUndefined,
  z
    .url()
    .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
      message: 'must start with http:// or https://',
    })
    .transform((value) => new URL(value).origin)
    .optional(),
);

const envSchema = z
  .object({
    APP_ENV: z.preprocess(blankToUndefined, z.enum(APP_ENVS).default('development')),
    HOST: z.preprocess(blankToUndefined, z.string().min(1).default('127.0.0.1')),
    PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(65535).default(3000)),
    LOG_LEVEL: z.preprocess(blankToUndefined, z.enum(LOG_LEVELS).default('info')),
    TRUST_PROXY: z.preprocess(
      blankToUndefined,
      z
        .enum(['true', 'false'])
        .default('false')
        .transform((value) => value === 'true'),
    ),
    SITE_ORIGIN: originSchema,
    FRONTEND_DIST_DIR: z.preprocess(
      blankToUndefined,
      z.string().min(1).default('../frontend/dist'),
    ),
  })
  .superRefine((env, ctx) => {
    const needsOrigin = env.APP_ENV === 'staging' || env.APP_ENV === 'production';
    if (!needsOrigin) return;
    if (env.SITE_ORIGIN === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['SITE_ORIGIN'],
        message: 'is required when APP_ENV is staging or production',
      });
    } else if (!env.SITE_ORIGIN.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['SITE_ORIGIN'],
        message: 'must use https:// when APP_ENV is staging or production',
      });
    }
  });

export interface AppConfig {
  appEnv: AppEnv;
  host: string;
  port: number;
  logLevel: (typeof LOG_LEVELS)[number];
  trustProxy: boolean;
  /** Public origin without a trailing slash, for canonical URLs and Open Graph. */
  siteOrigin: string;
  /** Absolute path of the built frontend. */
  frontendDistDir: string;
  isProduction: boolean;
  /** Only production may be indexed; staging, development and test are always noindex. */
  allowIndexing: boolean;
  /** Sample data and developer pages exist only outside production (ADR-0015). */
  allowSampleData: boolean;
}

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvError';
  }
}

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd(),
): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => {
      const name = issue.path.length > 0 ? issue.path.join('.') : 'environment';
      return ` - ${name}: ${issue.message}`;
    });
    throw new EnvError(
      `Invalid environment configuration. Fix these variables (see apps/backend/.env.example):\n${lines.join('\n')}`,
    );
  }

  const env = parsed.data;
  const isProduction = env.APP_ENV === 'production';
  return {
    appEnv: env.APP_ENV,
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    trustProxy: env.TRUST_PROXY,
    siteOrigin: env.SITE_ORIGIN ?? `http://localhost:${env.PORT}`,
    frontendDistDir: resolve(cwd, env.FRONTEND_DIST_DIR),
    isProduction,
    allowIndexing: isProduction,
    allowSampleData: !isProduction,
  };
}
