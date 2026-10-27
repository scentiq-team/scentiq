import { describe, expect, it } from 'vitest';
import { roleVerdict } from './role-check.js';

const safe = { role: 'scentiq_app', dangerousAttributes: [] };
const powerful = { role: 'postgres', dangerousAttributes: ['superuser'] };

describe('roleVerdict', () => {
  it('accepts a least-privilege role everywhere', () => {
    for (const env of ['development', 'test', 'staging', 'production'] as const) {
      expect(roleVerdict(safe, env)).toBe('ok');
    }
  });

  it('refuses a powerful role in staging and production, and only warns elsewhere', () => {
    expect(roleVerdict(powerful, 'production')).toBe('refuse');
    expect(roleVerdict(powerful, 'staging')).toBe('refuse');
    expect(roleVerdict(powerful, 'development')).toBe('warn');
    expect(roleVerdict(powerful, 'test')).toBe('warn');
  });
});
