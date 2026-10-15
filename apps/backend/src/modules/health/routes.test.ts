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
});
