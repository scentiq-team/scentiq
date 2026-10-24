import { describe, expect, it } from 'vitest';
import { codeForStatus, ERROR_CODES, problemDetailsSchema } from './problem.js';

describe('codeForStatus', () => {
  it('maps the statuses the API uses to their stable codes', () => {
    expect(codeForStatus(400)).toBe('bad_request');
    expect(codeForStatus(401)).toBe('unauthorized');
    expect(codeForStatus(403)).toBe('forbidden');
    expect(codeForStatus(404)).toBe('not_found');
    expect(codeForStatus(409)).toBe('conflict');
    expect(codeForStatus(429)).toBe('rate_limited');
    expect(codeForStatus(503)).toBe('service_unavailable');
  });

  it('treats proxy gateway failures as "service unavailable", not as a bug of ours', () => {
    expect(codeForStatus(502)).toBe('service_unavailable');
    expect(codeForStatus(504)).toBe('service_unavailable');
  });

  it('falls back by class: other 5xx are internal errors, other 4xx are bad requests', () => {
    expect(codeForStatus(500)).toBe('internal_error');
    expect(codeForStatus(501)).toBe('internal_error');
    expect(codeForStatus(418)).toBe('bad_request');
  });

  it('only ever returns a known code', () => {
    for (let status = 400; status <= 599; status++) {
      expect(ERROR_CODES).toContain(codeForStatus(status));
    }
  });
});

describe('problemDetailsSchema', () => {
  it('accepts a valid problem document', () => {
    const parsed = problemDetailsSchema.safeParse({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'not_found',
      requestId: 'abc',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown error codes and non-error statuses', () => {
    expect(
      problemDetailsSchema.safeParse({ type: 'x', title: 'x', status: 404, code: 'made_up' })
        .success,
    ).toBe(false);
    expect(
      problemDetailsSchema.safeParse({ type: 'x', title: 'x', status: 200, code: 'not_found' })
        .success,
    ).toBe(false);
  });

  it('keeps the code list stable and unique', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
