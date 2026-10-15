// One error shape for the whole API (ADR-0003): RFC 9457 problem+json with a stable `code`.
// Internal error messages are logged but never sent to the client.
import { PROBLEM_CONTENT_TYPE, type ProblemDetails } from '@scentiq/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createProblem } from '../lib/problem.js';

function toIssues(validation: unknown[]): { path: string; code: string }[] {
  return validation.map((entry) => {
    const item = (typeof entry === 'object' && entry !== null ? entry : {}) as {
      instancePath?: unknown;
      keyword?: unknown;
    };
    const path = typeof item.instancePath === 'string' ? item.instancePath : '';
    return {
      path: path.replace(/^\//, '').replaceAll('/', '.'),
      code: typeof item.keyword === 'string' ? item.keyword : 'invalid',
    };
  });
}

export function toProblem(error: unknown, requestId?: string): ProblemDetails {
  const candidate = (typeof error === 'object' && error !== null ? error : {}) as {
    statusCode?: unknown;
    validation?: unknown;
  };

  if (Array.isArray(candidate.validation)) {
    return createProblem({
      status: 400,
      code: 'validation_error',
      issues: toIssues(candidate.validation),
      ...(requestId === undefined ? {} : { requestId }),
    });
  }

  const status =
    typeof candidate.statusCode === 'number' &&
    candidate.statusCode >= 400 &&
    candidate.statusCode <= 599
      ? candidate.statusCode
      : 500;
  return createProblem({ status, ...(requestId === undefined ? {} : { requestId }) });
}

export function sendProblem(reply: FastifyReply, problem: ProblemDetails): FastifyReply {
  return reply.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(problem);
}

export function notFoundProblem(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return sendProblem(reply, createProblem({ status: 404, requestId: request.id }));
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const problem = toProblem(error, request.id);
    if (problem.status >= 500) {
      request.log.error({ err: error }, 'request failed');
    } else {
      request.log.info({ code: problem.code, status: problem.status }, 'request rejected');
    }
    return sendProblem(reply, problem);
  });
}
