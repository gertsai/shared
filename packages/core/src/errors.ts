export type ErrorSeverity = 'info' | 'warn' | 'error' | 'fatal';

// =============================================================================
// ErrorKind - Semantic error categories (RFC-053)
// Based on Google's gRPC status codes for consistent cross-service error handling
// =============================================================================

/**
 * Semantic error categories for unified error handling across the platform.
 * Maps to HTTP status codes and provides consistent error semantics.
 *
 * @see https://grpc.io/docs/guides/status-codes/
 */
export enum ErrorKind {
  // ─────────────────────────────────────────────────────────────────────────
  // Client errors (4xx)
  // ─────────────────────────────────────────────────────────────────────────

  /** Invalid argument provided (HTTP 400) */
  InvalidArgument = 'invalid_argument',

  /** Resource not found (HTTP 404) */
  NotFound = 'not_found',

  /** Resource already exists (HTTP 409) */
  AlreadyExists = 'already_exists',

  /** Permission denied for this operation (HTTP 403) */
  PermissionDenied = 'permission_denied',

  /** Authentication required (HTTP 401) */
  Unauthenticated = 'unauthenticated',

  /** Precondition failed (HTTP 412) */
  FailedPrecondition = 'failed_precondition',

  // ─────────────────────────────────────────────────────────────────────────
  // Resource errors
  // ─────────────────────────────────────────────────────────────────────────

  /** Rate limit exceeded (HTTP 429) */
  ResourceExhausted = 'resource_exhausted',

  /** Operation aborted/cancelled by user (HTTP 409 for conflict scenarios) */
  Aborted = 'aborted',

  /** Value out of valid range (HTTP 400) */
  OutOfRange = 'out_of_range',

  // ─────────────────────────────────────────────────────────────────────────
  // Server errors (5xx)
  // ─────────────────────────────────────────────────────────────────────────

  /** Internal server error (HTTP 500) */
  Internal = 'internal',

  /** Service temporarily unavailable (HTTP 503) */
  Unavailable = 'unavailable',

  /** Data loss or corruption (HTTP 500) */
  DataLoss = 'data_loss',

  // ─────────────────────────────────────────────────────────────────────────
  // Timeout and cancellation
  // ─────────────────────────────────────────────────────────────────────────

  /** Operation timed out (HTTP 504) */
  DeadlineExceeded = 'deadline_exceeded',

  /** Request cancelled by client (HTTP 499) */
  Cancelled = 'cancelled',

  // ─────────────────────────────────────────────────────────────────────────
  // Implementation errors
  // ─────────────────────────────────────────────────────────────────────────

  /** Feature not implemented (HTTP 501) */
  Unimplemented = 'unimplemented',

  /** Unknown error (HTTP 500) */
  Unknown = 'unknown',
}

/**
 * Mapping from HTTP status codes to ErrorKind.
 * Used for automatic categorization of HTTP responses.
 */
export const HTTP_TO_ERROR_KIND: Record<number, ErrorKind> = {
  400: ErrorKind.InvalidArgument,
  401: ErrorKind.Unauthenticated,
  403: ErrorKind.PermissionDenied,
  404: ErrorKind.NotFound,
  408: ErrorKind.DeadlineExceeded, // Request Timeout
  409: ErrorKind.AlreadyExists,
  412: ErrorKind.FailedPrecondition,
  413: ErrorKind.OutOfRange, // Payload Too Large
  429: ErrorKind.ResourceExhausted,
  499: ErrorKind.Cancelled,
  500: ErrorKind.Internal,
  501: ErrorKind.Unimplemented,
  503: ErrorKind.Unavailable,
  504: ErrorKind.DeadlineExceeded, // Gateway Timeout
  507: ErrorKind.ResourceExhausted, // Insufficient Storage
};

/**
 * Mapping from ErrorKind to HTTP status codes.
 * Used for generating HTTP responses from errors.
 */
