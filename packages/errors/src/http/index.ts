// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';
import { BadGatewayError } from '../errors/bad-gateway.js';
import { ConflictError } from '../errors/conflict.js';
import { ForbiddenError } from '../errors/forbidden.js';
import { InternalError } from '../errors/internal.js';
import { NotFoundError } from '../errors/not-found.js';
import { RateLimitedError } from '../errors/rate-limited.js';
import { TimeoutError } from '../errors/timeout.js';
import { UnauthorizedError } from '../errors/unauthorized.js';
import { ValidationError } from '../errors/validation.js';
import { redactDetails } from '../redaction.js';

/**
 * RFC 9457 ProblemDetails. `type` is intentionally a bucket URN (not a
 * 1:1 mapping for every ErrorKind) per ADR-006 §A1.5: collapse server-side
 * failure modes (UPSTREAM_FAILURE / BAD_GATEWAY / INTERNAL) under
 * `urn:gertsai:errors:server` to avoid leaking infrastructure topology.
 */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
}

export const httpStatusForKind: Readonly<Record<ErrorKind, number>> = {
  [ErrorKind.VALIDATION]: 400,
  [ErrorKind.NOT_FOUND]: 404,
  [ErrorKind.UNAUTHORIZED]: 401,
  [ErrorKind.FORBIDDEN]: 403,
  [ErrorKind.CONFLICT]: 409,
  [ErrorKind.RATE_LIMITED]: 429,
  [ErrorKind.INTERNAL]: 500,
  [ErrorKind.UPSTREAM_FAILURE]: 502,
  [ErrorKind.TIMEOUT]: 504,
  [ErrorKind.BAD_GATEWAY]: 502,
} as const;

export const PROBLEM_TYPE_BUCKETS: Readonly<Record<ErrorKind, string>> = {
  [ErrorKind.VALIDATION]: 'urn:gertsai:errors:validation',
  [ErrorKind.NOT_FOUND]: 'urn:gertsai:errors:not-found',
  [ErrorKind.UNAUTHORIZED]: 'urn:gertsai:errors:unauthenticated',
  [ErrorKind.FORBIDDEN]: 'urn:gertsai:errors:permission',
  [ErrorKind.CONFLICT]: 'urn:gertsai:errors:conflict',
  [ErrorKind.RATE_LIMITED]: 'urn:gertsai:errors:rate-limit',
  [ErrorKind.INTERNAL]: 'urn:gertsai:errors:server',
  [ErrorKind.UPSTREAM_FAILURE]: 'urn:gertsai:errors:server',
  [ErrorKind.TIMEOUT]: 'urn:gertsai:errors:timeout',
  [ErrorKind.BAD_GATEWAY]: 'urn:gertsai:errors:server',
} as const;

const STATUS_TO_KIND: Readonly<Record<number, ErrorKind>> = {
  400: ErrorKind.VALIDATION,
  401: ErrorKind.UNAUTHORIZED,
  403: ErrorKind.FORBIDDEN,
  404: ErrorKind.NOT_FOUND,
  409: ErrorKind.CONFLICT,
  429: ErrorKind.RATE_LIMITED,
  500: ErrorKind.INTERNAL,
  502: ErrorKind.BAD_GATEWAY,
  504: ErrorKind.TIMEOUT,
} as const;

/**
 * Serialize an AppError to RFC 9457 ProblemDetails for outbound HTTP.
 * Applies `redactDetails` per ADR-006 I-14 + bucket type per Amendment 1.
 */
export function appErrorToHttpResponse(err: AppError): {
  readonly status: number;
  readonly body: ProblemDetails;
} {
  const status = httpStatusForKind[err.kind];
  const body: ProblemDetails = {
    type: PROBLEM_TYPE_BUCKETS[err.kind],
    title: err.message,
    status,
    detail: err.message,
    details: redactDetails(err.details),
    ...(err.correlationId !== undefined ? { correlationId: err.correlationId } : {}),
  };
  return { status, body };
}

/**
 * Best-effort reverse mapping: ProblemDetails → concrete AppError subclass.
 *
 * Lookup is by HTTP status (collapsed types make `type` ambiguous on the
 * wire — INTERNAL/UPSTREAM_FAILURE/BAD_GATEWAY all share one URN, so we
 * use status code to pick INTERNAL for 500 and BAD_GATEWAY for 502).
 */
export function parseHttpProblemDetails(body: ProblemDetails): AppError {
  const kind = STATUS_TO_KIND[body.status] ?? ErrorKind.INTERNAL;
  const message = body.title || body.detail || 'Error';
  const details = (body.details ?? {}) as Record<string, unknown>;
  const correlationId = body.correlationId;
  const ctorOpts = {
    message,
    details,
    ...(correlationId !== undefined ? { correlationId } : {}),
  };
  switch (kind) {
    case ErrorKind.VALIDATION:
      return new ValidationError(ctorOpts as ConstructorParameters<typeof ValidationError>[0]);
    case ErrorKind.NOT_FOUND:
      return new NotFoundError(ctorOpts as ConstructorParameters<typeof NotFoundError>[0]);
    case ErrorKind.UNAUTHORIZED:
      return new UnauthorizedError(ctorOpts);
    case ErrorKind.FORBIDDEN:
      return new ForbiddenError(ctorOpts);
    case ErrorKind.CONFLICT:
      return new ConflictError(ctorOpts);
    case ErrorKind.RATE_LIMITED:
      return new RateLimitedError(ctorOpts);
    case ErrorKind.TIMEOUT:
      return new TimeoutError(ctorOpts);
    case ErrorKind.BAD_GATEWAY:
      return new BadGatewayError(ctorOpts);
    case ErrorKind.INTERNAL:
    default:
      return new InternalError(ctorOpts);
  }
}

export { redactDetails, REDACTION_KEYS } from '../redaction.js';
