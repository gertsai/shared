// SPDX-License-Identifier: Apache-2.0
import {
  AppError,
  BadGatewayError,
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  RateLimitedError,
  TimeoutError,
  UnauthorizedError,
  UpstreamFailureError,
  ValidationError,
} from '@gertsai/errors';

/**
 * Map an HTTP status code to a typed `AppError` subclass per ADR-009 I-8.
 *
 * @param status — HTTP response status (number).
 * @param body — response body to attach to `details.body` (optional).
 * @param url — request URL for diagnostics (optional).
 * @returns concrete AppError subclass instance.
 */
export function translateHttpStatus(
  status: number,
  body?: unknown,
  url?: string,
): AppError {
  const details: Record<string, unknown> = { status };
  if (url !== undefined) details.url = url;
  if (body !== undefined) details.body = body;

  switch (status) {
    case 400:
      return new ValidationError({ message: `HTTP 400 Bad Request${url ? ` for ${url}` : ''}`, details });
    case 401:
      return new UnauthorizedError({ message: `HTTP 401 Unauthorized${url ? ` for ${url}` : ''}`, details });
    case 403:
      return new ForbiddenError({ message: `HTTP 403 Forbidden${url ? ` for ${url}` : ''}`, details });
    case 404:
      return new NotFoundError({ message: `HTTP 404 Not Found${url ? ` for ${url}` : ''}`, details });
    case 409:
      return new ConflictError({ message: `HTTP 409 Conflict${url ? ` for ${url}` : ''}`, details });
    case 429:
      return new RateLimitedError({ message: `HTTP 429 Too Many Requests${url ? ` for ${url}` : ''}`, details });
    case 502:
      return new BadGatewayError({ message: `HTTP 502 Bad Gateway${url ? ` for ${url}` : ''}`, details });
    case 503:
    case 504:
      return new UpstreamFailureError({
        message: `HTTP ${status}${url ? ` for ${url}` : ''}`,
        details: { ...details, upstream: url, status },
      });
    default:
      if (status >= 400 && status < 500) {
        return new ValidationError({
          message: `HTTP ${status}${url ? ` for ${url}` : ''}`,
          details,
        });
      }
      return new InternalError({
        message: `HTTP ${status}${url ? ` for ${url}` : ''}`,
        details,
      });
  }
}

/**
 * Translate a thrown error per ADR-009 Amendment 1.2.8 — `AbortError`
 * (raised by `withTimeout`) is converted to `TimeoutError`.
 *
 * @param err — caught error from underlying transport / retry.
 * @param timeoutMs — configured timeout for diagnostics.
 * @returns the original error or a wrapped TimeoutError.
 */
export function translateTransportError(err: unknown, timeoutMs: number): unknown {
  if (err instanceof Error && err.name === 'AbortError') {
    return new TimeoutError({
      message: 'Request timeout',
      details: { timeoutMs },
      cause: err,
    });
  }
  return err;
}
