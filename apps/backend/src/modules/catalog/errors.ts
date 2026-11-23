// What a catalog service can refuse, in terms the HTTP layer can map later (Phase 7) without reading
// database messages. `reason` is a stable machine key (a constraint name, or one of ours such as
// `slug_taken`); it is never shown to a shopper and never contains user data.

import {
  isCheckViolation,
  isStillReferenced,
  isUniqueViolation,
  pgConstraintName,
} from '../../db/errors.js';

export type CatalogErrorKind =
  /** The row asked for does not exist (or is archived where that matters). */
  | 'not_found'
  /** The change collides with another row: a taken slug or SKU, or a row still in use. */
  | 'conflict'
  /** The input breaks a rule: a missing reference, a value the database refuses. */
  | 'invalid'
  /** The product cannot be (or stay) published: `details.missing` names what it lacks. */
  | 'not_publishable';

export class CatalogError extends Error {
  readonly kind: CatalogErrorKind;
  readonly reason: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    kind: CatalogErrorKind,
    reason: string,
    details: Record<string, unknown> = {},
    options?: { cause?: unknown },
  ) {
    super(`${kind}: ${reason}`, options);
    this.name = 'CatalogError';
    this.kind = kind;
    this.reason = reason;
    this.details = details;
  }
}

export const isCatalogError = (error: unknown): error is CatalogError =>
  error instanceof CatalogError;

/** The constraints that make a product unpublishable: the publish gate and its required fields. */
const PUBLISH_CONSTRAINTS = new Set([
  'products_publish_requires_children',
  'products_published_required_fields',
  'products_published_has_timestamp',
]);

/**
 * Turns a database rejection into a CatalogError, or returns the original error when it is not one
 * of ours (a lost connection, a timeout: those must stay errors). Call it in a `catch` and throw the
 * result.
 */
export function translateDbError(error: unknown): unknown {
  if (isCatalogError(error)) return error;
  const constraint = pgConstraintName(error);
  if (constraint === undefined) return error;
  if (isUniqueViolation(error))
    return new CatalogError('conflict', constraint, {}, { cause: error });
  if (isCheckViolation(error)) {
    const kind = PUBLISH_CONSTRAINTS.has(constraint) ? 'not_publishable' : 'invalid';
    return new CatalogError(kind, constraint, {}, { cause: error });
  }
  if (isStillReferenced(error)) {
    // A foreign key rejects two things: pointing at a row that does not exist (invalid) and removing
    // a row that is still pointed at (conflict). The statement type is not known here, so the
    // caller that deletes passes its own error; everything else is a bad reference.
    return new CatalogError('invalid', constraint, {}, { cause: error });
  }
  return error;
}

/** Runs `work` and translates a database rejection. The only place services need a try/catch. */
export async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw translateDbError(error);
  }
}
