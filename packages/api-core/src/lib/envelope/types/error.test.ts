/**
 * Tests for GertsErrorResponse envelope types
 */
import { describe, it, expect } from 'vitest';
import {
  type GertsErrorType,
  type GertsErrorCode,
  type GertsProcessingStage,
  type GertsErrorResponse,
  ERROR_STATUS_CODES,
  RETRYABLE_ERROR_CODES,
  generateRequestId,
  createGertsError,
  getStatusCode,
  isRetryable,
  validationError,
  notFoundError,
  authError,
  rateLimitError,
  internalError,
  isErrorResponse,
} from './error';

describe('GertsErrorResponse Envelope', () => {
  describe('ERROR_STATUS_CODES', () => {
    it('should map error types to HTTP status codes', () => {
      expect(ERROR_STATUS_CODES.validation_error).toBe(400);
      expect(ERROR_STATUS_CODES.bad_request_error).toBe(400);
      expect(ERROR_STATUS_CODES.authentication_error).toBe(401);
      expect(ERROR_STATUS_CODES.permission_error).toBe(403);
      expect(ERROR_STATUS_CODES.not_found_error).toBe(404);
      expect(ERROR_STATUS_CODES.conflict_error).toBe(409);
      expect(ERROR_STATUS_CODES.rate_limit_error).toBe(429);
      expect(ERROR_STATUS_CODES.timeout_error).toBe(504);
      expect(ERROR_STATUS_CODES.server_error).toBe(500);
      expect(ERROR_STATUS_CODES.service_unavailable).toBe(503);
    });
  });

  describe('RETRYABLE_ERROR_CODES', () => {
    it('should include rate limit errors', () => {
      expect(RETRYABLE_ERROR_CODES.has('RATE_LIMIT_EXCEEDED')).toBe(true);
      expect(RETRYABLE_ERROR_CODES.has('TOKEN_LIMIT_EXCEEDED')).toBe(true);
      expect(RETRYABLE_ERROR_CODES.has('REQUEST_LIMIT_EXCEEDED')).toBe(true);
    });

    it('should include timeout errors', () => {
      expect(RETRYABLE_ERROR_CODES.has('TIMEOUT_ERROR')).toBe(true);
      expect(RETRYABLE_ERROR_CODES.has('LLM_TIMEOUT')).toBe(true);
    });

    it('should include connection errors', () => {
      expect(RETRYABLE_ERROR_CODES.has('GRAPH_CONNECTION_ERROR')).toBe(true);
      expect(RETRYABLE_ERROR_CODES.has('VECTOR_CONNECTION_ERROR')).toBe(true);
      expect(RETRYABLE_ERROR_CODES.has('SERVICE_UNAVAILABLE')).toBe(true);
    });

    it('should NOT include validation errors', () => {
      expect(RETRYABLE_ERROR_CODES.has('VALIDATION_ERROR')).toBe(false);
      expect(RETRYABLE_ERROR_CODES.has('INVALID_API_KEY')).toBe(false);
    });
  });

  describe('generateRequestId', () => {
    it('should generate ID with req_ prefix', () => {
      const id = generateRequestId();
      expect(id).toMatch(/^req_[a-zA-Z0-9]{12}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRequestId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('GertsErrorType', () => {
    it('should define all error types', () => {
      const types: GertsErrorType[] = [
        'validation_error',
        'authentication_error',
        'permission_error',
        'not_found_error',
        'conflict_error',
        'rate_limit_error',
        'server_error',
        'service_unavailable',
        'timeout_error',
        'bad_request_error',
      ];
      expect(types).toHaveLength(10);
    });
  });

  describe('GertsProcessingStage', () => {
    it('should define all processing stages', () => {
      const stages: GertsProcessingStage[] = [
        'routing',
        'retrieval',
        'generation',
        'tool_execution',
        'grounding',
        'extraction',
        'embedding',
        'graph_query',
        'vector_search',
        'community_detection',
        'summarization',
        'validation',
        'authentication',
        'rate_limiting',
      ];
      expect(stages).toHaveLength(14);
    });
  });

  describe('GertsErrorResponse', () => {
    it('should define required fields', () => {
      const error: GertsErrorResponse = {
        success: false,
        error: {
          message: 'Entity not found',
          type: 'not_found_error',
          code: 'ENTITY_NOT_FOUND',
          retryable: false,
        },
        request_id: 'req_abc123def456',
        timestamp: '2025-01-05T12:00:00.000Z',
      };

      expect(error.success).toBe(false);
      expect(error.error.message).toBe('Entity not found');
      expect(error.error.type).toBe('not_found_error');
      expect(error.error.code).toBe('ENTITY_NOT_FOUND');
      expect(error.error.retryable).toBe(false);
    });

    it('should accept optional fields', () => {
      const error: GertsErrorResponse = {
        success: false,
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error',
          code: 'RATE_LIMIT_EXCEEDED',
          retryable: true,
          retry_after: 60,
          stage: 'rate_limiting',
          param: 'requests',
          details: { limit: 100, current: 150 },
        },
        request_id: 'req_abc123def456',
        timestamp: '2025-01-05T12:00:00.000Z',
        tenant_id: 'demo',
        trace_id: 'trace-123',
        documentation_url: 'https://docs.gerts.ai/errors/rate-limit',
      };

      expect(error.error.retryable).toBe(true);
      expect(error.error.retry_after).toBe(60);
      expect(error.error.stage).toBe('rate_limiting');
      expect(error.tenant_id).toBe('demo');
      expect(error.trace_id).toBe('trace-123');
    });
  });

  describe('createGertsError', () => {
    it('should create error with required fields', () => {
      const error = createGertsError({
        type: 'not_found_error',
        code: 'ENTITY_NOT_FOUND',
        message: 'Entity not found',
      });

      expect(error.success).toBe(false);
      expect(error.error.message).toBe('Entity not found');
      expect(error.error.type).toBe('not_found_error');
      expect(error.error.code).toBe('ENTITY_NOT_FOUND');
      expect(error.error.retryable).toBe(false);
      expect(error.request_id).toMatch(/^req_/);
      expect(error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should auto-detect retryable from code', () => {
      const retryableError = createGertsError({
        type: 'rate_limit_error',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded',
      });
      expect(retryableError.error.retryable).toBe(true);

      const nonRetryableError = createGertsError({
        type: 'not_found_error',
        code: 'ENTITY_NOT_FOUND',
        message: 'Not found',
      });
      expect(nonRetryableError.error.retryable).toBe(false);
    });

    it('should allow overriding retryable', () => {
      const error = createGertsError({
        type: 'server_error',
        code: 'INTERNAL_ERROR',
        message: 'Internal error',
        retryable: true, // Override default
      });
      expect(error.error.retryable).toBe(true);
    });

    it('should include optional fields', () => {
      const error = createGertsError({
        type: 'validation_error',
        code: 'INVALID_PARAMS',
        message: 'Invalid params',
        param: 'question',
        stage: 'validation',
        details: { field: 'question', reason: 'empty' },
        tenant_id: 'demo',
        trace_id: 'trace-123',
      });

      expect(error.error.param).toBe('question');
      expect(error.error.stage).toBe('validation');
      expect(error.error.details?.field).toBe('question');
      expect(error.tenant_id).toBe('demo');
      expect(error.trace_id).toBe('trace-123');
    });
  });

  describe('getStatusCode', () => {
    it('should return correct status codes', () => {
      expect(getStatusCode('validation_error')).toBe(400);
      expect(getStatusCode('authentication_error')).toBe(401);
      expect(getStatusCode('permission_error')).toBe(403);
      expect(getStatusCode('not_found_error')).toBe(404);
      expect(getStatusCode('rate_limit_error')).toBe(429);
      expect(getStatusCode('server_error')).toBe(500);
    });
  });

  describe('isRetryable', () => {
    it('should return true for retryable codes', () => {
      expect(isRetryable('RATE_LIMIT_EXCEEDED')).toBe(true);
      expect(isRetryable('TIMEOUT_ERROR')).toBe(true);
      expect(isRetryable('SERVICE_UNAVAILABLE')).toBe(true);
    });

    it('should return false for non-retryable codes', () => {
      expect(isRetryable('INVALID_API_KEY')).toBe(false);
      expect(isRetryable('ENTITY_NOT_FOUND')).toBe(false);
      expect(isRetryable('VALIDATION_ERROR')).toBe(false);
    });
  });

  describe('convenience error creators', () => {
    describe('validationError', () => {
      it('should create validation error', () => {
        const error = validationError('Invalid email format', 'email');

        expect(error.error.type).toBe('validation_error');
        expect(error.error.code).toBe('VALIDATION_ERROR');
        expect(error.error.message).toBe('Invalid email format');
        expect(error.error.param).toBe('email');
        expect(error.error.stage).toBe('validation');
        expect(error.error.retryable).toBe(false);
      });
    });

    describe('notFoundError', () => {
      it('should create not found error', () => {
        const error = notFoundError('Entity', 'xyz123');

        expect(error.error.type).toBe('not_found_error');
        expect(error.error.code).toBe('ENTITY_NOT_FOUND');
        expect(error.error.message).toBe('Entity with ID "xyz123" not found');
        expect(error.error.retryable).toBe(false);
      });

      it('should accept custom code', () => {
        const error = notFoundError('Document', 'doc123', 'DOCUMENT_NOT_FOUND');
        expect(error.error.code).toBe('DOCUMENT_NOT_FOUND');
      });
    });

    describe('authError', () => {
      it('should create auth error with defaults', () => {
        const error = authError();

        expect(error.error.type).toBe('authentication_error');
        expect(error.error.code).toBe('INVALID_API_KEY');
        expect(error.error.message).toBe('Invalid or missing API key');
        expect(error.error.stage).toBe('authentication');
        expect(error.error.retryable).toBe(false);
      });

      it('should accept custom message', () => {
        const error = authError('API key expired', 'EXPIRED_API_KEY');
        expect(error.error.message).toBe('API key expired');
        expect(error.error.code).toBe('EXPIRED_API_KEY');
      });
    });

    describe('rateLimitError', () => {
      it('should create rate limit error', () => {
        const error = rateLimitError(60);

        expect(error.error.type).toBe('rate_limit_error');
        expect(error.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(error.error.retryable).toBe(true);
        expect(error.error.retry_after).toBe(60);
        expect(error.error.stage).toBe('rate_limiting');
      });

      it('should include retry time in default message', () => {
        const error = rateLimitError(30);
        expect(error.error.message).toContain('30 seconds');
      });

      it('should accept custom message', () => {
        const error = rateLimitError(60, 'Too many requests');
        expect(error.error.message).toBe('Too many requests');
      });
    });

    describe('internalError', () => {
      it('should create internal error with defaults', () => {
        const error = internalError();

        expect(error.error.type).toBe('server_error');
        expect(error.error.code).toBe('INTERNAL_ERROR');
        expect(error.error.message).toBe('An internal error occurred');
        expect(error.error.retryable).toBe(false);
      });

      it('should accept custom message and details', () => {
        const error = internalError('Database error', { query: 'SELECT...' });
        expect(error.error.message).toBe('Database error');
        expect(error.error.details?.query).toBe('SELECT...');
      });
    });
  });

  describe('isErrorResponse', () => {
    it('should return true for valid error response', () => {
      const error = createGertsError({
        type: 'not_found_error',
        code: 'ENTITY_NOT_FOUND',
        message: 'Not found',
      });

      expect(isErrorResponse(error)).toBe(true);
    });

    it('should return false for success response', () => {
      const successResponse = {
        success: true,
        data: {},
      };

      expect(isErrorResponse(successResponse)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isErrorResponse(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isErrorResponse(undefined)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isErrorResponse('string')).toBe(false);
      expect(isErrorResponse(123)).toBe(false);
    });

    it('should return false for object without success field', () => {
      expect(isErrorResponse({ error: {} })).toBe(false);
    });

    it('should return false for object without error field', () => {
      expect(isErrorResponse({ success: false })).toBe(false);
    });
  });
});
