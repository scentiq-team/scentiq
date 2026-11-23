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

/**
 * A PostgreSQL connection URL. The refine message never contains the value, because the URL
 * carries the password.
 */
const databaseUrlSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .refine(
      (value) => {
        const url = parseUrl(value);
        return (
          url !== undefined &&
          ['postgres:', 'postgresql:'].includes(url.protocol) &&
          canDecode(url.username) &&
          canDecode(url.password)
        );
      },
      {
        message:
          'must be a valid URL that starts with postgres:// or postgresql:// (percent-encode special characters in the user name and password)',
      },
    )
    .optional(),
);

/** Passwords of the development roles contain this word (docker/postgres/01-dev-roles.sql). */
export const DEV_PASSWORD_MARKER = 'devonly';

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
    /** Where the local-disk media driver keeps image files (development and tests; ADR-0009). */
    MEDIA_LOCAL_DIR: z.preprocess(blankToUndefined, z.string().min(1).default('.data/media')),
    DATABASE_URL: databaseUrlSchema,
    DATABASE_POOL_MAX: z.preprocess(
      blankToUndefined,
      z.coerce.number().int().min(1).max(50).default(10),
    ),
    MIGRATION_DATABASE_URL: databaseUrlSchema,
  })
  .superRefine((env, ctx) => {
    const needsOrigin = env.APP_ENV === 'staging' || env.APP_ENV === 'production';
    if (!needsOrigin) return;
    checkDatabaseUrls(env, ctx);
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

/** `new URL` throws a TypeError that carries the whole input (the password included). */
function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function canDecode(text: string): boolean {
  try {
    decodeURIComponent(text);
    return true;
  } catch {
    return false;
  }
}

function passwordOf(url: URL): string {
  try {
    return decodeURIComponent(url.password);
  } catch {
    return url.password;
  }
}

interface DatabaseEnv {
  DATABASE_URL?: string | undefined;
  MIGRATION_DATABASE_URL?: string | undefined;
}

/** Rules that only apply when real customers could be affected (staging and production). */
function checkDatabaseUrls(env: DatabaseEnv, ctx: z.RefinementCtx): void {
  if (env.DATABASE_URL === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: 'is required when APP_ENV is staging or production',
    });
    return;
  }
  // A malformed URL is already reported by the field itself; here it is simply skipped.
  const appUrl = parseUrl(env.DATABASE_URL);
  const migrationUrl =
    env.MIGRATION_DATABASE_URL === undefined ? undefined : parseUrl(env.MIGRATION_DATABASE_URL);
  for (const [name, url] of [
    ['DATABASE_URL', appUrl],
    ['MIGRATION_DATABASE_URL', migrationUrl],
  ] as const) {
    if (url !== undefined && passwordOf(url).includes(DEV_PASSWORD_MARKER)) {
      ctx.addIssue({
        code: 'custom',
        path: [name],
        message: 'uses a development password; create real database roles for this environment',
      });
    }
  }
  if (
    appUrl !== undefined &&
    migrationUrl !== undefined &&
    migrationUrl.username === appUrl.username
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['MIGRATION_DATABASE_URL'],
      message:
        'must use a different database role than DATABASE_URL (the application role must not own the tables)',
    });
  }
}

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
  /** Absolute path of the folder the local-disk media driver writes to. */
  mediaLocalDir: string;
  /** Application role (read and write rows only). Optional in development and test. */
  databaseUrl: string | undefined;
  databasePoolMax: number;
  /** Owner role used only by `pnpm db:migrate` and `pnpm db:reset`, never by the server. */
  migrationDatabaseUrl: string | undefined;
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
    mediaLocalDir: resolve(cwd, env.MEDIA_LOCAL_DIR),
    databaseUrl: env.DATABASE_URL,
    databasePoolMax: env.DATABASE_POOL_MAX,
    migrationDatabaseUrl: env.MIGRATION_DATABASE_URL,
    isProduction,
    allowIndexing: isProduction,
    allowSampleData: !isProduction,
  };
}
