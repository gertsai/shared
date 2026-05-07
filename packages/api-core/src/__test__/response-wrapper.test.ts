/**
 * Response Wrapper Tests
 *
 * Tests for RFC-030 response transformation in envelope/response-wrapper.ts.
 */

import { describe, it, expect } from 'vitest';
import type { Context } from 'moleculer';
import {
  detectObjectType,
  getIdPrefix,
  wrapSuccessResponse,
  wrapErrorResponse,
  buildResponsePayload,
} from '../lib/envelope/response-wrapper';
import { OrchestraApiResponse } from '../lib/apiResponse/OrchestraApiResponse.class';
import { ResponseCode } from '../lib/apiResponse/types';

// ============================================================================
// Mock Context
// ============================================================================

function createMockContext(meta: Record<string, unknown> = {}): Context {
  return {
    id: 'test-context-id',
    nodeID: 'test-node',
    meta: {
      tenantId: 'test-tenant',
      ...meta,
    },
  } as unknown as Context;
}

// ============================================================================
// detectObjectType Tests
// ============================================================================

describe('detectObjectType', () => {
  describe('Array Detection', () => {
    it('should detect entity list from path', () => {
      expect(detectObjectType([], '/api/v1/entities')).toBe('entity.list');
    });

    it('should detect relationship list from path', () => {
      expect(detectObjectType([], '/api/v1/relationships')).toBe('relationship.list');
    });

    it('should detect community list from path', () => {
      expect(detectObjectType([], '/api/v1/communities')).toBe('community.list');
    });

    it('should detect chunk list from path', () => {
      expect(detectObjectType([], '/api/v1/chunks')).toBe('chunk.list');
    });

    it('should default to list for unknown array path', () => {
      expect(detectObjectType([], '/api/v1/unknown')).toBe('list');
    });
  });

  describe('Object Type Detection', () => {
    it('should detect query result', () => {
      expect(detectObjectType({ answer: 'Test', sources: [] })).toBe('query.result');
    });

    it('should detect query analysis', () => {
      expect(detectObjectType({ category: 'factual', recommendedMode: 'local' })).toBe(
        'query.analysis',
      );
    });

    it('should detect entity', () => {
      expect(detectObjectType({ type: 'Person', name: 'John' })).toBe('entity');
    });

    it('should detect relationship', () => {
      expect(detectObjectType({ sourceId: '1', targetId: '2' })).toBe('relationship');
    });

    it('should detect community', () => {
      expect(detectObjectType({ memberCount: 10, level: 1 })).toBe('community');
    });

    it('should detect job status', () => {
      expect(detectObjectType({ jobId: 'job-1', status: 'running' })).toBe('job.status');
    });

    it('should detect stats', () => {
      expect(detectObjectType({ entities: 100, relationships: 200 })).toBe('stats');
    });

    it('should detect health', () => {
      expect(detectObjectType({ status: 'ok', uptime: 1000 })).toBe('health');
      expect(detectObjectType({ status: 'ok', healthy: true })).toBe('health');
    });

    it('should detect graph export', () => {
      expect(detectObjectType({ format: 'json', stats: {} })).toBe('graph.export');
    });
  });

  describe('Path-Based Detection', () => {
    it('should detect query from path', () => {
      expect(detectObjectType({}, '/api/v1/query')).toBe('query.result');
    });

    it('should detect ingest job from path', () => {
      expect(detectObjectType({}, '/api/v1/ingest/file')).toBe('job');
    });

    it('should detect scheduler from path', () => {
      expect(detectObjectType({}, '/api/v1/scheduler/status')).toBe('scheduler.status');
    });

    it('should detect vector from path', () => {
      expect(detectObjectType({}, '/api/v1/vector/search')).toBe('vector.search');
    });
  });
});

// ============================================================================
// getIdPrefix Tests
// ============================================================================

describe('getIdPrefix', () => {
  it('should return correct prefix for query types', () => {
    expect(getIdPrefix('query.result')).toBe('qry');
    expect(getIdPrefix('query.analysis')).toBe('qry');
    expect(getIdPrefix('vector.search')).toBe('qry');
  });

  it('should return correct prefix for entity types', () => {
    expect(getIdPrefix('entity')).toBe('ent');
    expect(getIdPrefix('entity.list')).toBe('lst');
  });

  it('should return correct prefix for relationship types', () => {
    expect(getIdPrefix('relationship')).toBe('rel');
    expect(getIdPrefix('relationship.list')).toBe('lst');
  });

  it('should return correct prefix for community types', () => {
    expect(getIdPrefix('community')).toBe('com');
    expect(getIdPrefix('community.list')).toBe('lst');
  });

  it('should return correct prefix for document types', () => {
    expect(getIdPrefix('document')).toBe('doc');
    expect(getIdPrefix('chunk')).toBe('chk');
  });

  it('should return correct prefix for job types', () => {
    expect(getIdPrefix('job')).toBe('job');
    expect(getIdPrefix('job.status')).toBe('job');
    expect(getIdPrefix('scheduler.status')).toBe('job');
  });

  it('should return correct prefix for system types', () => {
    expect(getIdPrefix('health')).toBe('sys');
    expect(getIdPrefix('stats')).toBe('sys');
  });

  it('should return lst for unknown types', () => {
    expect(getIdPrefix('unknown' as any)).toBe('lst');
  });
});

