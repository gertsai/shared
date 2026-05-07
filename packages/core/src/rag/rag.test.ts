/**
 * @fileoverview RAG API Standard Tests (RFC-036)
 *
 * Comprehensive tests for RAG types, schemas, and helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  // Response
  createResponseId,
  createSourceId,
  createCitationId,
  type Source,
  type TokenUsage,
  type RAGResponseCore,

  // Capabilities
  type Citation,
  type Entity,
  type Relationship,
  type RAGResponse,
  hasGrounding,
  hasObservability,
  hasGraph,

  // Request
  type RAGRequest,
  createRAGRequest,
  hasCapability,

  // Streaming
  encodeSSE,
  encodeSSEWithId,
  decodeSSE,
  isTextDelta,
  isRetrievalEvent,
  isGroundingEvent,
  isGraphEvent,
  isErrorEvent,
  createStartEvent,
  createFinishEvent,
  createTextDelta,
  createHeartbeat,
  type RAGStreamEvent,

  // Errors
  RAGErrors,
  ERROR_STATUS_CODES,
  isRetryable,
  getStatusCode,
  isSuccess,
  isFailure,
  isPartialSuccess,
  type RAGResult,

  // Schemas
  RAGRequestSchema,
  safeValidateRAGRequest,
  formatValidationErrors,
  SourceSchema,
  RAGErrorSchema,
} from './index';

// ============================================
// Branded IDs
// ============================================

describe('Branded IDs', () => {
  describe('createResponseId', () => {
    it('should create unique response IDs', () => {
      const id1 = createResponseId();
      const id2 = createResponseId();
      expect(id1).not.toBe(id2);
    });

    it('should create IDs with rag_ prefix', () => {
      const id = createResponseId();
      expect(id).toMatch(/^rag_[0-9a-f-]{36}$/);
    });
  });

  describe('createSourceId', () => {
    it('should create unique source IDs', () => {
      const id1 = createSourceId();
      const id2 = createSourceId();
      expect(id1).not.toBe(id2);
    });

    it('should create IDs with src_ prefix', () => {
      const id = createSourceId();
      expect(id).toMatch(/^src_[0-9a-f-]{36}$/);
    });
  });

  describe('createCitationId', () => {
    it('should create unique citation IDs', () => {
      const id1 = createCitationId();
      const id2 = createCitationId();
      expect(id1).not.toBe(id2);
    });

    it('should create IDs with cit_ prefix', () => {
      const id = createCitationId();
      expect(id).toMatch(/^cit_[0-9a-f-]{36}$/);
    });
  });
});

// ============================================
// Source Types
// ============================================

describe('Source', () => {
  it('should allow minimal source', () => {
    const source: Source = {
      id: createSourceId(),
      text: 'Sample text',
      score: 0.95,
      documentId: 'doc_123',
      chunkIndex: 0,
    };
    expect(source.score).toBe(0.95);
  });

  it('should allow full source with all optional fields', () => {
    const source: Source = {
      id: createSourceId(),
      text: 'Sample text',
      score: 0.95,
      documentId: 'doc_123',
      chunkIndex: 0,
      url: 'https://example.com/doc',
      title: 'Example Document',
      pageNumber: 5,
      vectorScore: 0.92,
      keywordScore: 0.88,
      rerankScore: 0.96,
      entityMentions: ['Alice', 'NeuraTech'],
      indexedAt: '2025-01-03T12:00:00Z',
      metadata: { category: 'technical' },
    };
    expect(source.entityMentions).toContain('Alice');
  });
});

// ============================================
// Token Usage
// ============================================

describe('TokenUsage', () => {
  it('should allow basic usage', () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    };
    expect(usage.totalTokens).toBe(150);
  });

  it('should allow extended usage', () => {
    const usage: TokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      retrievalTokens: 80,
      graphTokens: 20,
      cachedTokens: 30,
    };
    expect(usage.retrievalTokens).toBe(80);
  });
});

// ============================================
// RAG Response
// ============================================

describe('RAGResponse', () => {
  const coreResponse: RAGResponseCore = {
    id: createResponseId(),
    object: 'rag.response',
    answer: 'Test answer',
    sources: [],
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    createdAt: new Date().toISOString(),
    tenantId: 'demo',
  };

  describe('without capabilities', () => {
    it('should allow basic response', () => {
      const response: RAGResponse<{}> = coreResponse;
      expect(response.answer).toBe('Test answer');
    });
  });

  describe('with grounding capability', () => {
    it('should require grounding field', () => {
      const response: RAGResponse<{ grounding: true }> = {
        ...coreResponse,
        grounding: {
          citations: [],
          groundingScore: 0.95,
          mode: 'accurate',
        },
      };
      expect(response.grounding.groundingScore).toBe(0.95);
    });

    it('should support citations', () => {
      const citation: Citation = {
        id: createCitationId(),
        sourceId: createSourceId(),
        startChar: 0,
        endChar: 10,
        text: 'Test text',
        claim: 'A claim',
        confidence: 0.9,
      };

      const response: RAGResponse<{ grounding: true }> = {
        ...coreResponse,
        grounding: {
          citations: [citation],
          groundingScore: 0.95,
          mode: 'accurate',
        },
      };
      expect(response.grounding.citations).toHaveLength(1);
    });
  });

  describe('with observability capability', () => {
    it('should require observability field', () => {
      const response: RAGResponse<{ observability: true }> = {
        ...coreResponse,
        observability: {
          retrieval: {
            strategy: 'hybrid',
            candidateCount: 100,
            usedCount: 10,
            rerankingApplied: true,
            latencyMs: 234,
          },
          generation: {
            model: 'gpt-4o',
            temperature: 0.1,
            maxTokens: 500,
            stopReason: 'end_turn',
            latencyMs: 890,
          },
          traceId: 'tr_123',
          spanId: 'sp_456',
          latency: {
            totalMs: 1456,
            retrievalMs: 234,
            generationMs: 890,
          },
        },
      };
      expect(response.observability.traceId).toBe('tr_123');
    });
  });

  describe('with graph capability', () => {
    it('should require graph field', () => {
      const response: RAGResponse<{ graph: true }> = {
        ...coreResponse,
        graph: {
          mode: 'local',
          entities: [],
          relationships: [],
        },
      };
      expect(response.graph.mode).toBe('local');
    });

    it('should support entities and relationships', () => {
      const entity: Entity = {
        id: 'e1',
        name: 'Alice',
        type: 'Person',
        description: 'Software engineer',
      };

      const relationship: Relationship = {
        id: 'r1',
        source: 'e1',
        target: 'e2',
        type: 'works_at',
      };

      const response: RAGResponse<{ graph: true }> = {
        ...coreResponse,
        graph: {
          mode: 'local',
          entities: [entity],
          relationships: [relationship],
          subgraph: {
            nodes: [{ id: 'e1', name: 'Alice', type: 'Person' }],
            edges: [{ source: 'e1', target: 'e2', label: 'works_at' }],
          },
        },
      };
      expect(response.graph.entities).toHaveLength(1);
    });
  });

  describe('with all capabilities', () => {
    it('should include all capability fields', () => {
      const response: RAGResponse<{
        grounding: true;
        observability: true;
        graph: true;
      }> = {
        ...coreResponse,
        grounding: {
          citations: [],
          groundingScore: 0.95,
          mode: 'accurate',
        },
        observability: {
          retrieval: {
            strategy: 'hybrid',
            candidateCount: 100,
            usedCount: 10,
            rerankingApplied: true,
            latencyMs: 234,
          },
          generation: {
            model: 'gpt-4o',
            temperature: 0.1,
            maxTokens: 500,
            stopReason: 'end_turn',
            latencyMs: 890,
          },
          traceId: 'tr_123',
          spanId: 'sp_456',
          latency: {
            totalMs: 1456,
            retrievalMs: 234,
            generationMs: 890,
          },
        },
        graph: {
          mode: 'hybrid',
          entities: [],
          relationships: [],
        },
      };

      expect(response.grounding.groundingScore).toBe(0.95);
      expect(response.observability.traceId).toBe('tr_123');
      expect(response.graph.mode).toBe('hybrid');
    });
  });

  describe('type guards', () => {
    it('hasGrounding should work', () => {
      const response = {
        ...coreResponse,
        grounding: { citations: [], groundingScore: 0.9, mode: 'fast' as const },
      };
      expect(hasGrounding(response)).toBe(true);
      expect(hasGrounding(coreResponse)).toBe(false);
    });

    it('hasObservability should work', () => {
      const response = {
        ...coreResponse,
        observability: {
          retrieval: {} as any,
          generation: {} as any,
          traceId: 'tr',
          spanId: 'sp',
          latency: {} as any,
        },
      };
      expect(hasObservability(response)).toBe(true);
      expect(hasObservability(coreResponse)).toBe(false);
    });

    it('hasGraph should work', () => {
      const response = {
        ...coreResponse,
        graph: { mode: 'local' as const, entities: [], relationships: [] },
      };
      expect(hasGraph(response)).toBe(true);
      expect(hasGraph(coreResponse)).toBe(false);
    });
  });
});

// ============================================
// RAG Request
// ============================================

describe('RAGRequest', () => {
  describe('createRAGRequest', () => {
    it('should create minimal request', () => {
      const request = createRAGRequest('What is GraphRAG?', 'demo');
      expect(request.question).toBe('What is GraphRAG?');
      expect(request.tenantId).toBe('demo');
    });
  });

  describe('hasCapability', () => {
    it('should return true when capability is present', () => {
      const request: RAGRequest = {
        question: 'Test',
        tenantId: 'demo',
        capabilities: ['grounding', 'graph'],
      };
      expect(hasCapability(request, 'grounding')).toBe(true);
      expect(hasCapability(request, 'graph')).toBe(true);
      expect(hasCapability(request, 'observability')).toBe(false);
    });

    it('should return false when no capabilities', () => {
      const request = createRAGRequest('Test', 'demo');
      expect(hasCapability(request, 'grounding')).toBe(false);
    });
  });

  describe('full request', () => {
    it('should allow all configuration options', () => {
      const request: RAGRequest<{ grounding: true; graph: true }> = {
        question: 'Who founded NeuraTech?',
        tenantId: 'demo',
        capabilities: ['grounding', 'graph'],
        retrieval: {
          strategy: 'hybrid',
          topK: 10,
          minScore: 0.7,
          rerank: true,
        },
        generation: {
          model: 'gpt-4o',
          maxTokens: 500,
          temperature: 0.1,
        },
        grounding: {
          mode: 'accurate',
          minConfidence: 0.8,
        },
        graph: {
          mode: 'local',
          maxHops: 2,
          includeSubgraph: true,
        },
        stream: true,
        traceId: 'custom-trace-id',
      };

      expect(request.retrieval?.strategy).toBe('hybrid');
      expect(request.graph?.maxHops).toBe(2);
    });
  });
});

// ============================================
// Streaming
// ============================================

describe('Streaming', () => {
  describe('encodeSSE', () => {
    it('should encode text-delta event', () => {
      const event = createTextDelta('Hello');
      const sse = encodeSSE(event);
      expect(sse).toBe('event: text-delta\ndata: {"type":"text-delta","textDelta":"Hello"}\n\n');
    });

    it('should encode start event', () => {
      const event = createStartEvent('rag_123');
      const sse = encodeSSE(event);
      expect(sse).toContain('event: start');
      expect(sse).toContain('"id":"rag_123"');
    });

    it('should encode finish event', () => {
      const event = createFinishEvent('complete');
      const sse = encodeSSE(event);
      expect(sse).toContain('event: finish');
      expect(sse).toContain('"finishReason":"complete"');
    });
  });

  describe('encodeSSEWithId', () => {
    it('should include id field', () => {
      const event = createTextDelta('Hello');
      const sse = encodeSSEWithId(event, '123');
      expect(sse).toContain('id: 123');
    });
  });

  describe('decodeSSE', () => {
    it('should decode event', () => {
      const event = decodeSSE<{}>('{"type":"text-delta","textDelta":"Hello"}');
      expect(event.type).toBe('text-delta');
      if (event.type === 'text-delta') {
        expect(event.textDelta).toBe('Hello');
      }
    });
  });

  describe('event type guards', () => {
    it('isTextDelta should identify text-delta events', () => {
      expect(isTextDelta({ type: 'text-delta', textDelta: 'Hi' })).toBe(true);
      expect(isTextDelta({ type: 'start', id: '1', timestamp: '' })).toBe(false);
    });

    it('isRetrievalEvent should identify retrieval events', () => {
      expect(isRetrievalEvent({ type: 'rag.retrieval.start', strategy: 'hybrid' })).toBe(true);
      expect(isRetrievalEvent({ type: 'rag.retrieval.complete', count: 5, latencyMs: 100 })).toBe(true);
      expect(isRetrievalEvent({ type: 'text-delta', textDelta: '' })).toBe(false);
    });

    it('isGroundingEvent should identify grounding events', () => {
      expect(isGroundingEvent({ type: 'rag.grounding.citation', citation: {} as any })).toBe(true);
      expect(isGroundingEvent({ type: 'text-delta', textDelta: '' })).toBe(false);
    });

    it('isGraphEvent should identify graph events', () => {
      expect(isGraphEvent({ type: 'rag.graph.entity', entity: {} as any })).toBe(true);
      expect(isGraphEvent({ type: 'rag.graph.complete', nodeCount: 10, edgeCount: 5 })).toBe(true);
      expect(isGraphEvent({ type: 'text-delta', textDelta: '' })).toBe(false);
    });

    it('isErrorEvent should identify error events', () => {
      expect(isErrorEvent({ type: 'error', error: {} as any })).toBe(true);
      expect(isErrorEvent({ type: 'warning', stage: 'retrieval', message: '', code: '' })).toBe(false);
    });
  });

  describe('createHeartbeat', () => {
    it('should create heartbeat with timestamp', () => {
      const before = Date.now();
      const hb = createHeartbeat();
      const after = Date.now();

      expect(hb.type).toBe('heartbeat');
      expect(hb.ts).toBeGreaterThanOrEqual(before);
      expect(hb.ts).toBeLessThanOrEqual(after);
    });
  });
});

// ============================================
// Errors
// ============================================

describe('Errors', () => {
  describe('RAGErrors factory', () => {
    it('validation should create 400 error', () => {
      const error = RAGErrors.validation('Invalid input', 'question');
      expect(error.status).toBe(400);
      expect(error.error.code).toBe('INVALID_REQUEST');
      expect(error.error.param).toBe('question');
      expect(error.retryable).toBe(false);
    });

    it('invalidTenant should create 400 error', () => {
      const error = RAGErrors.invalidTenant('bad-tenant');
      expect(error.status).toBe(400);
      expect(error.error.code).toBe('INVALID_TENANT');
    });

    it('tenantNotFound should create 404 error', () => {
      const error = RAGErrors.tenantNotFound('missing');
      expect(error.status).toBe(404);
      expect(error.error.code).toBe('TENANT_NOT_FOUND');
    });

    it('noSources should create 200 response', () => {
      const error = RAGErrors.noSources();
      expect(error.status).toBe(200);
      expect(error.error.code).toBe('NO_SOURCES_FOUND');
    });

    it('retrievalTimeout should create 504 error', () => {
      const error = RAGErrors.retrievalTimeout(5000);
      expect(error.status).toBe(504);
      expect(error.error.code).toBe('RETRIEVAL_TIMEOUT');
      expect(error.retryable).toBe(true);
      expect(error.retryAfterMs).toBe(1000);
    });

    it('rateLimited should create 429 error', () => {
      const error = RAGErrors.rateLimited(60000);
      expect(error.status).toBe(429);
      expect(error.error.code).toBe('RATE_LIMITED');
      expect(error.retryable).toBe(true);
      expect(error.retryAfterMs).toBe(60000);
    });

    it('internal should create 500 error from Error', () => {
      const error = RAGErrors.internal(new Error('DB connection failed'));
      expect(error.status).toBe(500);
      expect(error.error.code).toBe('INTERNAL_ERROR');
      expect(error.detail).toBe('DB connection failed');
    });

    it('internal should create 500 error from string', () => {
      const error = RAGErrors.internal('Something went wrong');
      expect(error.status).toBe(500);
      expect(error.detail).toBe('Something went wrong');
    });

    it('serviceUnavailable should create 503 error', () => {
      const error = RAGErrors.serviceUnavailable(30000);
      expect(error.status).toBe(503);
      expect(error.retryable).toBe(true);
      expect(error.retryAfterMs).toBe(30000);
    });
  });

  describe('ERROR_STATUS_CODES', () => {
    it('should have correct status for validation errors', () => {
      expect(ERROR_STATUS_CODES.INVALID_REQUEST).toBe(400);
      expect(ERROR_STATUS_CODES.INVALID_TENANT).toBe(400);
    });

    it('should have correct status for auth errors', () => {
      expect(ERROR_STATUS_CODES.AUTHENTICATION_REQUIRED).toBe(401);
      expect(ERROR_STATUS_CODES.PERMISSION_DENIED).toBe(403);
    });

    it('should have correct status for not found', () => {
      expect(ERROR_STATUS_CODES.TENANT_NOT_FOUND).toBe(404);
    });

    it('should have correct status for rate limiting', () => {
      expect(ERROR_STATUS_CODES.RATE_LIMITED).toBe(429);
    });

    it('should have correct status for timeouts', () => {
      expect(ERROR_STATUS_CODES.RETRIEVAL_TIMEOUT).toBe(504);
      expect(ERROR_STATUS_CODES.GENERATION_TIMEOUT).toBe(504);
    });
  });

  describe('isRetryable', () => {
    it('should return true for retryable errors', () => {
      expect(isRetryable(RAGErrors.retrievalTimeout(5000))).toBe(true);
      expect(isRetryable(RAGErrors.rateLimited(60000))).toBe(true);
      expect(isRetryable(RAGErrors.serviceUnavailable())).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      expect(isRetryable(RAGErrors.validation('Invalid'))).toBe(false);
      expect(isRetryable(RAGErrors.internal(new Error()))).toBe(false);
    });
  });

  describe('getStatusCode', () => {
    it('should return correct status codes', () => {
      expect(getStatusCode('INVALID_REQUEST')).toBe(400);
      expect(getStatusCode('RATE_LIMITED')).toBe(429);
      expect(getStatusCode('INTERNAL_ERROR')).toBe(500);
    });
  });

  describe('RAGResult', () => {
    const successResult: RAGResult<{}> = {
      success: true,
      data: {
        id: createResponseId(),
        object: 'rag.response',
        answer: 'Test',
        sources: [],
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        createdAt: new Date().toISOString(),
        tenantId: 'demo',
      },
    };

    const failureResult: RAGResult<{}> = {
      success: false,
      error: RAGErrors.validation('Invalid'),
    };

    const partialResult: RAGResult<{ grounding: true }> = {
      success: 'partial',
      data: {
        response: {
          id: createResponseId(),
          object: 'rag.response',
          answer: 'Partial',
          sources: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          createdAt: new Date().toISOString(),
          tenantId: 'demo',
        },
        completedCapabilities: [],
        failedCapabilities: [
          { capability: 'grounding', error: RAGErrors.internal('Grounding failed') },
        ],
      },
    };

    it('isSuccess should identify success', () => {
      expect(isSuccess(successResult)).toBe(true);
      expect(isSuccess(failureResult)).toBe(false);
      expect(isSuccess(partialResult)).toBe(false);
    });

    it('isFailure should identify failure', () => {
      expect(isFailure(successResult)).toBe(false);
      expect(isFailure(failureResult)).toBe(true);
      expect(isFailure(partialResult)).toBe(false);
    });

    it('isPartialSuccess should identify partial', () => {
      expect(isPartialSuccess(successResult)).toBe(false);
      expect(isPartialSuccess(failureResult)).toBe(false);
      expect(isPartialSuccess(partialResult)).toBe(true);
    });
  });
});

// ============================================
// Schemas
// ============================================

describe('Schemas', () => {
  describe('RAGRequestSchema', () => {
    it('should validate minimal request', () => {
      const result = safeValidateRAGRequest({
        question: 'What is GraphRAG?',
        tenantId: 'demo',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty question', () => {
      const result = safeValidateRAGRequest({
        question: '',
        tenantId: 'demo',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing tenantId', () => {
      const result = safeValidateRAGRequest({
        question: 'Test',
      });
      expect(result.success).toBe(false);
    });

    it('should validate capabilities', () => {
      const result = safeValidateRAGRequest({
        question: 'Test',
        tenantId: 'demo',
        capabilities: ['grounding', 'graph'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid capabilities', () => {
      const result = safeValidateRAGRequest({
        question: 'Test',
        tenantId: 'demo',
        capabilities: ['invalid'],
      });
      expect(result.success).toBe(false);
    });

    it('should validate retrieval config', () => {
      const result = safeValidateRAGRequest({
        question: 'Test',
        tenantId: 'demo',
        retrieval: {
          strategy: 'hybrid',
          topK: 10,
          minScore: 0.7,
          rerank: true,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid topK', () => {
      const result = safeValidateRAGRequest({
        question: 'Test',
        tenantId: 'demo',
        retrieval: { topK: 200 }, // Max is 100
      });
      expect(result.success).toBe(false);
    });

    it('should validate generation config', () => {
      const result = safeValidateRAGRequest({
        question: 'Test',
        tenantId: 'demo',
        generation: {
          model: 'gpt-4o',
          maxTokens: 500,
          temperature: 0.1,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid temperature', () => {
      const result = safeValidateRAGRequest({
        question: 'Test',
        tenantId: 'demo',
        generation: { temperature: 3 }, // Max is 2
      });
      expect(result.success).toBe(false);
    });

    it('should validate graph config', () => {
      const result = safeValidateRAGRequest({
        question: 'Test',
        tenantId: 'demo',
        graph: {
          mode: 'local',
          maxHops: 2,
          includeCommunities: true,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid maxHops', () => {
      const result = safeValidateRAGRequest({
        question: 'Test',
        tenantId: 'demo',
        graph: { maxHops: 10 }, // Max is 5
      });
      expect(result.success).toBe(false);
    });

    it('should allow extensions (passthrough)', () => {
      const result = safeValidateRAGRequest({
        question: 'Test',
        tenantId: 'demo',
        customField: 'value', // Unknown field
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as any).customField).toBe('value');
      }
    });
  });

  describe('formatValidationErrors', () => {
    it('should format errors with paths', () => {
      const result = RAGRequestSchema.safeParse({
        question: '',
        tenantId: 'demo',
      });

      if (!result.success) {
        const errors = formatValidationErrors(result.error);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].path).toBe('question');
      }
    });
  });

  describe('SourceSchema', () => {
    it('should validate minimal source', () => {
      const result = SourceSchema.safeParse({
        id: 'src_123',
        text: 'Sample',
        score: 0.95,
        documentId: 'doc_1',
        chunkIndex: 0,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid score', () => {
      const result = SourceSchema.safeParse({
        id: 'src_123',
        text: 'Sample',
        score: 1.5, // Max is 1
        documentId: 'doc_1',
        chunkIndex: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('RAGErrorSchema', () => {
    it('should validate error', () => {
      const error = RAGErrors.validation('Invalid');
      const result = RAGErrorSchema.safeParse(error);
      expect(result.success).toBe(true);
    });
  });
});

// ============================================
// Integration Scenarios
// ============================================

describe('Integration Scenarios', () => {
  describe('HTTP API Flow', () => {
    it('should validate request and create response', () => {
      // 1. Validate incoming request
      const input = {
        question: 'Who is Alice Chen?',
        tenantId: 'demo',
        capabilities: ['grounding'],
        retrieval: { topK: 5 },
      };

      const validated = safeValidateRAGRequest(input);
      expect(validated.success).toBe(true);

      // 2. Create response
      if (validated.success) {
        const response: RAGResponse<{ grounding: true }> = {
          id: createResponseId(),
          object: 'rag.response',
          answer: 'Alice Chen is a software engineer.',
          sources: [
            {
              id: createSourceId(),
              text: 'Alice Chen works at NeuraTech',
              score: 0.95,
              documentId: 'doc_1',
              chunkIndex: 0,
            },
          ],
          usage: {
            promptTokens: 100,
            completionTokens: 20,
            totalTokens: 120,
          },
          createdAt: new Date().toISOString(),
          tenantId: validated.data.tenantId,
          grounding: {
            citations: [
              {
                id: createCitationId(),
                sourceId: createSourceId(),
                startChar: 0,
                endChar: 15,
                text: 'Alice Chen is a',
                confidence: 0.92,
              },
            ],
            groundingScore: 0.92,
            mode: 'accurate',
          },
        };

        expect(response.answer).toContain('Alice Chen');
        expect(response.grounding.groundingScore).toBe(0.92);
      }
    });
  });

  describe('Streaming Flow', () => {
    it('should generate valid SSE stream', () => {
      const events: RAGStreamEvent<{ graph: true }>[] = [
        createStartEvent('rag_123'),
        { type: 'rag.retrieval.start', strategy: 'hybrid' },
        {
          type: 'rag.retrieval.source',
          source: {
            id: createSourceId(),
            text: 'Test',
            score: 0.9,
            documentId: 'd1',
            chunkIndex: 0,
          },
        },
        { type: 'rag.retrieval.complete', count: 5, latencyMs: 234 },
        { type: 'text-start', messageId: 'msg_1' },
        createTextDelta('Hello '),
        createTextDelta('World!'),
        { type: 'text-end' },
        { type: 'rag.graph.start', mode: 'local' },
        {
          type: 'rag.graph.entity',
          entity: { id: 'e1', name: 'Alice', type: 'Person' },
        },
        { type: 'rag.graph.complete', nodeCount: 5, edgeCount: 3 },
        createFinishEvent('complete'),
      ];

      const stream = events.map((e) => encodeSSE(e)).join('');
      expect(stream).toContain('event: start');
      expect(stream).toContain('event: text-delta');
      expect(stream).toContain('event: rag.graph.entity');
      expect(stream).toContain('event: finish');
    });
  });

  describe('Error Handling Flow', () => {
    it('should handle errors at different stages', () => {
      // Validation error
      const validationError = RAGErrors.validation('Question too long', 'question');
      expect(validationError.stage).toBe('validation');
      expect(validationError.status).toBe(400);

      // Retrieval error
      const retrievalError = RAGErrors.retrievalTimeout(5000);
      expect(retrievalError.stage).toBe('retrieval');
      expect(retrievalError.status).toBe(504);

      // Generation error
      const generationError = RAGErrors.rateLimited(60000);
      expect(generationError.stage).toBe('generation');
      expect(generationError.status).toBe(429);

      // Graph error
      const graphError = RAGErrors.graphConnectionFailed('Connection refused');
      expect(graphError.stage).toBe('graph');
      expect(graphError.status).toBe(502);
    });
  });
});
