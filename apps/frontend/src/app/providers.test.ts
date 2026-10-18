import { describe, expect, it } from 'vitest';
import { ApiError } from '@/services/api/errors';
import { createQueryClient } from './providers';

function shouldRetry(failureCount: number, error: unknown): boolean {
  const retry = createQueryClient().getDefaultOptions().queries?.retry;
  if (typeof retry !== 'function') throw new Error('retry must be a function');
  return retry(failureCount, error as Error);
}

describe('createQueryClient retry policy', () => {
  it('retries a network failure once', () => {
    const error = new ApiError('network_error');
    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(1, error)).toBe(false);
  });

  it('retries a server error once', () => {
    expect(shouldRetry(0, new ApiError('service_unavailable', { status: 503 }))).toBe(true);
  });

  it('never retries an answer the server rejected (4xx)', () => {
    expect(shouldRetry(0, new ApiError('not_found', { status: 404 }))).toBe(false);
    expect(shouldRetry(0, new ApiError('validation_error', { status: 400 }))).toBe(false);
  });

  it('does not refetch on window focus', () => {
    expect(createQueryClient().getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });
});
