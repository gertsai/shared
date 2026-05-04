/**
 * RFC-053: APIError - Unified API Error Class
 *
 * APIError is the standard error class for all API endpoints.
 * Extends GertsError for unified error handling across the platform.
 *
 * @module @gertsai/api-core/error/APIError
 */

import { GertsError, ErrorKind, HTTP_TO_ERROR_KIND, type SerializedError } from '@gertsai/core';
import type { ResponseDataType } from '../apiResponse';
import { ResponseCode, responseMetadata } from '../apiResponse';

/**
 * Options for creating an APIError with additional context.
 */
export interface APIErrorOptions {
  /** Override the automatically determined ErrorKind */
  kind?: ErrorKind;
  /** Whether to expose error details to client (default: true for 4xx, false for 5xx) */
  expose?: boolean;
  /** Domain for error categorization (e.g., 'auth', 'files', 'oidc') */
  domain?: string;
}

/**
 * APIError - Standard API error class with RFC-053 unified error hierarchy.
 *
 * Extends GertsError to provide:
 * - Semantic error categories (ErrorKind)
 * - Consistent HTTP status mapping
 * - Retryable error detection
 * - Unified JSON serialization
 *
 * @example
 * ```typescript
 * // Simple usage
 * throw new APIError(ResponseCode.NOT_FOUND, undefined, 'User not found');
 *
 * // With options
 * throw new APIError(ResponseCode.INTERNAL_ERROR, undefined, 'DB failed', {
 *   expose: false, // Don't expose details to client
 *   domain: 'database',
 * });
 *
 * // Using helper functions (recommended)
 * import { notFoundError, conflictError } from '@gertsai/api-core';
 * throw notFoundError('User', userId);
 * ```
 */
export class APIError<CODE extends ResponseCode = ResponseCode> extends GertsError {
  /**
   * Whether to expose error details to the client.
   * - true: Full error message and data sent to client
   * - false: Generic message sent, details logged server-side
   */
  public readonly expose: boolean;

  /**
   * Domain for error categorization (e.g., 'auth', 'files', 'oidc').
   */
  public readonly domain?: string;

  /**
   * Response data associated with the error.
   */
  public readonly data?: ResponseDataType<CODE>;

  /**
   * Additional message appended to the base error message.
   */
  public readonly additionalMessage?: string;

  /**
   * Create a new APIError.
   *
   * @param code - ResponseCode enum value (e.g., ResponseCode.NOT_FOUND)
   * @param data - Optional response data for the error
   * @param additionalMessage - Optional message appended to base message
   * @param options - Additional options (kind, expose, domain)
   */
  public constructor(
    public readonly code: CODE,
    data?: ResponseDataType<CODE>,
    additionalMessage?: string,
    options?: APIErrorOptions,
  ) {
    const meta = responseMetadata[code].meta;
    const httpCode = meta.http_code;

    // Build the full message
    let message = meta.message;
    if (additionalMessage) {
      message += ': ' + additionalMessage;
    }

    // Determine ErrorKind from HTTP code or options
    const kind = options?.kind ?? HTTP_TO_ERROR_KIND[httpCode] ?? ErrorKind.Unknown;

    // Determine if error is retryable from metadata or kind
    const retryable =
      meta.retryable ??
      (kind === ErrorKind.ResourceExhausted ||
        kind === ErrorKind.Unavailable ||
        kind === ErrorKind.DeadlineExceeded);

    // Determine severity from HTTP code
    const severity = httpCode >= 500 ? 'error' : 'warn';

    // Call GertsError constructor
    super(message, {
      code: String(code),
      severity,
      retryable,
      kind,
      details: data as Record<string, unknown> | undefined,
    });

    this.name = 'APIError';
    this.data = data;
    this.additionalMessage = additionalMessage;
    this.domain = options?.domain;

    // Expose 4xx errors by default, hide 5xx details
    this.expose = options?.expose ?? httpCode < 500;
  }

