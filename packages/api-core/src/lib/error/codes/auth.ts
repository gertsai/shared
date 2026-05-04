/**
 * RFC-053: Authentication Domain Error Codes
 *
 * Error codes specific to authentication and session management.
 * Use with APIError for consistent auth error handling.
 *
 * @module @gertsai/api-core/error/codes/auth
 */

/**
 * Authentication domain error codes.
 * These codes provide more specific context than generic HTTP status codes.
 */
export const AuthErrorCodes = {
  // ─────────────────────────────────────────────────────────────────────────
  // Credential Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Invalid email or password combination */
  INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  /** Email address not found in system */
  EMAIL_NOT_FOUND: 'AUTH_EMAIL_NOT_FOUND',
  /** Password does not meet requirements */
  WEAK_PASSWORD: 'AUTH_WEAK_PASSWORD',
  /** Password has been compromised (found in breach database) */
  COMPROMISED_PASSWORD: 'AUTH_COMPROMISED_PASSWORD',

  // ─────────────────────────────────────────────────────────────────────────
  // Token Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Token is malformed or corrupted */
  TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  /** Token has expired */
  TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  /** Token has been revoked */
  TOKEN_REVOKED: 'AUTH_TOKEN_REVOKED',
  /** Refresh token is invalid */
  REFRESH_TOKEN_INVALID: 'AUTH_REFRESH_TOKEN_INVALID',
  /** Refresh token has expired */
  REFRESH_TOKEN_EXPIRED: 'AUTH_REFRESH_TOKEN_EXPIRED',

  // ─────────────────────────────────────────────────────────────────────────
  // Session Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** Session not found */
  SESSION_NOT_FOUND: 'AUTH_SESSION_NOT_FOUND',
  /** Session has expired */
  SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  /** Session was invalidated (e.g., password change) */
  SESSION_INVALIDATED: 'AUTH_SESSION_INVALIDATED',
  /** Maximum sessions exceeded */
  MAX_SESSIONS_EXCEEDED: 'AUTH_MAX_SESSIONS_EXCEEDED',

  // ─────────────────────────────────────────────────────────────────────────
  // MFA Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** MFA is required but not provided */
  MFA_REQUIRED: 'AUTH_MFA_REQUIRED',
  /** MFA code is invalid */
  MFA_INVALID_CODE: 'AUTH_MFA_INVALID_CODE',
  /** MFA code has expired */
  MFA_CODE_EXPIRED: 'AUTH_MFA_CODE_EXPIRED',
  /** Too many MFA attempts */
  MFA_TOO_MANY_ATTEMPTS: 'AUTH_MFA_TOO_MANY_ATTEMPTS',

  // ─────────────────────────────────────────────────────────────────────────
  // Account State Errors
  // ─────────────────────────────────────────────────────────────────────────
  /** User account is disabled */
  ACCOUNT_DISABLED: 'AUTH_ACCOUNT_DISABLED',
  /** User account is locked (too many failed attempts) */
  ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  /** Email is not verified */
  EMAIL_NOT_VERIFIED: 'AUTH_EMAIL_NOT_VERIFIED',
  /** User has been banned */
  USER_BANNED: 'AUTH_USER_BANNED',
} as const;

export type AuthDomainCode = (typeof AuthErrorCodes)[keyof typeof AuthErrorCodes];
