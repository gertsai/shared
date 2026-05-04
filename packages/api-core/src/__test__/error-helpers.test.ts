/**
 * RFC-053: Error Helpers Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  notFoundError,
  conflictError,
  forbiddenError,
  unauthorizedError,
  tokenInvalidError,
  tokenExpiredError,
  validationError,
  badRequestError,
  internalError,
  serviceUnavailableError,
  rateLimitError,
  preconditionFailedError,
  payloadTooLargeError,
  insufficientStorageError,
  notImplementedError,
  requestTimeoutError,
  gatewayTimeoutError,
} from '../lib/error/helpers';
import { APIError } from '../lib/error';
import { ResponseCode } from '../lib/apiResponse';

// Helper to check if error is APIError-like
const isAPIError = (error: unknown): error is { code: ResponseCode } => {
  return error instanceof Error && 'code' in error && typeof (error as any).code === 'string';
};

describe('Error Helper Functions', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Resource Errors (404, 409)
  // ─────────────────────────────────────────────────────────────────────────

  describe('notFoundError', () => {
    it('should create NOT_FOUND error with resource name', () => {
      const error = notFoundError('User');

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.NOT_FOUND);
      expect(error.message).toContain('User not found');
    });

    it('should create NOT_FOUND error with resource name and id', () => {
      const error = notFoundError('User', 'abc123');

      expect(error.code).toBe(ResponseCode.NOT_FOUND);
      expect(error.message).toContain("User 'abc123' not found");
    });
  });

  describe('conflictError', () => {
    it('should create CONFLICT error with resource name', () => {
      const error = conflictError('Team');

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.CONFLICT);
      expect(error.message).toContain('Team already exists');
    });

    it('should create CONFLICT error with resource name and id', () => {
      const error = conflictError('Email', 'test@example.com');

      expect(error.code).toBe(ResponseCode.CONFLICT);
      expect(error.message).toContain("Email 'test@example.com' already exists");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Authorization Errors (401, 403)
  // ─────────────────────────────────────────────────────────────────────────

  describe('forbiddenError', () => {
    it('should create FORBIDDEN error with default message', () => {
      const error = forbiddenError();

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.FORBIDDEN);
      expect(error.message).toContain('Access denied');
    });

    it('should create FORBIDDEN error with custom message', () => {
      const error = forbiddenError('Only admins can do this');

      expect(error.code).toBe(ResponseCode.FORBIDDEN);
      expect(error.message).toContain('Only admins can do this');
    });
  });

  describe('unauthorizedError', () => {
    it('should create NOT_AUTHORIZED error with default message', () => {
      const error = unauthorizedError();

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.NOT_AUTHORIZED);
      expect(error.message).toContain('Authentication required');
    });

    it('should create NOT_AUTHORIZED error with custom message', () => {
      const error = unauthorizedError('Invalid credentials');

      expect(error.message).toContain('Invalid credentials');
    });
  });

  describe('tokenInvalidError', () => {
    it('should create TOKEN_INVALID error', () => {
      const error = tokenInvalidError();

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.NOT_AUTHORIZED__TOKEN_INVALID);
      expect(error.message).toContain('Invalid token');
    });
  });

  describe('tokenExpiredError', () => {
    it('should create TOKEN_EXPIRED error', () => {
      const error = tokenExpiredError();

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.NOT_AUTHORIZED__TOKEN_EXPIRED);
      expect(error.message).toContain('Token has expired');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Validation Errors (400)
  // ─────────────────────────────────────────────────────────────────────────

  describe('validationError', () => {
    it('should create BAD_REQUEST__INVALID_PARAMS error', () => {
      const error = validationError('Email is required');

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.BAD_REQUEST__INVALID_PARAMS);
      expect(error.message).toContain('Email is required');
    });

    it('should include validation details', () => {
      const error = validationError('Validation failed', {
        fields: { email: 'required' },
      });

      expect(error.data).toEqual({ fields: { email: 'required' } });
    });
  });

  describe('badRequestError', () => {
    it('should create BAD_REQUEST error', () => {
      const error = badRequestError('Invalid input');

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.BAD_REQUEST);
      expect(error.message).toContain('Invalid input');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Server Errors (500, 503)
  // ─────────────────────────────────────────────────────────────────────────

  describe('internalError', () => {
    it('should create INTERNAL_ERROR', () => {
      const error = internalError('Unexpected failure');

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.INTERNAL_ERROR);
      expect(error.message).toContain('Unexpected failure');
    });

    it('should append cause stack trace', () => {
      const cause = new Error('Original error');
      const error = internalError('Failed to process', cause);

      expect(error.stack).toContain('Caused by:');
      expect(error.stack).toContain('Original error');
    });
  });

  describe('serviceUnavailableError', () => {
    it('should create SERVICE_UNAVAILABLE error', () => {
      const error = serviceUnavailableError();

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.SERVICE_UNAVAILABLE);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Rate Limiting (429)
  // ─────────────────────────────────────────────────────────────────────────

  describe('rateLimitError', () => {
    it('should create TOO_MANY_REQUESTS error with retryAfter', () => {
      const error = rateLimitError(60);

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.TOO_MANY_REQUESTS);
      expect(error.message).toContain('Retry after 60s');
      expect(error.data).toEqual({ retryAfter: 60 });
    });

    it('should create TOO_MANY_REQUESTS error without retryAfter', () => {
      const error = rateLimitError();

      expect(error.message).toContain('Too many requests');
    });

    it('should create TOO_MANY_REQUESTS error with custom message', () => {
      const error = rateLimitError(30, 'API quota exceeded');

      expect(error.message).toContain('API quota exceeded');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Other Errors
  // ─────────────────────────────────────────────────────────────────────────

  describe('preconditionFailedError', () => {
    it('should create PRECONDITION_FAILED error', () => {
      const error = preconditionFailedError('Email must be verified');

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.PRECONDITION_FAILED);
      expect(error.message).toContain('Email must be verified');
    });
  });

  describe('payloadTooLargeError', () => {
    it('should create PAYLOAD_TOO_LARGE error with max size', () => {
      const error = payloadTooLargeError(10 * 1024 * 1024); // 10MB

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.PAYLOAD_TOO_LARGE);
      expect(error.message).toContain('10.0MB');
    });

    it('should include actual size in message', () => {
      const error = payloadTooLargeError(10 * 1024 * 1024, 15 * 1024 * 1024);

      expect(error.message).toContain('15.0MB');
      expect(error.message).toContain('exceeds limit');
    });
  });

  describe('insufficientStorageError', () => {
    it('should create INSUFFICIENT_STORAGE error', () => {
      const error = insufficientStorageError();

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.INSUFFICIENT_STORAGE);
    });
  });

  describe('notImplementedError', () => {
    it('should create NOT_IMPLEMENTED error', () => {
      const error = notImplementedError('WebSocket support');

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.NOT_IMPLEMENTED);
      expect(error.message).toContain('WebSocket support is not implemented');
    });
  });

  describe('requestTimeoutError', () => {
    it('should create REQUEST_TIMEOUT error', () => {
      const error = requestTimeoutError(30000);

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.REQUEST_TIMEOUT);
      expect(error.message).toContain('30000ms');
    });
  });

  describe('gatewayTimeoutError', () => {
    it('should create GATEWAY_TIMEOUT error', () => {
      const error = gatewayTimeoutError('LLM service');

      expect(isAPIError(error)).toBe(true);
      expect(error.code).toBe(ResponseCode.GATEWAY_TIMEOUT);
      expect(error.message).toContain('LLM service did not respond');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // APIError.fromError — statusCode auto-detection
  // ─────────────────────────────────────────────────────────────────────────

  describe('APIError.fromError', () => {
    it('should map error with statusCode 409 to CONFLICT', () => {
      const domainError = Object.assign(new Error('File already exists at path: /test.txt'), {
        statusCode: 409,
      });

      const apiError = APIError.fromError(domainError);

      expect(apiError.code).toBe(ResponseCode.CONFLICT);
      expect(apiError.message).toContain('File already exists at path: /test.txt');
    });

    it('should map error with statusCode 404 to NOT_FOUND', () => {
      const domainError = Object.assign(new Error('File not found: abc123'), {
        statusCode: 404,
      });

      const apiError = APIError.fromError(domainError);

      expect(apiError.code).toBe(ResponseCode.NOT_FOUND);
      expect(apiError.message).toContain('File not found: abc123');
    });

    it('should map error with statusCode 413 to PAYLOAD_TOO_LARGE', () => {
      const domainError = Object.assign(new Error('File too large'), {
        statusCode: 413,
      });

      const apiError = APIError.fromError(domainError);

      expect(apiError.code).toBe(ResponseCode.PAYLOAD_TOO_LARGE);
    });

    it('should map error with statusCode 415 to UNSUPPORTED_MEDIA_TYPE', () => {
      const domainError = Object.assign(new Error('MIME type not allowed'), {
        statusCode: 415,
      });

      const apiError = APIError.fromError(domainError);

      expect(apiError.code).toBe(ResponseCode.UNSUPPORTED_MEDIA_TYPE);
    });

    it('should prefer explicit code over statusCode', () => {
      const domainError = Object.assign(new Error('conflict'), {
        statusCode: 409,
      });

      const apiError = APIError.fromError(domainError, ResponseCode.BAD_REQUEST);

      expect(apiError.code).toBe(ResponseCode.BAD_REQUEST);
    });

    it('should fall back to INTERNAL_ERROR for errors without statusCode', () => {
      const plainError = new Error('Something went wrong');

      const apiError = APIError.fromError(plainError);

      expect(apiError.code).toBe(ResponseCode.INTERNAL_ERROR);
    });

    it('should fall back to INTERNAL_ERROR for unknown statusCode', () => {
      const domainError = Object.assign(new Error('weird'), {
        statusCode: 999,
      });

      const apiError = APIError.fromError(domainError);

      expect(apiError.code).toBe(ResponseCode.INTERNAL_ERROR);
    });

    it('should ignore non-numeric statusCode', () => {
      const domainError = Object.assign(new Error('bad'), {
        statusCode: 'not a number',
      });

      const apiError = APIError.fromError(domainError);

      expect(apiError.code).toBe(ResponseCode.INTERNAL_ERROR);
    });

    it('should preserve original stack trace', () => {
      const domainError = Object.assign(new Error('File exists'), {
        statusCode: 409,
      });

      const apiError = APIError.fromError(domainError);

      expect(apiError.stack).toBe(domainError.stack);
    });
  });
});
