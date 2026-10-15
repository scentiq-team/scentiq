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
