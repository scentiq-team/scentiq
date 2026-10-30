import { describe, expect, it } from 'vitest';
import {
  checkRoleAtStartup,
  isStrictEnv,
  type RoleReport,
  roleVerdict,
  startupRoleOptions,
} from './role-check.js';

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

describe('checkRoleAtStartup', () => {
  const noSleep = async () => undefined;
  const down = async (): Promise<RoleReport> => {
    throw new Error('ECONNREFUSED');
  };

  it('passes a least-privilege role', async () => {
    const result = await checkRoleAtStartup(async () => safe, 'production', {
      attempts: 3,
      delayMs: 0,
      sleep: noSleep,
    });
    expect(result).toEqual({ status: 'ok' });
  });

  it('refuses a powerful role in production and warns in development', async () => {
    const options = { attempts: 1, delayMs: 0, sleep: noSleep };
    expect(await checkRoleAtStartup(async () => powerful, 'production', options)).toEqual({
      status: 'refuse',
      report: powerful,
    });
    expect(await checkRoleAtStartup(async () => powerful, 'development', options)).toEqual({
      status: 'warn',
      report: powerful,
    });
  });

  it('waits for a database that is still starting, then checks the role', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const result = await checkRoleAtStartup(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('ECONNREFUSED');
        return powerful;
      },
      'production',
      { attempts: 5, delayMs: 2000, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(result).toEqual({ status: 'refuse', report: powerful });
    expect(calls).toBe(3);
    expect(sleeps).toEqual([2000, 2000]);
  });

  it('reports "unreachable" instead of skipping the check when the database never answers', async () => {
    let calls = 0;
    const result = await checkRoleAtStartup(
      async () => {
        calls += 1;
        return down();
      },
      'production',
      { attempts: 4, delayMs: 1, sleep: noSleep },
    );
    expect(result).toEqual({ status: 'unreachable' });
    expect(calls).toBe(4);
  });
});

describe('startup policy', () => {
  it('is strict only in staging and production, and waits only there', () => {
    expect(isStrictEnv('production')).toBe(true);
    expect(isStrictEnv('staging')).toBe(true);
    expect(isStrictEnv('development')).toBe(false);
    expect(isStrictEnv('test')).toBe(false);
    expect(startupRoleOptions('production').attempts).toBeGreaterThan(1);
    expect(startupRoleOptions('development')).toEqual({ attempts: 1, delayMs: 0 });
  });
});
