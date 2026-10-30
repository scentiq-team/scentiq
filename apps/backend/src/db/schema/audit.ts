// Who did what, and when. The table is append-only: a trigger rejects UPDATE, DELETE and TRUNCATE
// (migration 0003), and the application role has no UPDATE or DELETE privilege either.
import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { primaryId } from './columns.js';

export const AUDIT_ACTOR_TYPES = ['system', 'staff', 'guest'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

/** Upper bound for `details`, so a log row can never become a data dump. */
export const AUDIT_DETAILS_MAX_BYTES = 16_384;

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: primaryId(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorType: text('actor_type').notNull(),
    /** The staff user. No foreign key yet: the users table arrives in Phase 7A, which adds it. */
    actorId: uuid('actor_id'),
    /** Dotted lower-case name such as `product.price_changed`. */
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    requestId: text('request_id'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    check('audit_logs_actor_type_valid', sql`${t.actorType} in ('system', 'staff', 'guest')`),
    check(
      'audit_logs_staff_has_actor',
      sql`(${t.actorType} = 'staff') = (${t.actorId} is not null)`,
    ),
    check(
      'audit_logs_action_format',
      sql`${t.action} ~ '^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$' and length(${t.action}) <= 100`,
    ),
    check('audit_logs_entity_pair', sql`(${t.entityType} is null) = (${t.entityId} is null)`),
    check('audit_logs_details_object', sql`jsonb_typeof(${t.details}) = 'object'`),
    check(
      'audit_logs_details_size',
      sql`octet_length(${t.details}::text) <= ${sql.raw(String(AUDIT_DETAILS_MAX_BYTES))}`,
    ),
    index('audit_logs_occurred_at_idx').on(t.occurredAt.desc()),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId, t.occurredAt.desc()),
  ],
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
