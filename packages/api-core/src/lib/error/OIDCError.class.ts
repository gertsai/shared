/**
 * RFC-053: OIDCError - OAuth2/OpenID Connect Error Class
 *
 * Specialized error class for OAuth2/OIDC endpoints.
 * Extends APIError with OAuth2-compliant error formatting.
 *
 * @module @gertsai/api-core/error/OIDCError
 */

import { ErrorKind } from '@gertsai/core';
import { APIError } from './APIError.class';
import { ResponseCode } from '../apiResponse';

/**
 * Standard OAuth2 error codes (RFC 6749)
 */
export type OAuth2ErrorCode =
  // Authorization Endpoint Errors (RFC 6749 Section 4.1.2.1)
  | 'invalid_request'
  | 'unauthorized_client'
  | 'access_denied'
  | 'unsupported_response_type'
  | 'invalid_scope'
  | 'server_error'
  | 'temporarily_unavailable'
  // Token Endpoint Errors (RFC 6749 Section 5.2)
  | 'invalid_client'
  | 'invalid_grant'
  | 'unsupported_grant_type'
  // OpenID Connect Errors
  | 'interaction_required'
  | 'login_required'
  | 'account_selection_required'
  | 'consent_required'
  | 'invalid_request_uri'
  | 'invalid_request_object'
  | 'request_not_supported'
  | 'request_uri_not_supported'
  | 'registration_not_supported'
  // Device Authorization (RFC 8628)
  | 'authorization_pending'
  | 'slow_down'
  | 'expired_token'
  // Custom error codes for our authentication flows
  | 'invalid_credentials'
  | 'email_not_verified'
  | 'too_many_attempts'
  | 'user_not_found'
  | 'email_exists'
  | 'disposable_email'
  | 'invalid_email'
  | 'weak_password'
  | 'invalid_token'
  | 'email_send_failed'
  | 'mfa_required'
  | 'mfa_not_enabled'
  | 'no_backup_codes'
  | 'invalid_code'
  | 'invalid_challenge'
  | 'verification_failed'
  | 'invalid_response'
  | 'invalid_credential'
  | 'no_credentials'
  | 'factor_not_found'
  | 'delete_failed'
  | 'unauthorized';

/**
 * Mapping from OAuth2 error codes to ErrorKind
 */
const OAUTH2_ERROR_TO_KIND: Partial<Record<OAuth2ErrorCode, ErrorKind>> = {
  invalid_request: ErrorKind.InvalidArgument,
  unauthorized_client: ErrorKind.PermissionDenied,
  access_denied: ErrorKind.PermissionDenied,
  unsupported_response_type: ErrorKind.InvalidArgument,
  invalid_scope: ErrorKind.InvalidArgument,
  server_error: ErrorKind.Internal,
  temporarily_unavailable: ErrorKind.Unavailable,
  invalid_client: ErrorKind.Unauthenticated,
  invalid_grant: ErrorKind.InvalidArgument,
  unsupported_grant_type: ErrorKind.InvalidArgument,
  invalid_credentials: ErrorKind.Unauthenticated,
  email_not_verified: ErrorKind.FailedPrecondition,
  too_many_attempts: ErrorKind.ResourceExhausted,
  user_not_found: ErrorKind.NotFound,
  email_exists: ErrorKind.AlreadyExists,
  weak_password: ErrorKind.InvalidArgument,
  invalid_token: ErrorKind.Unauthenticated,
  unauthorized: ErrorKind.Unauthenticated,
  mfa_required: ErrorKind.FailedPrecondition,
};

/**
 * Mapping from OAuth2 error codes to HTTP status codes
 */
const OAUTH2_ERROR_TO_HTTP: Partial<Record<OAuth2ErrorCode, number>> = {
  invalid_request: 400,
  unauthorized_client: 401,
  access_denied: 403,
  unsupported_response_type: 400,
  invalid_scope: 400,
  server_error: 500,
  temporarily_unavailable: 503,
  invalid_client: 401,
  invalid_grant: 400,
  unsupported_grant_type: 400,
  invalid_credentials: 401,
  email_not_verified: 403,
  too_many_attempts: 429,
  user_not_found: 404,
  email_exists: 409,
  weak_password: 400,
  invalid_token: 401,
  unauthorized: 401,
  authorization_pending: 400,
  slow_down: 400,
  expired_token: 400,
};

/**
 * Mapping from OAuth2 error codes to ResponseCode
 */
const OAUTH2_ERROR_TO_RESPONSE_CODE: Partial<Record<OAuth2ErrorCode, ResponseCode>> = {
  invalid_request: ResponseCode.BAD_REQUEST__INVALID_PARAMS,
  unauthorized_client: ResponseCode.NOT_AUTHORIZED,
  access_denied: ResponseCode.FORBIDDEN,
  server_error: ResponseCode.INTERNAL_ERROR,
  temporarily_unavailable: ResponseCode.SERVICE_UNAVAILABLE,
  invalid_client: ResponseCode.NOT_AUTHORIZED,
  invalid_grant: ResponseCode.BAD_REQUEST__INVALID_PARAMS,
  invalid_credentials: ResponseCode.NOT_AUTHORIZED,
  too_many_attempts: ResponseCode.TOO_MANY_REQUESTS,
  user_not_found: ResponseCode.NOT_FOUND,
  email_exists: ResponseCode.CONFLICT,
  invalid_token: ResponseCode.NOT_AUTHORIZED__TOKEN_INVALID,
  unauthorized: ResponseCode.NOT_AUTHORIZED,
};

