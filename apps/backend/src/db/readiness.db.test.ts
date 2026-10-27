import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { adminUrl, createTestDatabase, describeDb, type TestDatabase } from '../test/database.js';
import { makeApp } from '../test/helpers.js';
import { createTcpProxy, type TcpProxy } from '../test/tcp-proxy.js';
import { createDatabase, type Database } from './client.js';

async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  let last = await read();
  for (let attempt = 0; attempt < 25 && !done(last); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    last = await read();
  }
  return last;
}

describeDb('/readyz follows the real database', () => {
  let testDb: TestDatabase;
  let proxy: TcpProxy;
  let database: Database;
  const onPoolError = vi.fn();

  beforeAll(async () => {
    testDb = await createTestDatabase();
    const server = new URL(adminUrl as string);
    proxy = await createTcpProxy({ host: server.hostname, port: Number(server.port || 5432) });
    const url = new URL(testDb.appUrl);
    url.hostname = '127.0.0.1';
    url.port = String(proxy.port);
    database = createDatabase({ url: url.toString(), poolMax: 2, onPoolError });
  });
  afterAll(async () => {
    await database.close();
    await proxy.stop();
    await testDb.drop();
  });

  it('answers 200 while the database is up, 503 while it is down, and 200 again when it is back', async () => {
    const app = await makeApp({}, undefined, database);
    const ready = async () => (await app.inject({ method: 'GET', url: '/readyz' })).statusCode;

    expect(await ready()).toBe(200);

    await proxy.stop();
    expect(await eventually(ready, (status) => status === 503)).toBe(503);
    // The process itself is fine: liveness stays green so the platform does not restart it.
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);

    await proxy.start();
    expect(await eventually(ready, (status) => status === 200)).toBe(200);

    await app.close();
  });
});
