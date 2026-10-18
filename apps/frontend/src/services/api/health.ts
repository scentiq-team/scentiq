import { healthResponseSchema } from '@scentiq/shared';
import { queryOptions } from '@tanstack/react-query';
import { apiGet } from './client';

/** Used by the developer style guide to prove the browser -> proxy -> backend path works. */
export const healthQuery = queryOptions({
  queryKey: ['health'] as const,
  queryFn: ({ signal }) => apiGet('/api/v1/health', healthResponseSchema, { signal }),
});
