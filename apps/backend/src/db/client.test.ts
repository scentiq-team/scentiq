import { describe, expect, it } from 'vitest';
import { createDatabase } from './client.js';

// Port 1 is never open: the connection is refused immediately, like a database that is down.
const DEAD = 'postgres://scentiq_app:x@127.0.0.1:1/none';

describe('createDatabase', () => {
  it('reports an unreachable database as not ready instead of throwing', async () => {
    const database = createDatabase({ url: DEAD, poolMax: 1 });
    expect(await database.ping(500)).toBe(false);
    await database.close();
  });

  it('can be closed twice', async () => {
    const database = createDatabase({ url: DEAD, poolMax: 1 });
    await database.close();
    await expect(database.close()).resolves.toBeUndefined();
  });
});