// ============================================================================
// wrapSuccessResponse Tests
// ============================================================================

describe('wrapSuccessResponse', () => {
  it('should wrap successful response', () => {
    const ctx = createMockContext();
    const orchResponse = new OrchestraApiResponse(ResponseCode.SUCCESS, {
      answer: 'Test answer',
      sources: [],
    });

    const result = wrapSuccessResponse({
      ctx,
      orchResponse,
      path: '/api/v1/query',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ answer: 'Test answer', sources: [] });
    expect(result.object).toBe('query.result');
    expect(result.tenant_id).toBe('test-tenant');
    expect(result.id).toMatch(/^qry_[a-zA-Z0-9]{12,}$/);
    expect(result.created).toBeTypeOf('number');
  });

  it('should include usage info when present', () => {
    const ctx = createMockContext();
    const orchResponse = new OrchestraApiResponse(ResponseCode.SUCCESS, {
      answer: 'Test',
      sources: [],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    });

    const result = wrapSuccessResponse({
      ctx,
      orchResponse,
    });

    expect(result.usage).toBeDefined();
    expect(result.usage?.prompt_tokens).toBe(100);
    expect(result.usage?.completion_tokens).toBe(50);
    expect(result.usage?.total_tokens).toBe(150);
  });

  it('should include trace ID when present in meta', () => {
    const ctx = createMockContext({ traceId: 'trace-123' });
    const orchResponse = new OrchestraApiResponse(ResponseCode.SUCCESS, {});

    const result = wrapSuccessResponse({
      ctx,
      orchResponse,
    });

    expect(result.trace_id).toBe('trace-123');
  });

  it('should include legacy fields', () => {
    const ctx = createMockContext();
    const orchResponse = new OrchestraApiResponse(ResponseCode.SUCCESS, {});

    const result = wrapSuccessResponse({
      ctx,
      orchResponse,
      packageJson: { name: '@example/test', version: '1.0.0' },
      nodeName: 'test-node',
    });

    expect(result._legacy).toBeDefined();
    expect(result._legacy.tracking_id).toBe('test-context-id');
    expect(result._legacy.app).toEqual({
      name: 'test-node',
      node_id: 'test-node',
      package: '@example/test',
      version: '1.0.0',
    });
  });

  it('should use default tenant when not in meta', () => {
    const ctx = createMockContext({});
    (ctx.meta as Record<string, unknown>).tenantId = undefined;
    const orchResponse = new OrchestraApiResponse(ResponseCode.SUCCESS, {});

    const result = wrapSuccessResponse({
      ctx,
      orchResponse,
    });

    expect(result.tenant_id).toBe('default');
  });
});

// ============================================================================
// wrapErrorResponse Tests
// ============================================================================