export const ERROR_KIND_TO_HTTP: Record<ErrorKind, number> = {
  [ErrorKind.InvalidArgument]: 400,
  [ErrorKind.Unauthenticated]: 401,
  [ErrorKind.PermissionDenied]: 403,
  [ErrorKind.NotFound]: 404,
  [ErrorKind.AlreadyExists]: 409,
  [ErrorKind.FailedPrecondition]: 412,
  [ErrorKind.ResourceExhausted]: 429,
  [ErrorKind.Aborted]: 409,
  [ErrorKind.OutOfRange]: 400,
  [ErrorKind.Internal]: 500,
  [ErrorKind.Unavailable]: 503,
  [ErrorKind.DataLoss]: 500,
  [ErrorKind.DeadlineExceeded]: 504,
  [ErrorKind.Cancelled]: 499,
  [ErrorKind.Unimplemented]: 501,
  [ErrorKind.Unknown]: 500,
};

/**
 * Check if an ErrorKind is typically retryable.
 */
export function isRetryableKind(kind: ErrorKind): boolean {
  return (
    kind === ErrorKind.Unavailable ||
    kind === ErrorKind.ResourceExhausted ||
    kind === ErrorKind.DeadlineExceeded ||
    kind === ErrorKind.Aborted
  );
}

/**
 * Get ErrorKind from HTTP status code.
 */
export function errorKindFromHttp(status: number): ErrorKind {
  return HTTP_TO_ERROR_KIND[status] ?? ErrorKind.Unknown;
}

// =============================================================================
// Core Error Interfaces
// =============================================================================

/**
 * Interface for errors that support retry logic.
 */
export interface RetryableError extends Error {
  /**
   * Whether this error is retryable.
   * Transient errors (network, timeout, rate limit) should return true.
   * Permanent errors (auth, validation) should return false.
   */
  isRetryable(): boolean;

  /**
   * Suggested delay before retry (in ms).
   * Returns undefined if no specific delay is recommended.
   */
  getRetryDelay?(attempt: number): number | undefined;
}

export interface ErrorContext {
  code: string;
  cause?: unknown;
  severity?: ErrorSeverity;
  details?: Record<string, unknown>;
  /** Whether this error is retryable (default: false) */
  retryable?: boolean;
  /** Semantic error category (RFC-053) */
  kind?: ErrorKind;
}

/**
 * Serialized error for logging/transport.
 */
export interface SerializedError {
  name: string;
  code: string;
  message: string;
  severity: ErrorSeverity;
  isRetryable: boolean;
  details?: Record<string, unknown>;
  stack?: string;
  /** Semantic error category (RFC-053) */
  kind?: ErrorKind;
}

/**
 * Base error class for all gerts.ai errors.
 * Implements RetryableError interface for unified error handling.
 */
export class GertsError extends Error implements RetryableError {
  readonly code: string;
  readonly severity: ErrorSeverity;
  readonly details?: Record<string, unknown>;
  /** Semantic error category (RFC-053) */
  readonly kind?: ErrorKind;
  protected readonly _retryable: boolean;

  constructor(message: string, context: ErrorContext) {
    super(message);
    this.name = 'GertsError';
    this.code = context.code;
    this.severity = context.severity ?? 'error';
    this.details = context.details;
    this.kind = context.kind;
    this._retryable = context.retryable ?? (context.kind ? isRetryableKind(context.kind) : false);
    if (context.cause instanceof Error && context.cause.stack) {
      this.stack += `\nCaused by: ${context.cause.stack}`;
    }
  }

  /**
   * Whether this error is retryable.
   * Override in subclasses for context-dependent retry logic.
   */
  isRetryable(): boolean {
    return this._retryable;
  }

  /**
   * Suggested retry delay in ms.
   * Override in subclasses for custom backoff.
   */
  getRetryDelay?(attempt: number): number | undefined {
    if (!this._retryable) return undefined;
    // Default exponential backoff: 100ms, 200ms, 400ms, 800ms, ...
    return Math.min(100 * Math.pow(2, attempt), 10000);
  }

