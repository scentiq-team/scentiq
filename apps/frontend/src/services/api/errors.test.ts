import { ERROR_CODES } from '@scentiq/shared';
import { describe, expect, it } from 'vitest';
import { ApiError, codeFromStatus, errorCodeOf, isApiError } from './errors';

describe('ApiError', () => {
  it('carries the code, status and request id', () => {
    const error = new ApiError('conflict', { status: 409, requestId: 'req-1' });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('conflict');
    expect(error.status).toBe(409);
    expect(error.requestId).toBe('req-1');
    expect(error.name).toBe('ApiError');
  });

  it('keeps the original cause for debugging', () => {
    const cause = new TypeError('boom');
    expect(new ApiError('network_error', { cause }).cause).toBe(cause);
  });
});

describe('isApiError and errorCodeOf', () => {
  it('recognise only ApiError instances', () => {
    expect(isApiError(new ApiError('not_found'))).toBe(true);
    expect(isApiError(new Error('x'))).toBe(false);
    expect(isApiError({ code: 'not_found' })).toBe(false);
    expect(isApiError(null)).toBe(false);
  });

  it('turn any thrown value into a code the screen can translate', () => {
    expect(errorCodeOf(new ApiError('rate_limited'))).toBe('rate_limited');
    expect(errorCodeOf(new Error('x'))).toBe('internal_error');
    expect(errorCodeOf('text')).toBe('internal_error');
    expect(errorCodeOf(undefined)).toBe('internal_error');
  });
});

describe('codeFromStatus', () => {
  it('uses the same mapping as the server', () => {
    expect(codeFromStatus(404)).toBe('not_found');
    expect(codeFromStatus(502)).toBe('service_unavailable');
    expect(codeFromStatus(500)).toBe('internal_error');
  });

  it('always returns a code the server contract knows', () => {
    for (const status of [400, 401, 403, 404, 409, 418, 429, 500, 502, 503, 504, 599]) {
      expect(ERROR_CODES).toContain(codeFromStatus(status));
    }
  });
});
