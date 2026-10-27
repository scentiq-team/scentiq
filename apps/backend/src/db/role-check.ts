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
