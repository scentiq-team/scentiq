import { describe, expect, it } from 'vitest';
import { isCheckViolation, isStillReferenced, isUniqueViolation, pgErrorCode } from './errors.js';

/** What Drizzle throws: its own error with the driver error under `cause`. */
const wrapped = (code: string) =>
  Object.assign(new Error('Failed query: insert into ...'), {
    cause: Object.assign(new Error('driver message'), { code }),
  });

describe('pgErrorCode', () => {
  it('reads the code from a driver error and from Drizzle’s wrapper', () => {
    expect(pgErrorCode(Object.assign(new Error('x'), { code: '23505' }))).toBe('23505');
    expect(pgErrorCode(wrapped('23514'))).toBe('23514');
  });

  it('ignores codes that are not SQLSTATE values (for example Node errors)', () => {
    expect(pgErrorCode(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBeUndefined();
    expect(pgErrorCode(new Error('plain'))).toBeUndefined();
    expect(pgErrorCode(undefined)).toBeUndefined();
    expect(pgErrorCode('23505')).toBeUndefined();
  });

  it('does not loop forever on a circular cause chain', () => {
    const a: { cause?: unknown } = {};
    a.cause = a;
    expect(pgErrorCode(a)).toBeUndefined();
  });
});

describe('classifiers', () => {
  it('recognise unique and check violations', () => {
    expect(isUniqueViolation(wrapped('23505'))).toBe(true);
    expect(isUniqueViolation(wrapped('23514'))).toBe(false);
    expect(isCheckViolation(wrapped('23514'))).toBe(true);
  });

  it('treat RESTRICT (23001) and foreign key (23503) violations as "still referenced"', () => {
    expect(isStillReferenced(wrapped('23001'))).toBe(true);
    expect(isStillReferenced(wrapped('23503'))).toBe(true);
    expect(isStillReferenced(wrapped('23505'))).toBe(false);
  });
});