  /**
   * Serialize error for logging/transport.
   */
  toJSON(): SerializedError {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      isRetryable: this.isRetryable(),
      details: this.details,
      stack: this.stack,
      kind: this.kind,
    };
  }
}

export class NotFoundError extends GertsError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'NOT_FOUND', details, retryable: false, kind: ErrorKind.NotFound });
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends GertsError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: 'VALIDATION_FAILED',
      details,
      severity: 'warn',
      retryable: false,
      kind: ErrorKind.InvalidArgument,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Timeout error - transient, retryable.
 * Use GertsTimeoutError when you need full GertsError interface.
 * Use TimeoutError from './timeout' for lightweight timeout utilities.
 */
export class GertsTimeoutError extends GertsError {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number, details?: Record<string, unknown>) {
    super(message, {
      code: 'TIMEOUT',
      details: { ...details, timeoutMs },
      retryable: true,
      kind: ErrorKind.DeadlineExceeded,
    });
    this.name = 'GertsTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * @deprecated Use GertsTimeoutError for GertsError interface, or TimeoutError from './timeout'.
 */
export { GertsTimeoutError as TimeoutErrorGerts };

/**
 * Connection error - transient, retryable.
 */
export class ConnectionError extends GertsError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: 'CONNECTION_FAILED',
      details,
      retryable: true,
      kind: ErrorKind.Unavailable,
    });
    this.name = 'ConnectionError';
  }
}

/**
 * Rate limit error - retryable with delay.
 */
export class RateLimitError extends GertsError {
  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number, details?: Record<string, unknown>) {
    super(message, {
      code: 'RATE_LIMITED',
      details: { ...details, retryAfterMs },
      retryable: true,
      kind: ErrorKind.ResourceExhausted,
    });
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }

  override getRetryDelay(_attempt: number): number | undefined {
    return this.retryAfterMs ?? 1000;
  }
}

/**
 * Authentication error - permanent, not retryable.
 */
export class AuthenticationError extends GertsError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: 'AUTHENTICATION_FAILED',
      details,
      retryable: false,
      kind: ErrorKind.Unauthenticated,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error - permanent, not retryable.
 */
export class AuthorizationError extends GertsError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: 'AUTHORIZATION_FAILED',
      details,
      retryable: false,
      kind: ErrorKind.PermissionDenied,
    });
    this.name = 'AuthorizationError';
  }
}

// =============================================================================
// Connector Errors (RFC-042)
// =============================================================================

/**
 * Failure type for connector sync operations.
 */
export type ConnectorFailureType = 'document' | 'permission' | 'network' | 'auth' | 'unknown';

/**
 * Connector failure structure for sync tracking.
 */
export interface ConnectorFailure {
  type: ConnectorFailureType;
  message: string;
  documentId?: string;
  retryable: boolean;
  timestamp: Date;
  originalError?: Error;
}

/**
 * Extended error context for connector errors.
 */
export interface ConnectorErrorContext extends ErrorContext {
  /** Source type (e.g., 'GOOGLE_DRIVE', 'CONFLUENCE') */
  source?: string;
  /** Document ID if error is document-specific */
  documentId?: string;
  /** HTTP status if error came from API response */
  httpStatus?: number;
}

/**
 * Base error for all connector operations.
 * Adds source and documentId context to GertsError.
 *
 * @example
 * ```typescript
 * throw new ConnectorError('Failed to fetch page', {
 *   code: 'FETCH_FAILED',
 *   source: 'CONFLUENCE',
 *   documentId: 'page-123',
 *   httpStatus: 404,
 * });
 * ```
 */
export class ConnectorError extends GertsError {
  readonly source?: string;
  readonly documentId?: string;
  readonly httpStatus?: number;

  constructor(message: string, context: ConnectorErrorContext) {
    // Infer ErrorKind from HTTP status if not provided
    const kind =
      context.kind ?? (context.httpStatus ? errorKindFromHttp(context.httpStatus) : undefined);

    super(message, { ...context, kind });
    this.name = 'ConnectorError';
    this.source = context.source;
    this.documentId = context.documentId;
    this.httpStatus = context.httpStatus;
  }

