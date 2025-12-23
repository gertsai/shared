export type ErrorSeverity = 'info' | 'warn' | 'error' | 'fatal';

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
}

/**
 * Base error class for all gerts.ai errors.
 * Implements RetryableError interface for unified error handling.
 */
export class GertsError extends Error implements RetryableError {
  readonly code: string;
  readonly severity: ErrorSeverity;
  readonly details?: Record<string, unknown>;
  protected readonly _retryable: boolean;

  constructor(message: string, context: ErrorContext) {
    super(message);
    this.name = 'GertsError';
    this.code = context.code;
    this.severity = context.severity ?? 'error';
    this.details = context.details;
    this._retryable = context.retryable ?? false;
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
    };
  }
}

export class NotFoundError extends GertsError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'NOT_FOUND', details, retryable: false });
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends GertsError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'VALIDATION_FAILED', details, severity: 'warn', retryable: false });
    this.name = 'ValidationError';
  }
}

/**
 * Timeout error - transient, retryable.
 */
export class TimeoutError extends GertsError {
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number, details?: Record<string, unknown>) {
    super(message, { code: 'TIMEOUT', details: { ...details, timeoutMs }, retryable: true });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Connection error - transient, retryable.
 */
export class ConnectionError extends GertsError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'CONNECTION_FAILED', details, retryable: true });
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
      retryable: true
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
    super(message, { code: 'AUTHENTICATION_FAILED', details, retryable: false });
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization error - permanent, not retryable.
 */
export class AuthorizationError extends GertsError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { code: 'AUTHORIZATION_FAILED', details, retryable: false });
    this.name = 'AuthorizationError';
  }
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
