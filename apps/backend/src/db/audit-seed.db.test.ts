import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, describeDb, type TestDatabase } from '../test/database.js';
import { recordAudit } from './audit.js';
import { createDatabase, type Database } from './client.js';
import { isCheckViolation } from './errors.js';
import { countSampleRows } from './sample-data-gate.js';
import { auditLogs } from './schema/audit.js';
import { sampleDataRegistry } from './schema/sample-data.js';
import { runSeeds, type Seeder, SeedRefusedError } from './seed/runner.js';

describeDb('audit writer, transactions and the seed system', () => {
  let testDb: TestDatabase;
  let database: Database;
  const STAFF = '0198a4b2-0000-7000-8000-0000000000aa';

  beforeAll(async () => {
    testDb = await createTestDatabase();
    database = createDatabase({ url: testDb.appUrl, poolMax: 3 });
  });
  afterAll(async () => {
    await database.close();
    await testDb.drop();
  });
  // audit_logs is append-only for everyone, so each test looks only at its own action name.

  describe('recordAudit', () => {
    it('stores who did what, to which entity, with the request id', async () => {
      await recordAudit(database.db, {
        actor: { type: 'staff', id: STAFF },
        action: 'product.price_changed',
        entity: { type: 'product', id: 'p-1' },
        requestId: 'req-123',
        details: { from: 90000, to: 85000 },
      });
      const [row] = await database.db.select().from(auditLogs).where(eq(auditLogs.entityId, 'p-1'));
      expect(row).toMatchObject({
        actorType: 'staff',
        actorId: STAFF,
        action: 'product.price_changed',
        entityType: 'product',
        requestId: 'req-123',
        details: { from: 90000, to: 85000 },
      });
      expect(row?.occurredAt).toBeInstanceOf(Date);
    });

    it('never stores sensitive values, even when the caller passes them', async () => {
      await recordAudit(database.db, {
        actor: { type: 'system' },
        action: 'order.contact_updated',
        entity: { type: 'order', id: 'redact-1' },
        details: { phone: '07700000000', note: { authToken: 'T0KEN', kept: 'yes' } },
      });
      const [row] = await database.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, 'redact-1'));
      expect(JSON.stringify(row?.details)).not.toMatch(/07700000000|T0KEN/);
      expect(row?.details).toEqual({
        phone: '[redacted]',
        note: { authToken: '[redacted]', kept: 'yes' },
      });
    });

    it('lets the database reject an invalid action name', async () => {
      const error = await recordAudit(database.db, {
        actor: { type: 'system' },
        action: 'Not A Valid Action',
      }).catch((caught: unknown) => caught);
      expect(isCheckViolation(error)).toBe(true);
    });

    it('is part of the surrounding transaction: a rollback removes the audit row too', async () => {
      await database.db
        .transaction(async (tx) => {
          await recordAudit(tx, {
            actor: { type: 'guest' },
            action: 'order.placed',
            entity: { type: 'order', id: 'rolled-back' },
          });
          throw new Error('the order failed after the audit row was written');
        })
        .catch(() => undefined);
      const rows = await database.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, 'rolled-back'));
      expect(rows).toEqual([]);
    });
  });

  describe('runSeeds', () => {
    // Stand-ins for real seeders: they write audit rows as "data", which is enough to prove the
    // transaction and registry behaviour. Phase 3 adds real ones.
    const insertRow =
      (id: string): Seeder['run'] =>
      async (tx, context) => {
        await tx.insert(auditLogs).values({
          actorType: 'system',
          action: 'seed.sample_row',
          entityType: 'sample',
          entityId: id,
        });
        await context.registerSample('audit_logs', id);
      };
    const dev = (name: string, id: string): Seeder => ({ name, level: 'dev', run: insertRow(id) });

    beforeEach(async () => {
      // The registry is not append-only, so tests can start from an empty one.
      await database.db.delete(sampleDataRegistry);
    });

    it('records every row a dev seeder inserts, so the gate can see sample data', async () => {
      expect(await countSampleRows(database.db)).toBe(0);
      const result = await runSeeds({
        db: database.db,
        level: 'dev',
        appEnv: 'development',
        seeders: [dev('one', 'a'), dev('two', 'b')],
        now: () => new Date('2026-10-27T09:00:00Z'),
      });
      expect(result.ran).toEqual(['one', 'two']);
      expect(await countSampleRows(database.db)).toBe(2);
      const rows = await database.db.select().from(sampleDataRegistry);
      expect(rows.map((r) => r.seedBatch)).toEqual([
        'dev-2026-10-27T09:00:00.000Z',
        'dev-2026-10-27T09:00:00.000Z',
      ]);
    });

    it('registering the same row twice keeps one registry row', async () => {
      await runSeeds({
        db: database.db,
        level: 'dev',
        appEnv: 'staging',
        seeders: [dev('twice', 'same-id'), dev('again', 'same-id')],
      });
      expect(await countSampleRows(database.db)).toBe(1);
    });

    it('refuses dev seeds in production and test, and writes nothing', async () => {
      for (const appEnv of ['production', 'test'] as const) {
        await expect(
          runSeeds({ db: database.db, level: 'dev', appEnv, seeders: [dev('x', 'refused')] }),
        ).rejects.toThrow(SeedRefusedError);
      }
      expect(await countSampleRows(database.db)).toBe(0);
      const rows = await database.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, 'refused'));
      expect(rows).toEqual([]);
    });

    it('runs reference seeders everywhere, including production, and registers nothing', async () => {
      const reference: Seeder = {
        name: 'reference data',
        level: 'reference',
        run: async (tx) => {
          await tx.insert(auditLogs).values({
            actorType: 'system',
            action: 'seed.reference_row',
            entityType: 'reference',
            entityId: 'ref-1',
          });
        },
      };
      const result = await runSeeds({
        db: database.db,
        level: 'reference',
        appEnv: 'production',
        seeders: [reference, dev('not selected', 'not-run')],
      });
      expect(result.ran).toEqual(['reference data']);
      expect(await countSampleRows(database.db)).toBe(0);
    });

    it('is all or nothing: a failing seeder undoes the ones before it', async () => {
      const failing: Seeder = {
        name: 'broken',
        level: 'dev',
        run: async () => {
          throw new Error('boom');
        },
      };
      await expect(
        runSeeds({
          db: database.db,
          level: 'dev',
          appEnv: 'development',
          seeders: [dev('first', 'rolled-back-seed'), failing],
        }),
      ).rejects.toThrow('boom');
      expect(await countSampleRows(database.db)).toBe(0);
      const rows = await database.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, 'rolled-back-seed'));
      expect(rows).toEqual([]);
    });
  });
});
