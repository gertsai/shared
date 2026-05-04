/**
 * RFC-053: OIDCError Unit Tests
 *
 * Tests for OAuth2/OpenID Connect compliant error class.
 */

import { describe, it, expect } from 'vitest';
import {
  OIDCError,
  isOIDCError,
  oidcInvalidRequest,
  oidcInvalidClient,
  oidcInvalidGrant,
  oidcAccessDenied,
  oidcInvalidCredentials,
  oidcTooManyAttempts,
  oidcInvalidToken,
  oidcServerError,
} from '../lib/error/OIDCError.class';
import { ErrorKind } from '@gertsai/core';

describe('OIDCError', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Core Functionality
  // ─────────────────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('should create error with oauth2Error and errorDescription', () => {
      const error = new OIDCError('invalid_request', 'Missing required parameter');

      expect(error.oauth2Error).toBe('invalid_request');
      expect(error.errorDescription).toBe('Missing required parameter');
      expect(error.name).toBe('OIDCError');
      expect(error.__OIDC_ERROR__).toBe(true);
    });

    it('should inherit from Error', () => {
      const error = new OIDCError('invalid_grant', 'Token expired');

      expect(error).toBeInstanceOf(Error);
      // message includes base error + errorDescription
      expect(error.message).toContain('Token expired');
      expect(error.errorDescription).toBe('Token expired');
    });

    it('should accept optional redirectUri and state', () => {
      const error = new OIDCError('access_denied', 'User denied consent', {
        redirectUri: 'https://app.example.com/callback',
        state: 'abc123',
      });

      expect(error.redirectUri).toBe('https://app.example.com/callback');
      expect(error.state).toBe('abc123');
    });

    it('should accept optional details', () => {
      const error = new OIDCError('invalid_request', 'Bad params', {
        details: { field: 'redirect_uri', reason: 'mismatch' },
      });

      expect(error.data).toEqual({ field: 'redirect_uri', reason: 'mismatch' });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // HTTP Status Mapping
  // ─────────────────────────────────────────────────────────────────────────

  describe('status', () => {
    it('should return 400 for invalid_request', () => {
      expect(new OIDCError('invalid_request', 'Bad').status).toBe(400);
    });

    it('should return 401 for invalid_client', () => {
      expect(new OIDCError('invalid_client', 'Bad').status).toBe(401);
    });

    it('should return 401 for invalid_credentials', () => {
      expect(new OIDCError('invalid_credentials', 'Bad').status).toBe(401);
    });

    it('should return 403 for access_denied', () => {
      expect(new OIDCError('access_denied', 'Denied').status).toBe(403);
    });

    it('should return 404 for user_not_found', () => {
      expect(new OIDCError('user_not_found', 'Not found').status).toBe(404);
    });

    it('should return 409 for email_exists', () => {
      expect(new OIDCError('email_exists', 'Exists').status).toBe(409);
    });

    it('should return 429 for too_many_attempts', () => {
      expect(new OIDCError('too_many_attempts', 'Blocked').status).toBe(429);
    });

    it('should return 500 for server_error', () => {
      expect(new OIDCError('server_error', 'Failed').status).toBe(500);
    });

    it('should return 503 for temporarily_unavailable', () => {
      expect(new OIDCError('temporarily_unavailable', 'Retry').status).toBe(503);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ErrorKind Mapping
  // ─────────────────────────────────────────────────────────────────────────

  describe('kind', () => {
    it('should map invalid_request to InvalidArgument', () => {
      expect(new OIDCError('invalid_request', 'Bad').kind).toBe(ErrorKind.InvalidArgument);
    });

    it('should map invalid_credentials to Unauthenticated', () => {
      expect(new OIDCError('invalid_credentials', 'Bad').kind).toBe(ErrorKind.Unauthenticated);
    });

    it('should map too_many_attempts to ResourceExhausted', () => {
      expect(new OIDCError('too_many_attempts', 'Blocked').kind).toBe(ErrorKind.ResourceExhausted);
    });

    it('should map email_not_verified to FailedPrecondition', () => {
      expect(new OIDCError('email_not_verified', 'Verify').kind).toBe(ErrorKind.FailedPrecondition);
    });

    it('should map server_error to Internal', () => {
      expect(new OIDCError('server_error', 'Failed').kind).toBe(ErrorKind.Internal);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // OAuth2 Response Formatting
  // ─────────────────────────────────────────────────────────────────────────

  describe('toOAuth2Response', () => {
    it('should return OAuth2-compliant JSON', () => {
      const error = new OIDCError('invalid_grant', 'The refresh token has expired');
      const response = error.toOAuth2Response();

      expect(response).toEqual({
        error: 'invalid_grant',
        error_description: 'The refresh token has expired',
      });
    });
  });

  describe('toRedirectUrl', () => {
    it('should return null when no redirectUri', () => {
      const error = new OIDCError('invalid_request', 'Bad');

      expect(error.toRedirectUrl()).toBeNull();
    });

    it('should build redirect URL with error params', () => {
      const error = new OIDCError('access_denied', 'User denied', {
        redirectUri: 'https://app.example.com/callback',
      });

      const url = new URL(error.toRedirectUrl()!);

      expect(url.origin + url.pathname).toBe('https://app.example.com/callback');
      expect(url.searchParams.get('error')).toBe('access_denied');
      expect(url.searchParams.get('error_description')).toBe('User denied');
    });

    it('should include state in redirect URL', () => {
      const error = new OIDCError('access_denied', 'Denied', {
        redirectUri: 'https://app.example.com/callback',
        state: 'xyz789',
      });

      const url = new URL(error.toRedirectUrl()!);

      expect(url.searchParams.get('state')).toBe('xyz789');
    });
  });

  describe('shouldRedirect', () => {
    it('should return true when redirectUri is set', () => {
      const error = new OIDCError('access_denied', 'Denied', {
        redirectUri: 'https://app.example.com/callback',
      });

      expect(error.shouldRedirect()).toBe(true);
    });

    it('should return false when redirectUri is not set', () => {
      const error = new OIDCError('invalid_grant', 'Bad');

      expect(error.shouldRedirect()).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Type Guard
  // ─────────────────────────────────────────────────────────────────────────

  describe('isOIDCError', () => {
    it('should return true for OIDCError instances', () => {
      const error = new OIDCError('invalid_request', 'Bad');

      expect(isOIDCError(error)).toBe(true);
    });

    it('should return true for objects with __OIDC_ERROR__ marker', () => {
      const fakeError = { __OIDC_ERROR__: true, message: 'Fake' };

      expect(isOIDCError(fakeError)).toBe(true);
    });

    it('should return false for regular Error', () => {
      const error = new Error('Regular');

      expect(isOIDCError(error)).toBe(false);
    });

    it('should return false for non-errors', () => {
      expect(isOIDCError('string')).toBe(false);
      expect(isOIDCError(null)).toBe(false);
      expect(isOIDCError(undefined)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Factory Functions
  // ─────────────────────────────────────────────────────────────────────────

  describe('factory functions', () => {
    it('oidcInvalidRequest should create invalid_request error', () => {
      const error = oidcInvalidRequest('Missing redirect_uri');

      expect(error.oauth2Error).toBe('invalid_request');
      expect(error.errorDescription).toBe('Missing redirect_uri');
    });

    it('oidcInvalidClient should create invalid_client error', () => {
      const error = oidcInvalidClient();

      expect(error.oauth2Error).toBe('invalid_client');
      expect(error.status).toBe(401);
    });

    it('oidcInvalidGrant should create invalid_grant error', () => {
      const error = oidcInvalidGrant('Token expired');

      expect(error.oauth2Error).toBe('invalid_grant');
      expect(error.errorDescription).toBe('Token expired');
    });

    it('oidcAccessDenied should create access_denied error', () => {
      const error = oidcAccessDenied();

      expect(error.oauth2Error).toBe('access_denied');
      expect(error.status).toBe(403);
    });

    it('oidcInvalidCredentials should create invalid_credentials error', () => {
      const error = oidcInvalidCredentials();

      expect(error.oauth2Error).toBe('invalid_credentials');
      expect(error.errorDescription).toBe('Invalid email or password');
    });

    it('oidcTooManyAttempts should include retry time', () => {
      const error = oidcTooManyAttempts(5);

      expect(error.oauth2Error).toBe('too_many_attempts');
      expect(error.errorDescription).toContain('5 minutes');
    });

    it('oidcTooManyAttempts without retry time', () => {
      const error = oidcTooManyAttempts();

      expect(error.errorDescription).toContain('try again later');
    });

    it('oidcInvalidToken should create invalid_token error', () => {
      const error = oidcInvalidToken();

      expect(error.oauth2Error).toBe('invalid_token');
      expect(error.status).toBe(401);
    });

    it('oidcServerError should create server_error', () => {
      const error = oidcServerError();

      expect(error.oauth2Error).toBe('server_error');
      expect(error.status).toBe(500);
    });
  });
});
