import { STATUS_CODES } from 'node:http';
import type { ErrorCode, ProblemDetails } from '@scentiq/shared';

/** Maps an HTTP status to the stable error code the frontend translates. */
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
    case 503:
      return 'service_unavailable';
    default:
      return status >= 500 ? 'internal_error' : 'bad_request';
  }
}

export interface ProblemInput {
  status: number;
  code?: ErrorCode;
  requestId?: string;
  issues?: { path: string; code: string }[];
}

/** Builds an RFC 9457 problem document. It never carries internal error messages. */
export function createProblem(input: ProblemInput): ProblemDetails {
  const status = input.status >= 400 && input.status <= 599 ? input.status : 500;
  return {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    code: input.code ?? codeForStatus(status),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.issues === undefined || input.issues.length === 0 ? {} : { issues: input.issues }),
  };
}