/**
 * OIDCError - OAuth2/OpenID Connect compliant error
 *
 * Use this class for all OIDC/OAuth2 endpoint errors.
 * Provides automatic OAuth2-compliant response formatting.
 *
 * @example
 * ```typescript
 * // Simple usage
 * throw new OIDCError('invalid_credentials', 'Invalid email or password');
 *
 * // With redirect URI for authorization endpoint
 * throw new OIDCError('access_denied', 'User denied consent', {
 *   redirectUri: 'https://app.example.com/callback',
 *   state: 'abc123',
 * });
 * ```
 */
export class OIDCError extends APIError {
  /**
   * OAuth2 error code (e.g., 'invalid_request', 'invalid_grant')
   */
  public readonly oauth2Error: OAuth2ErrorCode;

  /**
   * OAuth2 error_description field
   */
  public readonly errorDescription: string;

  /**
   * Optional redirect URI for authorization endpoint errors
   */
  public readonly redirectUri?: string;

  /**
   * Optional state parameter to include in redirect
   */
  public readonly state?: string;

  /**
   * Marker for error middleware to detect OIDC errors
   */
  public readonly __OIDC_ERROR__ = true;

  constructor(
    oauth2Error: OAuth2ErrorCode,
    errorDescription: string,
    options?: {
      redirectUri?: string;
      state?: string;
      details?: Record<string, unknown>;
    },
  ) {
    const responseCode = OAUTH2_ERROR_TO_RESPONSE_CODE[oauth2Error] ?? ResponseCode.BAD_REQUEST;
    const kind = OAUTH2_ERROR_TO_KIND[oauth2Error] ?? ErrorKind.InvalidArgument;

    super(responseCode, options?.details, errorDescription, { kind, domain: 'oidc' });

    this.name = 'OIDCError';
    this.oauth2Error = oauth2Error;
    this.errorDescription = errorDescription;
    if (options?.redirectUri !== undefined) this.redirectUri = options.redirectUri;
    if (options?.state !== undefined) this.state = options.state;
  }

  /**
   * Get HTTP status code for this error
   */
  get status(): number {
    return OAUTH2_ERROR_TO_HTTP[this.oauth2Error] ?? 400;
  }

  /**
   * Convert to OAuth2-compliant JSON response
   */
  toOAuth2Response(): { error: string; error_description: string } {
    return {
      error: this.oauth2Error,
      error_description: this.errorDescription,
    };
  }

  /**
   * Build redirect URL with error parameters (for authorization endpoint)
   */
  toRedirectUrl(): string | null {
    if (!this.redirectUri) {
      return null;
    }

    const url = new URL(this.redirectUri);
    url.searchParams.set('error', this.oauth2Error);
    url.searchParams.set('error_description', this.errorDescription);

    if (this.state) {
      url.searchParams.set('state', this.state);
    }

    return url.toString();
  }

  /**
   * Check if error should redirect (authorization endpoint) or return JSON (token endpoint)
   */
  shouldRedirect(): boolean {
    return !!this.redirectUri;
  }
}

/**
 * Type guard to check if an error is an OIDCError
 */
export function isOIDCError(error: unknown): error is OIDCError {
  return error instanceof OIDCError || (error as any)?.__OIDC_ERROR__ === true;
}

// =============================================================================
// Factory Functions for Common OIDC Errors
// =============================================================================

/**
 * Create an invalid_request error
 */
export function oidcInvalidRequest(message: string): OIDCError {
  return new OIDCError('invalid_request', message);
}

/**
 * Create an invalid_client error
 */
export function oidcInvalidClient(message = 'Invalid client'): OIDCError {
  return new OIDCError('invalid_client', message);
}

/**
 * Create an invalid_grant error
 */
export function oidcInvalidGrant(message = 'Invalid grant'): OIDCError {
  return new OIDCError('invalid_grant', message);
}

/**
 * Create an access_denied error
 */
export function oidcAccessDenied(message = 'Access denied'): OIDCError {
  return new OIDCError('access_denied', message);
}

/**
 * Create an invalid_credentials error (login failures)
 */
export function oidcInvalidCredentials(message = 'Invalid email or password'): OIDCError {
  return new OIDCError('invalid_credentials', message);
}

/**
 * Create a too_many_attempts error (rate limiting)
 */
export function oidcTooManyAttempts(retryAfterMinutes?: number): OIDCError {
  const message = retryAfterMinutes
    ? `Too many failed attempts. Please try again in ${retryAfterMinutes} minutes.`
    : 'Too many failed attempts. Please try again later.';
  return new OIDCError('too_many_attempts', message);
}

/**
 * Create an invalid_token error
 */
export function oidcInvalidToken(message = 'Invalid or expired token'): OIDCError {
  return new OIDCError('invalid_token', message);
}

/**
 * Create a server_error
 */
export function oidcServerError(message = 'An unexpected error occurred'): OIDCError {
  return new OIDCError('server_error', message);
}
