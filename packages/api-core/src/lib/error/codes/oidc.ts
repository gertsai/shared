/**
 * RFC-053: OIDC/OAuth2 Domain Error Codes
 *
 * Error codes specific to OAuth2 and OpenID Connect flows.
 * Based on RFC 6749 (OAuth 2.0) and OpenID Connect Core 1.0.
 *
 * @module @gerts/api-core/error/codes/oidc
 */

/**
 * OIDC/OAuth2 domain error codes.
 * These map to standard OAuth2 error responses.
 */
export const OIDCErrorCodes = {
  // ─────────────────────────────────────────────────────────────────────────
  // Authorization Endpoint Errors (RFC 6749 Section 4.1.2.1)
  // ─────────────────────────────────────────────────────────────────────────
  /** Invalid authorization request */
  INVALID_REQUEST: 'OIDC_INVALID_REQUEST',
  /** Client is not authorized to request this grant type */
  UNAUTHORIZED_CLIENT: 'OIDC_UNAUTHORIZED_CLIENT',
  /** Access denied by resource owner or authorization server */
  ACCESS_DENIED: 'OIDC_ACCESS_DENIED',
  /** Unsupported response type */
  UNSUPPORTED_RESPONSE_TYPE: 'OIDC_UNSUPPORTED_RESPONSE_TYPE',
  /** Requested scope is invalid, unknown, or malformed */
  INVALID_SCOPE: 'OIDC_INVALID_SCOPE',
  /** Authorization server encountered an unexpected condition */
  SERVER_ERROR: 'OIDC_SERVER_ERROR',
  /** Authorization server is temporarily unavailable */
  TEMPORARILY_UNAVAILABLE: 'OIDC_TEMPORARILY_UNAVAILABLE',

  // ─────────────────────────────────────────────────────────────────────────
  // Token Endpoint Errors (RFC 6749 Section 5.2)
  // ─────────────────────────────────────────────────────────────────────────
  /** Client authentication failed */
  INVALID_CLIENT: 'OIDC_INVALID_CLIENT',
  /** Invalid or expired authorization grant */
  INVALID_GRANT: 'OIDC_INVALID_GRANT',
  /** Grant type not supported by this authorization server */
  UNSUPPORTED_GRANT_TYPE: 'OIDC_UNSUPPORTED_GRANT_TYPE',

  // ─────────────────────────────────────────────────────────────────────────
  // OpenID Connect Specific Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Interaction with end-user is required */
  INTERACTION_REQUIRED: 'OIDC_INTERACTION_REQUIRED',
  /** User authentication is required */
  LOGIN_REQUIRED: 'OIDC_LOGIN_REQUIRED',
  /** User account selection is required */
  ACCOUNT_SELECTION_REQUIRED: 'OIDC_ACCOUNT_SELECTION_REQUIRED',
  /** User consent is required */
  CONSENT_REQUIRED: 'OIDC_CONSENT_REQUIRED',
  /** Request URI is invalid or expired */
  INVALID_REQUEST_URI: 'OIDC_INVALID_REQUEST_URI',
  /** Request object is invalid */
  INVALID_REQUEST_OBJECT: 'OIDC_INVALID_REQUEST_OBJECT',
  /** Request not supported */
  REQUEST_NOT_SUPPORTED: 'OIDC_REQUEST_NOT_SUPPORTED',
  /** Request URI not supported */
  REQUEST_URI_NOT_SUPPORTED: 'OIDC_REQUEST_URI_NOT_SUPPORTED',
  /** Registration not supported */
  REGISTRATION_NOT_SUPPORTED: 'OIDC_REGISTRATION_NOT_SUPPORTED',

  // ─────────────────────────────────────────────────────────────────────────
  // State/Flow Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** State parameter is invalid or missing */
  INVALID_STATE: 'OIDC_INVALID_STATE',
  /** PKCE code verifier is invalid */
  INVALID_CODE_VERIFIER: 'OIDC_INVALID_CODE_VERIFIER',
  /** Authorization code has expired */
  CODE_EXPIRED: 'OIDC_CODE_EXPIRED',
  /** Authorization code has already been used */
  CODE_ALREADY_USED: 'OIDC_CODE_ALREADY_USED',
  /** Redirect URI does not match registered URIs */
  REDIRECT_URI_MISMATCH: 'OIDC_REDIRECT_URI_MISMATCH',

  // ─────────────────────────────────────────────────────────────────────────
  // Social Login Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Social provider authentication failed */
  PROVIDER_AUTH_FAILED: 'OIDC_PROVIDER_AUTH_FAILED',
  /** Social provider returned invalid response */
  PROVIDER_INVALID_RESPONSE: 'OIDC_PROVIDER_INVALID_RESPONSE',
  /** Social account is already linked to another user */
  ACCOUNT_ALREADY_LINKED: 'OIDC_ACCOUNT_ALREADY_LINKED',
  /** Social provider is not configured */
  PROVIDER_NOT_CONFIGURED: 'OIDC_PROVIDER_NOT_CONFIGURED',
} as const;

export type OIDCErrorCode = (typeof OIDCErrorCodes)[keyof typeof OIDCErrorCodes];
