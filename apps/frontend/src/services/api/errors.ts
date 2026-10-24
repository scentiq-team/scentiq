// What the frontend knows about API failures (ADR-0003). The server sends stable codes inside
// problem+json; the screen turns a code into Arabic or English text from the i18n dictionaries.
import { codeForStatus, type ErrorCode } from '@scentiq/shared';

/** Failures that happen before a usable server answer exists. */
export const CLIENT_ERROR_CODES = ['network_error', 'invalid_response'] as const;

export type ClientErrorCode = ErrorCode | (typeof CLIENT_ERROR_CODES)[number];

export class ApiError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number | undefined;
  /** Lets a shopper quote a reference to support and lets us find the log line. */
  readonly requestId: string | undefined;

  constructor(
    code: ClientErrorCode,
    options: { status?: number; requestId?: string; cause?: unknown } = {},
  ) {
    super(`API error: ${code}`, { cause: options.cause });
    this.name = 'ApiError';
    this.code = code;
    this.status = options.status;
    this.requestId = options.requestId;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Any thrown value becomes a code the UI can translate; unknown failures are "internal". */
export function errorCodeOf(error: unknown): ClientErrorCode {
  return isApiError(error) ? error.code : 'internal_error';
}

/** Used when the response is not problem+json (for example an HTML 502 page from a proxy). */
export function codeFromStatus(status: number): ClientErrorCode {
  return codeForStatus(status);
}
