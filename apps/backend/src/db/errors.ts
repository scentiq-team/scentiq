// Classifies PostgreSQL errors in one place. Drizzle wraps the driver error, so the SQLSTATE code
// is on `error.cause.code`; plain `pg` errors carry it on `error.code`. Callers never match on
// message text and never send a database message to a client.

const CODE = /^[0-9A-Z]{5}$/;

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_CHECK_VIOLATION = '23514';
export const PG_FOREIGN_KEY_VIOLATION = '23503';
/** Reported for `ON DELETE RESTRICT`; `NO ACTION` reports 23503 instead (spike, 2026-10-26). */
export const PG_RESTRICT_VIOLATION = '23001';
/** Raised by the append-only triggers. */
export const PG_INTEGRITY_VIOLATION = '23000';
export const PG_INSUFFICIENT_PRIVILEGE = '42501';

export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  // Drizzle puts the driver error one level down; look a few levels deep, never loop forever.
  for (let depth = 0; depth < 4 && typeof current === 'object' && current !== null; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && CODE.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export const isUniqueViolation = (error: unknown): boolean =>
  pgErrorCode(error) === PG_UNIQUE_VIOLATION;

export const isCheckViolation = (error: unknown): boolean =>
  pgErrorCode(error) === PG_CHECK_VIOLATION;

/** True when a row cannot be removed or changed because other rows still point to it. */
export const isStillReferenced = (error: unknown): boolean => {
  const code = pgErrorCode(error);
  return code === PG_RESTRICT_VIOLATION || code === PG_FOREIGN_KEY_VIOLATION;
};
