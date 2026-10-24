import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiGet } from './client';
import { ApiError } from './errors';

const schema = z.object({ name: z.string() });

function mockFetch(response: Response | Error | DOMException) {
  const fetchMock = vi.fn(async () => {
    // jsdom's DOMException is not an `Error` from this realm, so test for Response instead.
    if (!(response instanceof Response)) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('Expected the request to fail');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiGet', () => {
  it('returns the validated body and asks for JSON on the same origin', async () => {
    const fetchMock = mockFetch(json({ name: 'oud' }));
    await expect(apiGet('/api/v1/x', schema)).resolves.toEqual({ name: 'oud' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/x',
      expect.objectContaining({
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      }),
    );
  });

  it('turns a problem+json answer into an ApiError with the server code and request id', async () => {
    mockFetch(
      json(
        {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          code: 'conflict',
          requestId: 'req-9',
        },
        { status: 409, headers: { 'content-type': 'application/problem+json' } },
      ),
    );
    const error = await failureOf(apiGet('/api/v1/x', schema));
    expect(error.code).toBe('conflict');
    expect(error.status).toBe(409);
    expect(error.requestId).toBe('req-9');
  });

  it('falls back to the request id header when the body has none', async () => {
    mockFetch(
      json(
        { type: 'about:blank', title: 'Not found', status: 404, code: 'not_found' },
        { status: 404, headers: { 'x-request-id': 'hdr-1' } },
      ),
    );
    expect((await failureOf(apiGet('/api/v1/x', schema))).requestId).toBe('hdr-1');
  });

  it('maps a proxy HTML error page to a code by status instead of crashing', async () => {
    mockFetch(
      new Response('<html>Bad gateway</html>', {
        status: 502,
        headers: { 'x-request-id': 'px-1' },
      }),
    );
    const error = await failureOf(apiGet('/api/v1/x', schema));
    expect(error.code).toBe('service_unavailable');
    expect(error.status).toBe(502);
    expect(error.requestId).toBe('px-1');
  });

  it('maps JSON that is not a problem document to a code by status', async () => {
    mockFetch(json({ message: 'nope' }, { status: 500 }));
    expect((await failureOf(apiGet('/api/v1/x', schema))).code).toBe('internal_error');
  });

  it('reports network failures as network_error', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    const error = await failureOf(apiGet('/api/v1/x', schema));
    expect(error.code).toBe('network_error');
    expect(error.status).toBeUndefined();
  });

  it('rethrows an aborted request untouched so TanStack Query can ignore it', async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException('Aborted', 'AbortError');
    mockFetch(abort);
    await expect(apiGet('/api/v1/x', schema, { signal: controller.signal })).rejects.toBe(abort);
  });

  it('reports a success body that is not JSON as invalid_response', async () => {
    mockFetch(new Response('not json', { status: 200 }));
    expect((await failureOf(apiGet('/api/v1/x', schema))).code).toBe('invalid_response');
  });

  it('reports a body that breaks the contract as invalid_response', async () => {
    mockFetch(json({ name: 42 }));
    const error = await failureOf(apiGet('/api/v1/x', schema));
    expect(error.code).toBe('invalid_response');
    expect(error.status).toBe(200);
  });
});
