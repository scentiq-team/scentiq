import { describe, expect, it } from 'vitest';
import { CatalogError, guarded, isCatalogError, translateDbError } from './errors.js';
import { pickDefined } from './util.js';

/** What Drizzle throws: its own error with the driver error under `cause`. */
const dbError = (code: string, constraint?: string) =>
  Object.assign(new Error('Failed query: insert into ...'), {
    cause: Object.assign(new Error('driver message with user data: عود'), {
      code,
      ...(constraint === undefined ? {} : { constraint }),
    }),
  });

describe('translateDbError', () => {
  it('maps a unique violation to a conflict that names the rule', () => {
    const error = translateDbError(dbError('23505', 'products_slug_uq'));
    expect(error).toBeInstanceOf(CatalogError);
    expect(error).toMatchObject({ kind: 'conflict', reason: 'products_slug_uq' });
  });

  it('maps a check violation to invalid, and the publish rules to not_publishable', () => {
    expect(translateDbError(dbError('23514', 'product_variants_price_range'))).toMatchObject({
      kind: 'invalid',
      reason: 'product_variants_price_range',
    });
    for (const rule of [
      'products_publish_requires_children',
      'products_published_required_fields',
      'products_published_has_timestamp',
    ]) {
      expect(translateDbError(dbError('23514', rule))).toMatchObject({
        kind: 'not_publishable',
        reason: rule,
      });
    }
  });

  it('maps a foreign key or restrict violation to invalid', () => {
    expect(translateDbError(dbError('23503', 'products_brand_id_brands_id_fk'))).toMatchObject({
      kind: 'invalid',
      reason: 'products_brand_id_brands_id_fk',
    });
    expect(translateDbError(dbError('23001', 'x_fk'))).toMatchObject({ kind: 'invalid' });
  });

  it('keeps the original error when it is not a rule violation, so outages stay errors', () => {
    const timeout = Object.assign(new Error('timeout'), { code: '57014' });
    expect(translateDbError(timeout)).toBe(timeout);
    const noConstraint = dbError('23505');
    expect(translateDbError(noConstraint)).toBe(noConstraint);
    const plain = new Error('boom');
    expect(translateDbError(plain)).toBe(plain);
    expect(translateDbError('text')).toBe('text');
  });

  it('never copies the database message into the error: it can hold user data', () => {
    const error = translateDbError(dbError('23505', 'brands_slug_uq')) as CatalogError;
    expect(error.message).toBe('conflict: brands_slug_uq');
    expect(JSON.stringify({ ...error, message: error.message })).not.toContain('عود');
  });

  it('leaves a CatalogError alone', () => {
    const own = new CatalogError('not_found', 'product_not_found');
    expect(translateDbError(own)).toBe(own);
    expect(isCatalogError(own)).toBe(true);
    expect(isCatalogError(new Error('x'))).toBe(false);
  });
});

describe('guarded', () => {
  it('returns the value, and rethrows a translated error', async () => {
    expect(await guarded(async () => 42)).toBe(42);
    await expect(
      guarded(async () => {
        throw dbError('23505', 'brands_slug_uq');
      }),
    ).rejects.toMatchObject({ kind: 'conflict', reason: 'brands_slug_uq' });
  });
});

describe('pickDefined', () => {
  it('drops undefined, keeps null and falsy values', () => {
    expect(pickDefined({ a: undefined, b: null, c: 0, d: '', e: false, f: 'x' })).toEqual({
      b: null,
      c: 0,
      d: '',
      e: false,
      f: 'x',
    });
  });

  it('gives an empty object when nothing is provided', () => {
    expect(pickDefined({ a: undefined })).toEqual({});
  });
});
