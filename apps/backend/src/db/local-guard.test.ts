import { describe, expect, it } from 'vitest';
import { isLocalDatabaseUrl } from './local-guard.js';

describe('isLocalDatabaseUrl', () => {
  it('accepts a database on this computer', () => {
    for (const url of [
      'postgres://u:p@localhost:5432/db',
      'postgres://u:p@127.0.0.1/db',
      'postgres://u:p@[::1]:5432/db',
      'postgres://u:p@localhost/db?host=/var/run/postgresql',
      'postgres://u:p@localhost/db?host=127.0.0.1',
    ]) {
      expect(isLocalDatabaseUrl(url), url).toBe(true);
    }
  });

  it('refuses a remote host, including names that only look local', () => {
    for (const url of [
      'postgres://u:p@db.internal:5432/db',
      'postgres://u:p@localhost.evil.example/db',
      'postgres://u:p@127.0.0.1.evil.example/db',
      'postgres://u:p@10.0.0.5/db',
    ]) {
      expect(isLocalDatabaseUrl(url), url).toBe(false);
    }
  });

  it('is not fooled by ?host= or ?hostaddr=, which the driver prefers over the URL host', () => {
    expect(isLocalDatabaseUrl('postgres://u:p@localhost/db?host=prod.example.com')).toBe(false);
    expect(isLocalDatabaseUrl('postgres://u:p@localhost/db?hostaddr=10.0.0.5')).toBe(false);
    expect(isLocalDatabaseUrl('postgres://u:p@127.0.0.1/db?host=prod.example.com')).toBe(false);
  });

  it('refuses what it cannot understand', () => {
    expect(isLocalDatabaseUrl('not a url')).toBe(false);
    expect(isLocalDatabaseUrl('postgres:///db')).toBe(false);
    // Node's URL parser rejects an empty host next to a user name, so this form is refused.
    expect(isLocalDatabaseUrl('postgres://u:p@/db?host=/var/run/postgresql')).toBe(false);
  });
});
