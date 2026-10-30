// The one way to write an audit row. It accepts only values the table's CHECK constraints
// accept, and it strips sensitive keys from `details` so a careless caller cannot leak a
// password, a token or a customer's contact details into a log that is kept forever.

import type { DbExecutor } from './client.js';
import { type AuditActorType, auditLogs } from './schema/audit.js';

export type AuditActor = { type: 'system' } | { type: 'guest' } | { type: 'staff'; id: string };

export interface AuditEntry {
  actor: AuditActor;
  /** Dotted lower-case name, for example `product.price_changed`. */
  action: string;
  entity?: { type: string; id: string };
  requestId?: string;
  details?: Record<string, unknown>;
}

const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|phone|address/i;
const MAX_DEPTH = 6;

/** Copies `value`, replacing the content of sensitive keys at any depth. */
export function redactDetails(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => redactDetails(item, depth + 1));
  if (typeof value === 'object' && value !== null) {
    // A Date (or anything else with toJSON) must keep the value JSON would give it.
    const { toJSON } = value as { toJSON?: unknown };
    if (typeof toJSON === 'function') return redactDetails(toJSON.call(value), depth + 1);
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[redacted]' : redactDetails(inner, depth + 1),
      ]),
    );
  }
  return value;
}

export async function recordAudit(executor: DbExecutor, entry: AuditEntry): Promise<void> {
  const actorType: AuditActorType = entry.actor.type;
  await executor.insert(auditLogs).values({
    actorType,
    actorId: entry.actor.type === 'staff' ? entry.actor.id : null,
    action: entry.action,
    entityType: entry.entity?.type ?? null,
    entityId: entry.entity?.id ?? null,
    requestId: entry.requestId ?? null,
    details: redactDetails(entry.details ?? {}) as Record<string, unknown>,
  });
}
