import { describe, expect, it } from 'vitest';
import { assertResetAllowed, ResetRefusedError } from './reset.js';

const LOCAL = 'postgres://scentiq_owner:x@127.0.0.1:5432/scentiq_dev';

describe('assertResetAllowed', () => {
  it('allows development and test against a database on this computer', () => {
    expect(() => assertResetAllowed('development', LOCAL)).not.toThrow();
    expect(() => assertResetAllowed('test', 'postgres://o:x@localhost/db')).not.toThrow();
    expect(() => assertResetAllowed('development', 'postgres://o:x@[::1]:5432/db')).not.toThrow();
  });

  it('refuses staging and production, whatever the host', () => {
    for (const env of ['staging', 'production'] as const) {
      expect(() => assertResetAllowed(env, LOCAL)).toThrow(ResetRefusedError);
    }
  });

  it('refuses a database that is not on this computer, even in development', () => {
    expect(() => assertResetAllowed('development', 'postgres://o:x@db.internal:5432/db')).toThrow(
      /this computer/,
    );
  });

  it('is not fooled by ?host=, which the driver prefers over the URL host', () => {
    expect(() =>
      assertResetAllowed('development', 'postgres://o:x@localhost/db?host=prod.example.com'),
    ).toThrow(ResetRefusedError);
  });

  it('never puts the connection URL in the message', () => {
    try {
      assertResetAllowed('development', 'postgres://owner:topsecret@db.internal:5432/db');
    } catch (error) {
      expect((error as Error).message).not.toContain('topsecret');
    }
  });
});
