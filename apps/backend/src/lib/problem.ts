import { STATUS_CODES } from 'node:http';
import { codeForStatus, type ErrorCode, type ProblemDetails } from '@scentiq/shared';

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
