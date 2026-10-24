// The only place that calls fetch (ADR-0003, "API layer"). Every response is validated with the
// shared Zod schema, so the rest of the app never sees data the server contract does not allow.
import { problemDetailsSchema } from '@scentiq/shared';
import type { ZodType } from 'zod';
import { ApiError, codeFromStatus } from './errors';

export interface ApiRequestOptions {
  signal?: AbortSignal;
}

async function toApiError(response: Response): Promise<ApiError> {
  const headerId = response.headers.get('x-request-id') ?? undefined;
  try {
    const parsed = problemDetailsSchema.safeParse(await response.json());
    if (parsed.success) {
      return new ApiError(parsed.data.code, {
        status: response.status,
        requestId: parsed.data.requestId ?? headerId,
      });
    }
  } catch {
    // Not JSON at all (a proxy error page): fall through to the status-based code.
  }
  return new ApiError(codeFromStatus(response.status), {
    status: response.status,
    requestId: headerId,
  });
}

export async function apiGet<T>(
  path: string,
  schema: ZodType<T>,
  options: ApiRequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
      signal: options.signal ?? null,
    });
  } catch (cause) {
    // A cancelled request is not a failure; let the caller (TanStack Query) see the abort.
    if (options.signal?.aborted) throw cause;
    throw new ApiError('network_error', { cause });
  }

  if (!response.ok) throw await toApiError(response);

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    throw new ApiError('invalid_response', { status: response.status, cause });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('invalid_response', { status: response.status, cause: parsed.error });
  }
  return parsed.data;
}
