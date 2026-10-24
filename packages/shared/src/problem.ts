// The error contract (ADR-0003): the server returns stable codes inside problem+json and the
// frontend turns each code into Arabic or English text. The server never sends display text.
import { z } from 'zod';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export const ERROR_CODES = [
  'bad_request',
  'validation_error',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'internal_error',
  'service_unavailable',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  code: z.enum(ERROR_CODES),
  detail: z.string().optional(),
  requestId: z.string().optional(),
  issues: z.array(z.object({ path: z.string(), code: z.string() })).optional(),
});

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

/**
 * Maps an HTTP status to the stable error code. The backend uses it to build problem documents
 * and the frontend uses it for responses that are not problem+json (for example a 502 page from
 * a reverse proxy), so both sides always agree.
 */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 429:
      return 'rate_limited';
    case 502:
    case 503:
    case 504:
      return 'service_unavailable';
    default:
      return status >= 500 ? 'internal_error' : 'bad_request';
  }
}
