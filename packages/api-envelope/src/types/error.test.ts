/**
 * Tests for error taxonomy support (post Wave 14.6 — PRD-054 / EVID-057
 * §Error Envelope — FINAL).
 *
 * The legacy RFC-030 `GertsErrorResponse` envelope, its `createGertsError`
 * factory, typia validators, the `toProblemDetails` migration helper, the
 * `ProblemDetailsLike` interface, the convenience creators, and the
 * `isErrorResponse` type guard have been REMOVED. Canonical wire format is
 * now RFC 9457 `ProblemDetails` from `@gertsai/errors/http`. Tests covering
 * those removed APIs were deleted in lockstep; what remains here covers the
 * taxonomy values + lookup helpers that survive the removal.
 */
import { describe, expect, it } from 'vitest';
import {
  ERROR_STATUS_CODES,
  GERTS_TYPE_TO_PROBLEM_URN,
  generateRequestId,
  getStatusCode,
  isRetryable,
  RETRYABLE_ERROR_CODES,
  type GertsErrorType,
  type GertsProcessingStage,
} from './error';

describe('Error taxonomy (post Wave 14.6)', () => {
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

  describe('GERTS_TYPE_TO_PROBLEM_URN', () => {
    it('should map each GertsErrorType to a canonical RFC 9457 URN', () => {
      expect(GERTS_TYPE_TO_PROBLEM_URN.validation_error).toBe('urn:gertsai:errors:validation');
      expect(GERTS_TYPE_TO_PROBLEM_URN.bad_request_error).toBe('urn:gertsai:errors:validation');
      expect(GERTS_TYPE_TO_PROBLEM_URN.authentication_error).toBe(
        'urn:gertsai:errors:unauthenticated',
      );
      expect(GERTS_TYPE_TO_PROBLEM_URN.permission_error).toBe('urn:gertsai:errors:permission');
      expect(GERTS_TYPE_TO_PROBLEM_URN.not_found_error).toBe('urn:gertsai:errors:not-found');
      expect(GERTS_TYPE_TO_PROBLEM_URN.conflict_error).toBe('urn:gertsai:errors:conflict');
      expect(GERTS_TYPE_TO_PROBLEM_URN.rate_limit_error).toBe('urn:gertsai:errors:rate-limit');
      expect(GERTS_TYPE_TO_PROBLEM_URN.timeout_error).toBe('urn:gertsai:errors:timeout');
      expect(GERTS_TYPE_TO_PROBLEM_URN.server_error).toBe('urn:gertsai:errors:server');
      expect(GERTS_TYPE_TO_PROBLEM_URN.service_unavailable).toBe('urn:gertsai:errors:server');
    });
  });
});
