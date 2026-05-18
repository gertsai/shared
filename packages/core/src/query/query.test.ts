/**
 * @gertsai/core - Query System Tests
 *
 * Comprehensive tests for RFC-032 Universal Query System Phase 1.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TenantId } from '../ids.js';

// Types
import {
  isQuerySuccess,
  isQueryFailure,
  isQueryPartial,
  isQueryError,
  querySuccess,
  queryFailure,
  queryPartial,
  QueryError,
  QUERY_ERROR_CODES,
  type QueryResult,
  type SourceReference,
} from './types.js';

// Executor
import {
  BaseQueryExecutor,
  executorSupportsType,
  getAllSupportedTypes,
  findExecutorByName,
  findExecutorsByType,
  type ExecutorMetadata,
  type IQueryExecutor,
} from './executor.js';

// Registry
import {
  isNLQuery,
  isGraphQuery,
  isVectorQuery,
  isRAGQuery,
  isKnownQueryType,
  createNLQuery,
  createGraphQuery,
  createVectorQuery,
  createRAGQuery,
  type NLQuery,
  type GraphQuery,
} from './registry.js';

// Router
import {
  TypeBasedSelector,
  PriorityBasedSelector,
  QueryRouter,
  createQueryRouter,
  createPriorityRouter,
} from './router.js';

// Test tenant ID
const tenantId = 'test-tenant' as TenantId;

// ============================================================================
// Type Guards Tests
// ============================================================================

describe('QueryResult Type Guards', () => {
  describe('isQuerySuccess', () => {
    it('should return true for success result', () => {
      const result = querySuccess('data', [], 100);
      expect(isQuerySuccess(result)).toBe(true);
    });

    it('should return false for failure result', () => {
      const result = queryFailure('ERROR', 'message');
      expect(isQuerySuccess(result)).toBe(false);
    });

    it('should return false for partial result', () => {
      const result = queryPartial('data', 0.5, [], 50);
      expect(isQuerySuccess(result)).toBe(false);
    });
  });

  describe('isQueryFailure', () => {
    it('should return true for failure result', () => {
      const result = queryFailure('ERROR', 'message');
      expect(isQueryFailure(result)).toBe(true);
    });

    it('should return false for success result', () => {
      const result = querySuccess('data', [], 100);
      expect(isQueryFailure(result)).toBe(false);
    });
  });

  describe('isQueryPartial', () => {
    it('should return true for partial result', () => {
      const result = queryPartial('data', 0.5, [], 50);
      expect(isQueryPartial(result)).toBe(true);
    });

    it('should return false for success result', () => {
      const result = querySuccess('data', [], 100);
      expect(isQueryPartial(result)).toBe(false);
    });
  });
});

// ============================================================================
// Factory Functions Tests
// ============================================================================

describe('QueryResult Factory Functions', () => {
  describe('querySuccess', () => {
    it('should create success result with data', () => {
      const result = querySuccess({ answer: 'test' }, [], 150);

      expect(result.status).toBe('success');
      expect(result.data).toEqual({ answer: 'test' });
      expect(result.sources).toEqual([]);
      expect(result.metadata.durationMs).toBe(150);
      expect(result.metadata.cached).toBe(false);
    });

    it('should include sources', () => {
      const sources: SourceReference[] = [
        { id: 'e1', type: 'entity', score: 0.95, name: 'Test' },
      ];
      const result = querySuccess('data', sources, 100);

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].id).toBe('e1');
    });

    it('should include optional metadata', () => {
      const result = querySuccess('data', [], 100, {
        cached: true,
        confidence: 0.9,
        custom: { schemaSource: 'cache' },
      });

      expect(result.metadata.cached).toBe(true);
      expect(result.metadata.confidence).toBe(0.9);
      expect(result.metadata.custom).toEqual({ schemaSource: 'cache' });
    });
  });

  describe('queryFailure', () => {
    it('should create failure result with code and message', () => {
      const result = queryFailure('VALIDATION_FAILED', 'Invalid input');

      expect(result.status).toBe('error');
      expect(result.code).toBe('VALIDATION_FAILED');
      expect(result.message).toBe('Invalid input');
      expect(result.retryable).toBe(false);
    });

    it('should mark as retryable when specified', () => {
      const result = queryFailure('TIMEOUT', 'Request timed out', {
        retryable: true,
      });

      expect(result.retryable).toBe(true);
    });

    it('should include details', () => {
      const result = queryFailure('ERROR', 'message', {
        details: { field: 'question' },
      });

      expect(result.details).toEqual({ field: 'question' });
    });
  });

  describe('queryPartial', () => {
    it('should create partial result with progress', () => {
      const result = queryPartial({ chunk: 'Processing...' }, 0.5, [], 50);

      expect(result.status).toBe('partial');
      expect(result.data).toEqual({ chunk: 'Processing...' });
      expect(result.progress).toBe(0.5);
    });

    it('should clamp progress to 0-1', () => {
      const result1 = queryPartial('data', -0.5, [], 0);
      const result2 = queryPartial('data', 1.5, [], 0);

      expect(result1.progress).toBe(0);
      expect(result2.progress).toBe(1);
    });
  });
});

// ============================================================================
// QueryError Tests
// ============================================================================

describe('QueryError', () => {
  it('should create error with code and message', () => {
    const error = new QueryError('TEST_ERROR', 'Test message');

    expect(error.name).toBe('QueryError');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Test message');
    expect(error.retryable).toBe(false);
  });

  it('should convert to QueryFailure', () => {
    const error = new QueryError('ERROR', 'message', {
      retryable: true,
      details: { key: 'value' },
    });

    const failure = error.toFailure();

    expect(failure.status).toBe('error');
    expect(failure.code).toBe('ERROR');
    expect(failure.message).toBe('message');
    expect(failure.retryable).toBe(true);
    expect(failure.details).toEqual({ key: 'value' });
  });

  it('should check error code with is()', () => {
    const error = new QueryError('VALIDATION_FAILED', 'message');

    expect(error.is('VALIDATION_FAILED')).toBe(true);
    expect(error.is('OTHER')).toBe(false);
  });

  it('should be detected by isQueryError', () => {
    const error = new QueryError('ERROR', 'message');
    const regularError = new Error('message');

    expect(isQueryError(error)).toBe(true);
    expect(isQueryError(regularError)).toBe(false);
  });
});

// ============================================================================
// Query Type Guards Tests
// ============================================================================

describe('Query Type Guards', () => {
  describe('isNLQuery', () => {
    it('should return true for NL query', () => {
      const query = createNLQuery(tenantId, 'test question');
      expect(isNLQuery(query)).toBe(true);
    });

    it('should return false for other query types', () => {
      const query = createGraphQuery(tenantId, 'entity-1', 2);
      expect(isNLQuery(query)).toBe(false);
    });
  });

  describe('isGraphQuery', () => {
    it('should return true for Graph query', () => {
      const query = createGraphQuery(tenantId, 'entity-1', 2);
      expect(isGraphQuery(query)).toBe(true);
    });
  });

  describe('isVectorQuery', () => {
    it('should return true for Vector query', () => {
      const query = createVectorQuery(tenantId, 'search text', 10);
      expect(isVectorQuery(query)).toBe(true);
    });
  });

  describe('isRAGQuery', () => {
    it('should return true for RAG query', () => {
      const query = createRAGQuery(tenantId, 'test question', 'local');
      expect(isRAGQuery(query)).toBe(true);
    });
  });

  describe('isKnownQueryType', () => {
    it('should return true for known types', () => {
      expect(isKnownQueryType('nl')).toBe(true);
      expect(isKnownQueryType('graph')).toBe(true);
      expect(isKnownQueryType('vector')).toBe(true);
      expect(isKnownQueryType('rag')).toBe(true);
    });

    it('should return false for unknown types', () => {
      expect(isKnownQueryType('unknown')).toBe(false);
    });
  });
});

// ============================================================================
// Query Factories Tests
// ============================================================================

describe('Query Factories', () => {
  describe('createNLQuery', () => {
    it('should create NL query with required fields', () => {
      const query = createNLQuery(tenantId, 'Who works here?');

      expect(query.type).toBe('nl');
      expect(query.tenantId).toBe(tenantId);
      expect(query.question).toBe('Who works here?');
    });

    it('should include optional fields', () => {
      const query = createNLQuery(tenantId, 'question', {
        maxResults: 10,
        includeExplanation: true,
      });

      expect(query.maxResults).toBe(10);
      expect(query.includeExplanation).toBe(true);
    });
  });

  describe('createGraphQuery', () => {
    it('should create Graph query with required fields', () => {
      const query = createGraphQuery(tenantId, 'entity-123', 3);

      expect(query.type).toBe('graph');
      expect(query.startEntityId).toBe('entity-123');
      expect(query.maxDepth).toBe(3);
    });

    it('should include optional fields', () => {
      const query = createGraphQuery(tenantId, 'entity-1', 2, {
        relationshipTypes: ['WORKS_FOR', 'KNOWS'],
        direction: 'out',
      });

      expect(query.relationshipTypes).toEqual(['WORKS_FOR', 'KNOWS']);
      expect(query.direction).toBe('out');
    });
  });

  describe('createVectorQuery', () => {
    it('should create Vector query with text', () => {
      const query = createVectorQuery(tenantId, 'search text', 10);

      expect(query.type).toBe('vector');
      expect(query.query).toBe('search text');
      expect(query.topK).toBe(10);
    });

    it('should create Vector query with embedding', () => {
      const embedding = [0.1, 0.2, 0.3];
      const query = createVectorQuery(tenantId, embedding, 5);

      expect(query.query).toEqual(embedding);
    });

    it('should include filter', () => {
      const query = createVectorQuery(tenantId, 'text', 10, {
        filter: {
          must: [{ field: 'type', operator: 'eq', value: 'Person' }],
        },
      });

      expect(query.filter?.must).toHaveLength(1);
    });
  });

  describe('createRAGQuery', () => {
    it('should create RAG query with default mode', () => {
      const query = createRAGQuery(tenantId, 'What are the themes?');

      expect(query.type).toBe('rag');
      expect(query.question).toBe('What are the themes?');
      expect(query.mode).toBe('auto');
    });

    it('should create RAG query with specific mode', () => {
      const query = createRAGQuery(tenantId, 'question', 'global');

      expect(query.mode).toBe('global');
    });
  });
});

// ============================================================================
// BaseQueryExecutor Tests
// ============================================================================

describe('BaseQueryExecutor', () => {
  // Test implementation
  class TestExecutor extends BaseQueryExecutor<NLQuery, string> {
    readonly metadata: ExecutorMetadata = {
      name: 'test-executor',
      description: 'Test executor',
      supportedTypes: ['nl'],
      estimatedLatency: 'fast',
    };

    async execute(query: NLQuery): Promise<QueryResult<string>> {
      return querySuccess(`Answer for: ${query.question}`, [], 100);
    }
  }

  let executor: TestExecutor;

  beforeEach(() => {
    executor = new TestExecutor();
  });

  it('should execute query', async () => {
    const query = createNLQuery(tenantId, 'test question');
    const result = await executor.execute(query);

    expect(isQuerySuccess(result)).toBe(true);
    if (isQuerySuccess(result)) {
      expect(result.data).toBe('Answer for: test question');
    }
  });

  it('should stream with default implementation', async () => {
    const query = createNLQuery(tenantId, 'test');
    const results: QueryResult<string>[] = [];

    for await (const result of executor.stream(query)) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(isQuerySuccess(results[0])).toBe(true);
  });

  it('should provide basic tool wrapper', () => {
    const tool = executor.asTool({ name: 'test_tool' });

    expect(tool).toHaveProperty('name', 'test_tool');
    expect(tool).toHaveProperty('executor', executor);
  });

  it('should check supported types', () => {
    expect(executor['supportsType']('nl')).toBe(true);
    expect(executor['supportsType']('graph')).toBe(false);
  });

  it('should validate query type', () => {
    const nlQuery = createNLQuery(tenantId, 'test');
    const graphQuery = createGraphQuery(tenantId, 'e1', 2);

    expect(executor['validateQueryType'](nlQuery)).toBeNull();
    expect(executor['validateQueryType'](graphQuery as any)).not.toBeNull();
  });
});

// ============================================================================
// Executor Helper Functions Tests
// ============================================================================

describe('Executor Helper Functions', () => {
  const mockMetadata: ExecutorMetadata[] = [
    {
      name: 'nl-executor',
      description: 'NL',
      supportedTypes: ['nl'],
      estimatedLatency: 'slow',
    },
    {
      name: 'graph-executor',
      description: 'Graph',
      supportedTypes: ['graph'],
      estimatedLatency: 'fast',
    },
    {
      name: 'multi-executor',
      description: 'Multi',
      supportedTypes: ['nl', 'rag'],
      estimatedLatency: 'medium',
    },
  ];

  const mockExecutors = mockMetadata.map(
    (metadata) =>
      ({
        metadata,
        execute: vi.fn(),
        stream: vi.fn(),
        asTool: vi.fn(),
      }) as unknown as IQueryExecutor<any, any>
  );

  describe('executorSupportsType', () => {
    it('should check if executor supports type', () => {
      expect(executorSupportsType(mockExecutors[0], 'nl')).toBe(true);
      expect(executorSupportsType(mockExecutors[0], 'graph')).toBe(false);
    });
  });

  describe('getAllSupportedTypes', () => {
    it('should get all unique supported types', () => {
      const types = getAllSupportedTypes(mockExecutors);

      expect(types).toContain('nl');
      expect(types).toContain('graph');
      expect(types).toContain('rag');
      expect(types).toHaveLength(3); // nl appears twice but only counted once
    });
  });

  describe('findExecutorByName', () => {
    it('should find executor by name', () => {
      const found = findExecutorByName(mockExecutors, 'graph-executor');
      expect(found?.metadata.name).toBe('graph-executor');
    });

    it('should return undefined if not found', () => {
      const found = findExecutorByName(mockExecutors, 'unknown');
      expect(found).toBeUndefined();
    });
  });

  describe('findExecutorsByType', () => {
    it('should find all executors supporting type', () => {
      const found = findExecutorsByType(mockExecutors, 'nl');
      expect(found).toHaveLength(2);
    });

    it('should return empty array if no match', () => {
      const found = findExecutorsByType(mockExecutors, 'vector');
      expect(found).toHaveLength(0);
    });
  });
});

// ============================================================================
// TypeBasedSelector Tests
// ============================================================================

describe('TypeBasedSelector', () => {
  const selector = new TypeBasedSelector();

  const mockMetadata: ExecutorMetadata[] = [
    {
      name: 'nl-executor',
      description: 'NL',
      supportedTypes: ['nl'],
      estimatedLatency: 'slow',
    },
    {
      name: 'fast-nl-executor',
      description: 'Fast NL',
      supportedTypes: ['nl'],
      estimatedLatency: 'fast',
    },
  ];

  it('should select executor by type', async () => {
    const query = createNLQuery(tenantId, 'test');
    const selection = await selector.select(query, mockMetadata);

    expect(selection.confidence).toBe(1.0);
    expect(selection.executorName).toBeDefined();
  });

  it('should prefer faster executor when multiple match', async () => {
    const query = createNLQuery(tenantId, 'test');
    const selection = await selector.select(query, mockMetadata);

    expect(selection.executorName).toBe('fast-nl-executor');
  });

  it('should return zero confidence if no match', async () => {
    const query = createGraphQuery(tenantId, 'e1', 2);
    const selection = await selector.select(query, mockMetadata);

    expect(selection.confidence).toBe(0);
    expect(selection.executorName).toBe('');
  });
});

// ============================================================================
// PriorityBasedSelector Tests
// ============================================================================

describe('PriorityBasedSelector', () => {
  const mockMetadata: ExecutorMetadata[] = [
    {
      name: 'executor-a',
      description: 'A',
      supportedTypes: ['nl'],
      estimatedLatency: 'slow',
    },
    {
      name: 'executor-b',
      description: 'B',
      supportedTypes: ['nl'],
      estimatedLatency: 'fast',
    },
  ];

  it('should select by priority', async () => {
    const selector = new PriorityBasedSelector()
      .setPriority('executor-a', 10)
      .setPriority('executor-b', 5);

    const query = createNLQuery(tenantId, 'test');
    const selection = await selector.select(query, mockMetadata);

    expect(selection.executorName).toBe('executor-a');
  });

  it('should use default priority 0 if not set', async () => {
    const selector = new PriorityBasedSelector().setPriority('executor-a', 5);

    const query = createNLQuery(tenantId, 'test');
    const selection = await selector.select(query, mockMetadata);

    expect(selection.executorName).toBe('executor-a');
  });
});

// ============================================================================
// QueryRouter Tests
// ============================================================================

describe('QueryRouter', () => {
  // Mock executors
  class MockNLExecutor extends BaseQueryExecutor<NLQuery, string> {
    readonly metadata: ExecutorMetadata = {
      name: 'mock-nl',
      description: 'Mock NL',
      supportedTypes: ['nl'],
      estimatedLatency: 'fast',
    };

    async execute(query: NLQuery): Promise<QueryResult<string>> {
      return querySuccess(`NL: ${query.question}`, [], 100);
    }
  }

  class MockGraphExecutor extends BaseQueryExecutor<GraphQuery, object> {
    readonly metadata: ExecutorMetadata = {
      name: 'mock-graph',
      description: 'Mock Graph',
      supportedTypes: ['graph'],
      estimatedLatency: 'fast',
    };

    async execute(query: GraphQuery): Promise<QueryResult<object>> {
      return querySuccess({ entityId: query.startEntityId }, [], 50);
    }
  }

  let router: QueryRouter;
  let nlExecutor: MockNLExecutor;
  let graphExecutor: MockGraphExecutor;

  beforeEach(() => {
    nlExecutor = new MockNLExecutor();
    graphExecutor = new MockGraphExecutor();
    router = new QueryRouter()
      .register(nlExecutor)
      .register(graphExecutor);
  });

  describe('registration', () => {
    it('should register executors', () => {
      expect(router.getExecutor('mock-nl')).toBe(nlExecutor);
      expect(router.getExecutor('mock-graph')).toBe(graphExecutor);
    });

    it('should list executors', () => {
      const list = router.listExecutors();
      expect(list).toHaveLength(2);
    });

    it('should get supported types', () => {
      const types = router.getSupportedTypes();
      expect(types).toContain('nl');
      expect(types).toContain('graph');
    });

    it('should check type support', () => {
      expect(router.supportsType('nl')).toBe(true);
      expect(router.supportsType('vector')).toBe(false);
    });

    it('should unregister executor', () => {
      router.unregister('mock-nl');
      expect(router.getExecutor('mock-nl')).toBeUndefined();
    });
  });

  describe('execute', () => {
    it('should route NL query to NL executor', async () => {
      const query = createNLQuery(tenantId, 'test question');
      const result = await router.execute(query);

      expect(isQuerySuccess(result)).toBe(true);
      if (isQuerySuccess(result)) {
        expect(result.data).toBe('NL: test question');
      }
    });

    it('should route Graph query to Graph executor', async () => {
      const query = createGraphQuery(tenantId, 'entity-1', 2);
      const result = await router.execute(query);

      expect(isQuerySuccess(result)).toBe(true);
      if (isQuerySuccess(result)) {
        expect((result.data as any).entityId).toBe('entity-1');
      }
    });

    it('should return error for unsupported type', async () => {
      const query = createVectorQuery(tenantId, 'text', 10);
      const result = await router.execute(query);

      expect(isQueryFailure(result)).toBe(true);
      if (isQueryFailure(result)) {
        expect(result.code).toBe('NO_EXECUTOR');
      }
    });

    it('should add routing metadata to success result', async () => {
      const query = createNLQuery(tenantId, 'test');
      const result = await router.execute(query);

      expect(isQuerySuccess(result)).toBe(true);
      if (isQuerySuccess(result)) {
        const custom = result.metadata.custom as any;
        expect(custom.routing).toBeDefined();
        expect(custom.routing.executor).toBe('mock-nl');
      }
    });
  });

  describe('stream', () => {
    it('should stream results', async () => {
      const query = createNLQuery(tenantId, 'test');
      const results: QueryResult<unknown>[] = [];

      for await (const result of router.stream(query)) {
        results.push(result);
      }

      expect(results).toHaveLength(1);
      expect(isQuerySuccess(results[0])).toBe(true);
    });

    it('should return error for unsupported type in stream', async () => {
      const query = createVectorQuery(tenantId, 'text', 10);
      const results: QueryResult<unknown>[] = [];

      for await (const result of router.stream(query)) {
        results.push(result);
      }

      expect(results).toHaveLength(1);
      expect(isQueryFailure(results[0])).toBe(true);
    });
  });

  describe('asTool', () => {
    it('should create unified tool', () => {
      const tool = router.asTool({ name: 'unified' });

      expect(tool).toHaveProperty('name', 'unified');
      expect(tool).toHaveProperty('router', router);
    });

    it('should include supported types in description', () => {
      const tool = router.asTool() as any;

      expect(tool.description).toContain('nl');
      expect(tool.description).toContain('graph');
    });
  });
});

// ============================================================================
// Factory Functions Tests
// ============================================================================

describe('Router Factory Functions', () => {
  class MockExecutor extends BaseQueryExecutor<NLQuery, string> {
    readonly metadata: ExecutorMetadata = {
      name: 'mock',
      description: 'Mock',
      supportedTypes: ['nl'],
      estimatedLatency: 'fast',
    };

    async execute(): Promise<QueryResult<string>> {
      return querySuccess('result', [], 100);
    }
  }

  describe('createQueryRouter', () => {
    it('should create router with executors', () => {
      const router = createQueryRouter([new MockExecutor()]);

      expect(router.getSupportedTypes()).toContain('nl');
    });

    it('should accept custom selector', () => {
      const selector = new PriorityBasedSelector();
      const router = createQueryRouter([new MockExecutor()], selector);

      expect(router).toBeInstanceOf(QueryRouter);
    });
  });

  describe('createPriorityRouter', () => {
    it('should create router with priority selector', () => {
      const executor = new MockExecutor();
      const router = createPriorityRouter([executor], { mock: 10 });

      expect(router).toBeInstanceOf(QueryRouter);
    });
  });
});

// ============================================================================
// Error Codes Tests
// ============================================================================

describe('QUERY_ERROR_CODES', () => {
  it('should have all expected error codes', () => {
    expect(QUERY_ERROR_CODES.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
    expect(QUERY_ERROR_CODES.TIMEOUT).toBe('TIMEOUT');
    expect(QUERY_ERROR_CODES.NOT_FOUND).toBe('NOT_FOUND');
    expect(QUERY_ERROR_CODES.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
    expect(QUERY_ERROR_CODES.INJECTION_DETECTED).toBe('INJECTION_DETECTED');
  });
});

// ============================================================================
// EVID-059 H-1 — QueryRouter.execute custom-metadata narrowing
// ============================================================================

describe('EVID-059 H-1 — QueryRouter custom metadata narrowing', () => {
  class CustomMetaExecutor extends BaseQueryExecutor<NLQuery, string> {
    constructor(private readonly customValue: unknown) {
      super();
    }
    readonly metadata: ExecutorMetadata = {
      name: 'custom-meta',
      description: 'Returns user-supplied custom metadata',
      supportedTypes: ['nl'],
      estimatedLatency: 'fast',
    };
    async execute(): Promise<QueryResult<string>> {
      // Use the low-level result shape so we can plant any value, including
      // ones that violate the `unknown` contract at runtime.
      return {
        status: 'success',
        data: 'ok',
        sources: [],
        metadata: {
          durationMs: 1,
          cached: false,
          custom: this.customValue,
        },
      } as unknown as QueryResult<string>;
    }
  }

  it('does NOT spread a string custom value into character indices', async () => {
    // Pre-fix: `...(result.metadata.custom as object)` turned `"hello"` into
    // `{ '0': 'h', '1': 'e', '2': 'l', '3': 'l', '4': 'o' }`.
    const router = new QueryRouter().register(new CustomMetaExecutor('hello'));
    const result = await router.execute(createNLQuery(tenantId, 'q'));

    expect(isQuerySuccess(result)).toBe(true);
    if (!isQuerySuccess(result)) return;

    const custom = result.metadata.custom as Record<string, unknown>;
    // The malformed string must not leak as numeric-indexed own keys.
    expect(Object.keys(custom)).not.toContain('0');
    expect(Object.keys(custom)).not.toContain('1');
    expect(custom['0']).toBeUndefined();
    // The routing payload still lands as expected.
    expect((custom.routing as { executor: string }).executor).toBe('custom-meta');
  });

  it('does NOT copy own `__proto__` key from caller-controlled custom into merged metadata', async () => {
    // Simulate `JSON.parse` of attacker input — V8 produces a real own
    // property named `__proto__` on the parsed object.
    const tainted = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}');
    const router = new QueryRouter().register(new CustomMetaExecutor(tainted));
    const result = await router.execute(createNLQuery(tenantId, 'q'));

    expect(isQuerySuccess(result)).toBe(true);
    if (!isQuerySuccess(result)) return;

    const custom = result.metadata.custom as Record<string, unknown>;
    // The legitimate own key survives.
    expect(custom.ok).toBe(1);
    // The forbidden key MUST NOT be carried over as an own property.
    expect(Object.prototype.hasOwnProperty.call(custom, '__proto__')).toBe(false);
    // And — critical — the prototype chain of an unrelated plain object
    // must not have been polluted by the spread.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// ============================================================================
// EVID-059 H-2 — safeExecute distinguishes programmer errors from transients
// ============================================================================

describe('EVID-059 H-2 — safeExecute error propagation', () => {
  // Helper executor that throws whatever we hand it.
  class ThrowingExecutor extends BaseQueryExecutor<NLQuery, string> {
    constructor(private readonly toThrow: unknown) {
      super();
    }
    readonly metadata: ExecutorMetadata = {
      name: 'throwing',
      description: 'Throws on execute',
      supportedTypes: ['nl'],
      estimatedLatency: 'fast',
    };
    async execute(): Promise<QueryResult<string>> {
      return this.safeExecute(async () => {
        throw this.toThrow;
      });
    }
  }

  it('marks TypeError as programmerError with cause.name preserved', async () => {
    const exec = new ThrowingExecutor(new TypeError("Cannot read property 'x' of undefined"));
    const r = await exec.execute(createNLQuery(tenantId, 'q'));

    expect(isQueryFailure(r)).toBe(true);
    if (!isQueryFailure(r)) return;
    expect(r.code).toBe('EXECUTION_FAILED');
    expect(r.retryable).toBe(false);
    expect(r.details?.programmerError).toBe(true);
    expect((r.details?.cause as { name: string }).name).toBe('TypeError');
  });

  it('marks RangeError as programmerError', async () => {
    const exec = new ThrowingExecutor(new RangeError('out of range'));
    const r = await exec.execute(createNLQuery(tenantId, 'q'));

    expect(isQueryFailure(r)).toBe(true);
    if (!isQueryFailure(r)) return;
    expect(r.details?.programmerError).toBe(true);
    expect((r.details?.cause as { name: string }).name).toBe('RangeError');
  });

  it('translates AbortError into CANCELLED (retryable=false)', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const exec = new ThrowingExecutor(abortErr);
    const r = await exec.execute(createNLQuery(tenantId, 'q'));

    expect(isQueryFailure(r)).toBe(true);
    if (!isQueryFailure(r)) return;
    expect(r.code).toBe('CANCELLED');
    expect(r.retryable).toBe(false);
    expect((r.details?.cause as { name: string }).name).toBe('AbortError');
  });

  it('translates TimeoutError into TIMEOUT (retryable=true)', async () => {
    const timeoutErr = Object.assign(new Error('took too long'), { name: 'TimeoutError' });
    const exec = new ThrowingExecutor(timeoutErr);
    const r = await exec.execute(createNLQuery(tenantId, 'q'));

    expect(isQueryFailure(r)).toBe(true);
    if (!isQueryFailure(r)) return;
    expect(r.code).toBe('TIMEOUT');
    expect(r.retryable).toBe(true);
  });

  it('leaves generic Error without programmerError flag but still records cause', async () => {
    // Simulates a transient network error — caller should be free to retry.
    const exec = new ThrowingExecutor(new Error('ECONNRESET'));
    const r = await exec.execute(createNLQuery(tenantId, 'q'));

    expect(isQueryFailure(r)).toBe(true);
    if (!isQueryFailure(r)) return;
    expect(r.code).toBe('EXECUTION_FAILED');
    expect(r.details?.programmerError).toBeUndefined();
    expect((r.details?.cause as { name: string }).name).toBe('Error');
  });

  it('handles non-Error throws by tagging cause.name as NonError', async () => {
    const exec = new ThrowingExecutor('plain string throw');
    const r = await exec.execute(createNLQuery(tenantId, 'q'));

    expect(isQueryFailure(r)).toBe(true);
    if (!isQueryFailure(r)) return;
    expect(r.code).toBe('EXECUTION_FAILED');
    expect((r.details?.cause as { name: string }).name).toBe('NonError');
  });
});
