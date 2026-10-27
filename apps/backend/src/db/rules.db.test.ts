// Every rule the database enforces has a test here that fails if the rule is removed: an invalid
// statement must be rejected by that specific constraint (checked by name), so if the constraint
// disappears the statement succeeds and the test fails.

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  constraintOf,
  createTestDatabase,
  describeDb,
  type TestDatabase,
} from '../test/database.js';
import { createDatabase, type Database } from './client.js';
import {
  PG_CHECK_VIOLATION,
  PG_INSUFFICIENT_PRIVILEGE,
  PG_INTEGRITY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  pgErrorCode,
} from './errors.js';
import { inspectRole, roleVerdict } from './role-check.js';

async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('The statement was accepted, but the database should have rejected it.');
}

describeDb('database rules', () => {
  let database: TestDatabase;
  let owner: pg.Pool;
  let app: pg.Pool;
  let superuser: pg.Pool;

  beforeAll(async () => {
    database = await createTestDatabase();
    owner = new pg.Pool({ connectionString: database.ownerUrl, max: 2 });
    app = new pg.Pool({ connectionString: database.appUrl, max: 2 });
    superuser = new pg.Pool({ connectionString: database.superUrl, max: 1 });
  });
  afterAll(async () => {
    await Promise.all([owner.end(), app.end(), superuser.end()]);
    await database.drop();
  });

  const insertAudit = (values: {
    actorType?: string;
    actorId?: string | null;
    action?: string;
    entityType?: string | null;
    entityId?: string | null;
    details?: string;
  }) =>
    app.query(
      `insert into audit_logs (actor_type, actor_id, action, entity_type, entity_id, details)
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        values.actorType ?? 'system',
        values.actorId ?? null,
        values.action ?? 'product.price_changed',
        values.entityType ?? null,
        values.entityId ?? null,
        values.details ?? '{}',
      ],
    );

  describe('audit_logs constraints', () => {
    const STAFF = '0198a4b2-0000-7000-8000-000000000001';

    it('accepts valid rows for each kind of actor', async () => {
      await insertAudit({ actorType: 'system' });
      await insertAudit({ actorType: 'guest', entityType: 'order', entityId: 'o-1' });
      await insertAudit({ actorType: 'staff', actorId: STAFF, details: '{"from":1,"to":2}' });
    });

    const rejected: [string, string, Parameters<typeof insertAudit>[0]][] = [
      ['an unknown actor type', 'audit_logs_actor_type_valid', { actorType: 'robot' }],
      ['a staff row without a staff id', 'audit_logs_staff_has_actor', { actorType: 'staff' }],
      [
        'a system row that names a staff id',
        'audit_logs_staff_has_actor',
        { actorType: 'system', actorId: STAFF },
      ],
      ['an action with capitals', 'audit_logs_action_format', { action: 'Product.Changed' }],
      ['an action without a dot', 'audit_logs_action_format', { action: 'changed' }],
      ['an action with spaces', 'audit_logs_action_format', { action: 'product. changed' }],
      [
        'an action longer than 100 characters',
        'audit_logs_action_format',
        { action: `a.${'b'.repeat(99)}` },
      ],
      ['an entity type without an id', 'audit_logs_entity_pair', { entityType: 'order' }],
      ['an entity id without a type', 'audit_logs_entity_pair', { entityId: 'o-1' }],
      ['details that are a list', 'audit_logs_details_object', { details: '[1,2]' }],
      ['details that are JSON null', 'audit_logs_details_object', { details: 'null' }],
      [
        'details larger than 16 KB',
        'audit_logs_details_size',
        { details: JSON.stringify({ blob: 'x'.repeat(17_000) }) },
      ],
    ];
    it.each(rejected)('rejects %s', async (_label, constraint, values) => {
      const error = await failure(insertAudit(values));
      expect(pgErrorCode(error)).toBe(PG_CHECK_VIOLATION);
      expect(constraintOf(error)).toBe(constraint);
    });

    it('gives every row a UUIDv7 id that sorts by creation time', async () => {
      const first = await app.query(
        `insert into audit_logs (actor_type, action) values ('system', 'a.one') returning id`,
      );
      const second = await app.query(
        `insert into audit_logs (actor_type, action) values ('system', 'a.two') returning id`,
      );
      const [a, b] = [first.rows[0].id as string, second.rows[0].id as string];
      expect(a[14]).toBe('7');
      expect(a < b).toBe(true);
    });
  });

  describe('sample_data_registry constraints', () => {
    it('allows a row once and rejects the same table and row id again', async () => {
      await app.query(
        `insert into sample_data_registry (table_name, row_id, seed_batch) values ('brands', '1', 'b')`,
      );
      const error = await failure(
        app.query(
          `insert into sample_data_registry (table_name, row_id, seed_batch) values ('brands', '1', 'b')`,
        ),
      );
      expect(pgErrorCode(error)).toBe(PG_UNIQUE_VIOLATION);
      expect(constraintOf(error)).toBe('sample_data_registry_row_uq');
    });

    it('rejects a table name that is not a plain lower-case identifier', async () => {
      const error = await failure(
        app.query(
          `insert into sample_data_registry (table_name, row_id, seed_batch) values ('Brands; drop', '1', 'b')`,
        ),
      );
      expect(constraintOf(error)).toBe('sample_data_registry_table_name_format');
    });
  });

  describe('audit_logs is append-only', () => {
    let rowId: string;
    beforeAll(async () => {
      const result = await app.query(
        `insert into audit_logs (actor_type, action) values ('system', 'append.only_probe') returning id`,
      );
      rowId = result.rows[0].id as string;
    });

    const statements = [
      ['UPDATE', `update audit_logs set action = 'tampered.row' where id = $1`],
      ['DELETE', `delete from audit_logs where id = $1`],
    ] as const;

    it.each(statements)(
      'the trigger rejects %s even for the owner and the superuser',
      async (_n, sql) => {
        for (const pool of [owner, superuser]) {
          const error = await failure(pool.query(sql, [rowId]));
          expect(pgErrorCode(error)).toBe(PG_INTEGRITY_VIOLATION);
          expect((error as Error).message).toMatch(/append-only/);
        }
      },
    );

    it('the trigger rejects TRUNCATE even for the owner and the superuser', async () => {
      for (const pool of [owner, superuser]) {
        const error = await failure(pool.query('truncate audit_logs'));
        expect(pgErrorCode(error)).toBe(PG_INTEGRITY_VIOLATION);
      }
    });

    it.each(statements)('the application role is not even allowed to try %s', async (_n, sql) => {
      const error = await failure(app.query(sql, [rowId]));
      expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    });

    it('the application role cannot TRUNCATE either', async () => {
      const error = await failure(app.query('truncate audit_logs'));
      expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    });

    it('the row is unchanged after all those attempts', async () => {
      const result = await app.query('select action from audit_logs where id = $1', [rowId]);
      expect(result.rows).toEqual([{ action: 'append.only_probe' }]);
    });
  });

  describe('least privilege', () => {
    let appDatabase: Database;
    let ownerDatabase: Database;
    let superDatabase: Database;
    beforeAll(() => {
      appDatabase = createDatabase({ url: database.appUrl, poolMax: 1 });
      ownerDatabase = createDatabase({ url: database.ownerUrl, poolMax: 1 });
      superDatabase = createDatabase({ url: database.superUrl, poolMax: 1 });
    });
    afterAll(async () => {
      await Promise.all([appDatabase.close(), ownerDatabase.close(), superDatabase.close()]);
    });

    it('the application role has no dangerous attribute, so production accepts it', async () => {
      const report = await inspectRole(appDatabase.db);
      expect(report).toEqual({ role: 'scentiq_app', dangerousAttributes: [] });
      expect(roleVerdict(report, 'production')).toBe('ok');
    });

    it('the owner role is not a superuser either', async () => {
      expect((await inspectRole(ownerDatabase.db)).dangerousAttributes).toEqual([]);
    });

    it('a superuser is detected and refused in production', async () => {
      const report = await inspectRole(superDatabase.db);
      expect(report.dangerousAttributes).toContain('superuser');
      expect(roleVerdict(report, 'production')).toBe('refuse');
    });

    it.each([
      ['create a table', 'create table injected (id int)'],
      ['drop a table', 'drop table audit_logs'],
      [
        'disable the append-only trigger',
        'alter table audit_logs disable trigger audit_logs_append_only',
      ],
      ['drop the append-only trigger', 'drop trigger audit_logs_append_only on audit_logs'],
      ['drop the guard function', 'drop function forbid_mutation() cascade'],
      ['add a column', 'alter table audit_logs add column leaked text'],
    ])('the application role cannot %s', async (_label, sql) => {
      const error = await failure(app.query(sql));
      expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    });

    it('tables the owner creates later are readable and writable by the application role', async () => {
      await owner.query('create table later_table (id int primary key)');
      await app.query('insert into later_table (id) values (1)');
      const result = await app.query('select id from later_table');
      expect(result.rows).toEqual([{ id: 1 }]);
      // ... but still not truncatable, because TRUNCATE is deliberately not granted.
      const error = await failure(app.query('truncate later_table'));
      expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    });
  });
});