describe('wrapErrorResponse', () => {
  it('should wrap error response', () => {
    const ctx = createMockContext({ requestId: 'req_from_ctx' });
    const orchResponse = new OrchestraApiResponse(
      ResponseCode.NOT_FOUND,
      {},
      { message: 'Resource not found' },
    );

    const result = wrapErrorResponse({
      ctx,
      orchResponse,
      path: '/api/v1/entity/123',
    });

    expect(result.success).toBe(false);
    expect(result.error.message).toBe('Resource not found');
    expect(result.error.type).toBe('not_found_error');
    expect(result.request_id).toBe('req_from_ctx');
    expect(result.timestamp).toBeDefined();
  });

  it('should map response codes to error types', () => {
    const ctx = createMockContext();

    // 400 -> bad_request_error
    const badRequest = new OrchestraApiResponse(ResponseCode.BAD_REQUEST, {});
    expect(wrapErrorResponse({ ctx, orchResponse: badRequest }).error.type).toBe(
      'bad_request_error',
    );

    // 401 -> authentication_error
    const unauthorized = new OrchestraApiResponse(ResponseCode.NOT_AUTHORIZED, {});
    expect(wrapErrorResponse({ ctx, orchResponse: unauthorized }).error.type).toBe(
      'authentication_error',
    );

    // 403 -> permission_error
    const forbidden = new OrchestraApiResponse(ResponseCode.FORBIDDEN, {});
    expect(wrapErrorResponse({ ctx, orchResponse: forbidden }).error.type).toBe('permission_error');

    // 429 -> rate_limit_error
    const rateLimit = new OrchestraApiResponse(ResponseCode.TOO_MANY_REQUESTS, {});
    expect(wrapErrorResponse({ ctx, orchResponse: rateLimit }).error.type).toBe('rate_limit_error');

    // 500 -> server_error
    const internal = new OrchestraApiResponse(ResponseCode.INTERNAL_ERROR, {});
    expect(wrapErrorResponse({ ctx, orchResponse: internal }).error.type).toBe('server_error');
  });

  it('should map auth response codes to domain error codes', () => {
    const ctx = createMockContext();

    const missingApiKey = new OrchestraApiResponse(ResponseCode.NOT_AUTHORIZED, {});
    expect(wrapErrorResponse({ ctx, orchResponse: missingApiKey }).error.code).toBe(
      'MISSING_API_KEY',
    );

    const invalidApiKey = new OrchestraApiResponse(ResponseCode.NOT_AUTHORIZED__TOKEN_INVALID, {});
    expect(wrapErrorResponse({ ctx, orchResponse: invalidApiKey }).error.code).toBe(
      'INVALID_API_KEY',
    );

    const insufficientScope = new OrchestraApiResponse(ResponseCode.INSUFFICIENT_SCOPE, {});
    expect(wrapErrorResponse({ ctx, orchResponse: insufficientScope }).error.code).toBe(
      'INSUFFICIENT_SCOPE',
    );
  });

  it('should detect retryable errors', () => {
    const ctx = createMockContext();

    // Rate limit should be retryable
    const rateLimit = new OrchestraApiResponse(ResponseCode.TOO_MANY_REQUESTS, {});
    expect(wrapErrorResponse({ ctx, orchResponse: rateLimit }).error.retryable).toBe(true);

    // 401 should not be retryable
    const unauthorized = new OrchestraApiResponse(ResponseCode.NOT_AUTHORIZED, {});
    expect(wrapErrorResponse({ ctx, orchResponse: unauthorized }).error.retryable).toBe(false);
  });

  it('should include retry_after for rate limit errors', () => {
    const ctx = createMockContext();
    const orchResponse = new OrchestraApiResponse(ResponseCode.TOO_MANY_REQUESTS, {});

    const result = wrapErrorResponse({
      ctx,
      orchResponse,
    });

    expect(result.error.retry_after).toBe(60);
  });

  it('should detect stage from path', () => {
    const ctx = createMockContext();
    const orchResponse = new OrchestraApiResponse(ResponseCode.INTERNAL_ERROR, {});

    // Query path -> retrieval stage
    expect(
      wrapErrorResponse({
        ctx,
        orchResponse,
        path: '/api/v1/query',
      }).error.stage,
    ).toBe('retrieval');

    // Ingest path -> extraction stage
    expect(
      wrapErrorResponse({
        ctx,
        orchResponse,
        path: '/api/v1/ingest/file',
      }).error.stage,
    ).toBe('extraction');

    // Auth path -> authentication stage
    expect(
      wrapErrorResponse({
        ctx,
        orchResponse,
        path: '/api/v1/auth/login',
      }).error.stage,
    ).toBe('authentication');
  });

  it('should include legacy fields', () => {
    const ctx = createMockContext();
    const orchResponse = new OrchestraApiResponse(ResponseCode.INTERNAL_ERROR, {
      details: 'error',
    });

    const result = wrapErrorResponse({
      ctx,
      orchResponse,
    });

    expect(result._legacy).toBeDefined();
    expect(result._legacy.tracking_id).toBe('test-context-id');
  });

  it('should use error message when provided', () => {
    const ctx = createMockContext();
    const orchResponse = new OrchestraApiResponse(ResponseCode.INTERNAL_ERROR, {});
    const error = new Error('Custom error message');

    const result = wrapErrorResponse({
      ctx,
      orchResponse,
      error,
    });

    // Should prefer Orchestra message if available, otherwise use error.message
    expect(result.error.message).toContain('error');
  });
});

// ============================================================================
// buildResponsePayload Tests
// ============================================================================

describe('buildResponsePayload', () => {
  it('should include legacy fields when requested', () => {
    const response = {
      id: 'qry_abc123def456',
      object: 'query.result' as const,
      created: 1704067200,
      success: true as const,
      data: { answer: 'Test' },
      tenant_id: 'demo',
      _legacy: {
        tracking_id: 'ctx-123',
        app: { name: 'test' },
      },
    };

    const payload = buildResponsePayload(response, true);

    expect(payload.tracking_id).toBe('ctx-123');
    expect(payload.app).toEqual({ name: 'test' });
    expect(payload._legacy).toBeUndefined(); // _legacy field should be spread, not included
  });

  it('should exclude legacy fields when not requested', () => {
    const response = {
      id: 'qry_abc123def456',
      object: 'query.result' as const,
      created: 1704067200,
      success: true as const,
      data: { answer: 'Test' },
      tenant_id: 'demo',
      _legacy: {
        tracking_id: 'ctx-123',
      },
    };

    const payload = buildResponsePayload(response, false);

    expect(payload.tracking_id).toBeUndefined();
    expect(payload._legacy).toBeUndefined();
  });

  it('should preserve main GertsResponse fields', () => {
    const response = {
      id: 'qry_abc123def456',
      object: 'query.result' as const,
      created: 1704067200,
      success: true as const,
      data: { answer: 'Test' },
      tenant_id: 'demo',
    };

    const payload = buildResponsePayload(response, false);

    expect(payload.id).toBe('qry_abc123def456');
    expect(payload.object).toBe('query.result');
    expect(payload.created).toBe(1704067200);
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual({ answer: 'Test' });
    expect(payload.tenant_id).toBe('demo');
  });
});
