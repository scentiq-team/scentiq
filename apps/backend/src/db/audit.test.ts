import { describe, expect, it } from 'vitest';
import { redactDetails } from './audit.js';

describe('redactDetails', () => {
  it('replaces the value of sensitive keys at any depth and keeps the rest', () => {
    const result = redactDetails({
      productId: 'p1',
      priceIqd: 90000,
      password: 'hunter2',
      customer: { name: 'Ali', phone: '0770 000 0000', deliveryAddress: 'Baghdad, ...' },
      list: [{ resetToken: 'abc', ok: true }],
      Authorization: 'Bearer x',
    });
    expect(result).toEqual({
      productId: 'p1',
      priceIqd: 90000,
      password: '[redacted]',
      customer: { name: 'Ali', phone: '[redacted]', deliveryAddress: '[redacted]' },
      list: [{ resetToken: '[redacted]', ok: true }],
      Authorization: '[redacted]',
    });
  });

  it('never returns the secret anywhere in the output', () => {
    const output = JSON.stringify(redactDetails({ a: { b: { c: { passwordHash: 'S3CRET' } } } }));
    expect(output).not.toContain('S3CRET');
  });

  it('stops at a maximum depth instead of walking forever', () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 20; i++) deep = { next: deep };
    expect(JSON.stringify(redactDetails(deep))).toContain('[truncated]');
  });

  it('leaves primitives alone', () => {
    expect(redactDetails(5)).toBe(5);
    expect(redactDetails(null)).toBeNull();
    expect(redactDetails('text')).toBe('text');
  });
});
