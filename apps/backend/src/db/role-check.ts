// The server must not run with a database role that can change the schema or bypass rules.
// A superuser (or a role with createdb, createrole or bypassrls) turns one SQL injection into a
// full takeover, so staging and production refuse to start with such a role.
import { sql } from 'drizzle-orm';
import type { AppEnv } from '../config/env.js';
import type { Db } from './client.js';

export interface RoleReport {
  role: string;
  /** Empty when the role is least-privilege. */
  dangerousAttributes: string[];
}

export async function inspectRole(db: Db): Promise<RoleReport> {
  const result = await db.execute<{
    role: string;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolbypassrls: boolean;
    rolreplication: boolean;
  }>(sql`
    select current_user::text as role, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication
    from pg_roles where rolname = current_user
  `);
  const row = result.rows[0];
  if (row === undefined) throw new Error('Could not read the attributes of the database role.');
  const dangerousAttributes = (
    [
      ['superuser', row.rolsuper],
      ['createdb', row.rolcreatedb],
      ['createrole', row.rolcreaterole],
      ['bypassrls', row.rolbypassrls],
      ['replication', row.rolreplication],
    ] as const
  )
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
  return { role: row.role, dangerousAttributes };
}

export type RoleVerdict = 'ok' | 'warn' | 'refuse';

/** Staging and production refuse a powerful role; development only warns. */
export function roleVerdict(report: RoleReport, appEnv: AppEnv): RoleVerdict {
  if (report.dangerousAttributes.length === 0) return 'ok';
  return appEnv === 'production' || appEnv === 'staging' ? 'refuse' : 'warn';
}

/** Staging and production: nothing may run unchecked. */
export function isStrictEnv(appEnv: AppEnv): boolean {
  return appEnv === 'production' || appEnv === 'staging';
}

export interface StartupRoleOptions {
  /** How many times to try to reach the database before giving up. */
  attempts: number;
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Strict environments wait a little for the database (it may be starting at the same moment as
 * the server) and then refuse to start; development tries once and carries on.
 */
export function startupRoleOptions(appEnv: AppEnv): StartupRoleOptions {
  return isStrictEnv(appEnv) ? { attempts: 5, delayMs: 2000 } : { attempts: 1, delayMs: 0 };
}

export type StartupRoleResult =
  | { status: 'ok' }
  | { status: 'warn'; report: RoleReport }
  | { status: 'refuse'; report: RoleReport }
  | { status: 'unreachable' };

/**
 * The role check must never be skipped silently in staging and production: "the database was
 * down for a moment at startup" would otherwise let a superuser connection run for good.
 */
export async function checkRoleAtStartup(
  inspect: () => Promise<RoleReport>,
  appEnv: AppEnv,
  options: StartupRoleOptions,
): Promise<StartupRoleResult> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    let report: RoleReport;
    try {
      report = await inspect();
    } catch {
      if (attempt < options.attempts) await sleep(options.delayMs);
      continue;
    }
    const verdict = roleVerdict(report, appEnv);
    return verdict === 'ok' ? { status: 'ok' } : { status: verdict, report };
  }
  return { status: 'unreachable' };
}
