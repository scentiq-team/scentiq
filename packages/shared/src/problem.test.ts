import { describe, expect, it } from 'vitest';
import { ERROR_CODES, problemDetailsSchema } from './problem.js';

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