  /**
   * Convert to ConnectorFailure format for sync tracking.
   */
  toConnectorFailure(): ConnectorFailure {
    return {
      type: this.inferFailureType(),
      message: this.message,
      documentId: this.documentId,
      retryable: this.isRetryable(),
      timestamp: new Date(),
      originalError: this,
    };
  }

  /**
   * Infer failure type from error properties.
   */
  private inferFailureType(): ConnectorFailureType {
    switch (this.kind) {
      case ErrorKind.Unauthenticated:
      case ErrorKind.PermissionDenied:
        return 'auth';
      case ErrorKind.Unavailable:
      case ErrorKind.DeadlineExceeded:
      case ErrorKind.ResourceExhausted:
        return 'network';
      default:
        return this.documentId ? 'document' : 'unknown';
    }
  }
}

/**
 * HTTP error for connector API calls.
 * Retryable for 5xx and rate limits.
 */
export class HttpConnectorError extends ConnectorError {
  readonly statusText: string;

  constructor(
    message: string,
    status: number,
    statusText: string,
    source?: string,
    documentId?: string,
  ) {
    super(message, {
      code: 'HTTP_ERROR',
      source,
      documentId,
      httpStatus: status,
      retryable: status >= 500 || status === 429 || status === 408,
    });
    this.name = 'HttpConnectorError';
    this.statusText = statusText;
  }

  /** Check if error is a specific HTTP status */
  is(status: number): boolean {
    return this.httpStatus === status;
  }

  /** Check if error is client error (4xx) */
  isClientError(): boolean {
    return this.httpStatus !== undefined && this.httpStatus >= 400 && this.httpStatus < 500;
  }

  /** Check if error is server error (5xx) */
  isServerError(): boolean {
    return this.httpStatus !== undefined && this.httpStatus >= 500 && this.httpStatus < 600;
  }

  override getRetryDelay(attempt: number): number | undefined {
    if (!this.isRetryable()) return undefined;
    // Rate limit - longer delay
    if (this.httpStatus === 429) {
      return Math.min(1000 * Math.pow(2, attempt), 60000);
    }
    // Server error - normal backoff
    return Math.min(100 * Math.pow(2, attempt), 10000);
  }
}

/**
 * Create ConnectorFailure from any error.
 */
export function createConnectorFailure(
  error: unknown,
  type: ConnectorFailureType = 'unknown',
  documentId?: string,
  retryable?: boolean,
): ConnectorFailure {
  if (error instanceof ConnectorError) {
    return error.toConnectorFailure();
  }

  const isError = error instanceof Error;
  return {
    type,
    message: isError ? error.message : String(error),
    documentId,
    retryable: retryable ?? (isError ? isRetryableError(error) : false),
    timestamp: new Date(),
    originalError: isError ? error : undefined,
  };
}

/**
 * Check if an error is a ConnectorError.
 */
export function isConnectorError(error: unknown): error is ConnectorError {
  return error instanceof ConnectorError;
}

// =============================================================================
// Type Guards and Utilities
// =============================================================================

/**
 * Check if an error is a GertsError.
 */
export function isGertsError(error: unknown): error is GertsError {
  return error instanceof GertsError;
}

/**
 * Check if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof GertsError) {
    return error.isRetryable();
  }
  // Check for common transient error patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('rate limit') ||
      message.includes('429') ||
      message.includes('503') ||
      message.includes('504')
    );
  }
  return false;
}

/**
 * Wrap an unknown error in a GertsError.
 */
export function wrapError(error: unknown, code = 'UNKNOWN_ERROR'): GertsError {
  if (error instanceof GertsError) {
    return error;
  }
  if (error instanceof Error) {
    return new GertsError(error.message, {
      code,
      cause: error,
      retryable: isRetryableError(error),
    });
  }
  return new GertsError(String(error), { code });
}