  /**
   * Get the HTTP status code for this error.
   */
  get httpCode(): number {
    return responseMetadata[this.code].meta.http_code;
  }

  /**
   * Check if this is a client error (4xx).
   */
  get isClientError(): boolean {
    return this.httpCode >= 400 && this.httpCode < 500;
  }

  /**
   * Check if this is a server error (5xx).
   */
  get isServerError(): boolean {
    return this.httpCode >= 500;
  }

  /**
   * Create APIError from a native Error.
   *
   * If the error has a numeric `statusCode` property (e.g., domain errors like
   * FileStorageError), the corresponding ResponseCode is used automatically.
   * An explicit `code` parameter takes precedence over `statusCode`.
   *
   * @param e - Native Error to wrap
   * @param code - Optional ResponseCode (default: auto-detected or INTERNAL_ERROR)
   */
  public static fromError(e: Error, code?: ResponseCode): APIError {
    let resolvedCode = code;

    // Auto-detect ResponseCode from error.statusCode if no explicit code provided
    if (!resolvedCode) {
      const statusCode = (e as Error & { statusCode?: unknown }).statusCode;
      if (typeof statusCode === 'number' && statusCode >= 100 && statusCode < 600) {
        resolvedCode = APIError.httpCodeToResponseCode(statusCode);
      }
    }

    const error = new APIError(resolvedCode ?? ResponseCode.INTERNAL_ERROR, undefined, e.message);

    // Preserve original stack trace
    if (e.stack) {
      error.stack = e.stack;
    }

    return error;
  }

  /**
   * Map a numeric HTTP status code to the base ResponseCode.
   * Returns undefined if no matching ResponseCode exists.
   *
   * Picks only "base" codes (e.g., '409/conflict') and skips sub-codes
   * (e.g., '401/01/token_invalid') to avoid ambiguity.
   */
  private static _httpCodeMap: Map<number, ResponseCode> | undefined;

  private static httpCodeToResponseCode(httpCode: number): ResponseCode | undefined {
    if (!APIError._httpCodeMap) {
      APIError._httpCodeMap = new Map();
      for (const value of Object.values(ResponseCode)) {
        const parts = value.split('/');
        // Only map base codes (exactly 2 parts: "409/conflict"), skip sub-codes ("401/01/token_invalid")
        if (parts.length === 2) {
          const code = parseInt(parts[0], 10);
          if (!isNaN(code) && !APIError._httpCodeMap.has(code)) {
            APIError._httpCodeMap.set(code, value as ResponseCode);
          }
        }
      }
    }
    return APIError._httpCodeMap.get(httpCode);
  }

  /**
   * Create APIError from JSON (e.g., from serialized error).
   *
   * @param e - JSON object with error properties
   */
  public static fromJSON(e: Record<string, unknown>): APIError {
    const error = new APIError(e.code as ResponseCode, e.data as unknown, e.message as string);

    if (e.stack) {
      error.stack = e.stack as string;
    }

    return error;
  }

  /**
   * Convert error to client-safe JSON representation.
   * Respects the `expose` flag - hides details for 5xx errors.
   */
  toClientJSON(): Record<string, unknown> {
    if (!this.expose) {
      // Don't expose internal error details
      return {
        error: this.kind ?? ErrorKind.Internal,
        message: 'Internal server error',
        code: this.code,
      };
    }

    return {
      error: this.kind,
      message: this.message,
      code: this.code,
      data: this.data,
      ...(this.domain ? { domain: this.domain } : {}),
    };
  }

  /**
   * Convert error to full JSON (for logging/transport).
   * Includes all details regardless of expose flag.
   *
   * @override GertsError.toJSON
   */
  override toJSON(): SerializedError & { __API_ERROR__: true } {
    return {
      ...super.toJSON(),
      ...responseMetadata[this.code].meta,
      message: this.message,
      __API_ERROR__: true,
    };
  }

  /**
   * Serialize for JSON.stringify (called automatically).
   */
  toString(): string {
    return JSON.stringify(this.toJSON());
  }
}
