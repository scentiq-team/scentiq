import { problemDetailsSchema } from '@scentiq/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { makeApp } from '../test/helpers.js';
import { toProblem } from './errors.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('error handling', () => {
  it('returns problem+json for unknown API paths', async () => {
    app = await makeApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    const body = problemDetailsSchema.parse(response.json());
    expect(body.code).toBe('not_found');
    expect(body.requestId).toBe(response.headers['x-request-id']);
  });

  it('returns problem+json for non-GET requests to unknown paths', async () => {
    app = await makeApp();
    const response = await app.inject({ method: 'POST', url: '/anything', payload: {} });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('not_found');
  });

  it('maps schema validation failures to validation_error with issue paths', async () => {
    app = await makeApp();
    app
      .withTypeProvider<ZodTypeProvider>()
      .get(
        '/__validate',
        { schema: { querystring: z.object({ qty: z.coerce.number().int().min(1) }) } },
        async () => ({ ok: true }),
      );
    const response = await app.inject({ method: 'GET', url: '/__validate?qty=0' });
    expect(response.statusCode).toBe(400);
    const body = problemDetailsSchema.parse(response.json());
    expect(body.code).toBe('validation_error');
    expect(body.issues?.[0]?.path).toBe('qty');
  });

  it('hides internal error details from the client', async () => {
    app = await makeApp();
    app.get('/__boom', async () => {
      throw new Error('database password is hunter2');
    });
    const response = await app.inject({ method: 'GET', url: '/__boom' });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('hunter2');
    expect(problemDetailsSchema.parse(response.json()).code).toBe('internal_error');
  });

  it('keeps client error status codes and maps them to stable codes', async () => {
    app = await makeApp();
    app.get('/__conflict', async () => {
      throw Object.assign(new Error('x'), { statusCode: 409 });
    });
    const response = await app.inject({ method: 'GET', url: '/__conflict' });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('conflict');
  });

  it('rejects malformed JSON bodies with a 400 problem', async () => {
    app = await makeApp();
    app.post('/__echo', async (request) => request.body);
    const response = await app.inject({
      method: 'POST',
      url: '/__echo',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('bad_request');
  });
});

describe('toProblem', () => {
  it('treats unknown values as an internal error', () => {
    expect(toProblem('boom').status).toBe(500);
    expect(toProblem(null).code).toBe('internal_error');
  });

  it('ignores status codes outside the error range', () => {
    expect(toProblem({ statusCode: 200 }).status).toBe(500);
    expect(toProblem({ statusCode: 302 }).status).toBe(500);
  });
});

describe('request ids and security headers', () => {
  it('echoes a safe incoming X-Request-Id and replaces an unsafe one', async () => {
    app = await makeApp();
    const safe = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'client-req-12345' },
    });
    expect(safe.headers['x-request-id']).toBe('client-req-12345');

    const unsafe = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': '<script>alert(1)</script>' },
    });
    expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not trust the default request-id header', async () => {
    app = await makeApp();
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'request-id': 'spoofed-id-12345' },
    });
    expect(response.headers['x-request-id']).not.toBe('spoofed-id-12345');
  });

  it('sends a strict CSP and common hardening headers', async () => {
    app = await makeApp();
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    const csp = String(response.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['permissions-policy']).toContain('camera=()');
  });
});
