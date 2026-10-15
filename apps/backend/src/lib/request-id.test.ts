import { describe, expect, it } from 'vitest';
import { resolveRequestId } from './request-id.js';

describe('resolveRequestId', () => {
  it('keeps a safe incoming id', () => {
    expect(resolveRequestId('abc-123_XYZ.456')).toBe('abc-123_XYZ.456');
  });

  it('generates a new id when none is sent', () => {
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('replaces ids that are too short, too long or contain unsafe characters', () => {
    for (const bad of [
      'short',
      'x'.repeat(65),
      'has space in it',
      'line\nbreak-1234',
      '<script>12',
    ]) {
      expect(resolveRequestId(bad)).not.toBe(bad);
    }
  });

  it('ignores repeated headers', () => {
    expect(resolveRequestId(['abc-12345', 'def-67890'])).toMatch(/^[0-9a-f-]{36}$/);
  });
});
