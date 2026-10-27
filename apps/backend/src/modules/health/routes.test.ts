import { healthResponseSchema } from '@scentiq/shared';
import { describe, expect, it } from 'vitest';
import { makeApp, productionEnv } from '../../test/helpers.js';

describe('health routes', () => {
  it('answers liveness without caching', async () => {
    const app = await makeApp();
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it('answers readiness and lists passing checks', async () => {
    const app = await makeApp();
    const response = await app.inject({ method: 'GET', url: '/readyz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', checks: { frontend: 'ok' } });
    await app.close();
  });

  it('returns a typed health document that matches the shared schema', async () => {
    const app = await makeApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.statusCode).toBe(200);
    const body = healthResponseSchema.parse(response.json());
    expect(body.env).toBe('test');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
    await app.close();
  });

  it('hides the environment name in production', async () => {
    const app = await makeApp(productionEnv);
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.json()).not.toHaveProperty('env');
    await app.close();
  });

  describe('readiness with a database', () => {
    it('lists the database check when it passes', async () => {
      const app = await makeApp({}, undefined, { ping: async () => true });
      const response = await app.inject({ method: 'GET', url: '/readyz' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok', checks: { database: 'ok', frontend: 'ok' } });
      await app.close();
    });

    it('answers 503 when the database does not answer, without naming it to the client', async () => {
      const app = await makeApp({}, undefined, { ping: async () => false });
      const response = await app.inject({ method: 'GET', url: '/readyz' });
      expect(response.statusCode).toBe(503);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).not.toMatch(/database|postgres/i);
      // Liveness must stay green: the process is fine, only a dependency is down.
      const live = await app.inject({ method: 'GET', url: '/healthz' });
      expect(live.statusCode).toBe(200);
      await app.close();
    });

    it('answers 503 when the database check throws', async () => {
      const app = await makeApp({}, undefined, {
        ping: async () => {
          throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
        },
      });
      const response = await app.inject({ method: 'GET', url: '/readyz' });
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain('10.0.0.5');
      await app.close();
    });
  });
});
