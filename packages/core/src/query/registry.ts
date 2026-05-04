/**
 * @gerts/core - Query Type Registry
 *
 * Type-safe registry mapping query types to their request/result types.
 * Provides compile-time type safety for query → result mapping.
 *
 * @see RFC-032: Universal Query System
 */

import type { TenantId } from '../ids.js';
import type { QueryRequest, QueryResult } from './types.js';

// ============================================================================
// Concrete Query Types
// ============================================================================

/**
 * Natural Language Query - NL → Cypher
 *
 * @example
 * ```typescript
 * const query: NLQuery = {
 *   type: 'nl',
 *   tenantId: 'demo' as TenantId,
 *   question: 'Who works at NeuraTech?',
 *   maxResults: 10,
 * };
 * ```
 */
export interface NLQuery extends QueryRequest<'nl'> {
  /** Natural language question */
  readonly question: string;
  /** Maximum results to return */
  readonly maxResults?: number;
  /** Include Cypher explanation in response */
  readonly includeExplanation?: boolean;
}

/**
 * NL Query result data
 */
export interface NLQueryData {
  /** Natural language answer */
  readonly answer: string;
  /** Generated Cypher query */
  readonly cypher: string;
  /** Raw query results */
  readonly rows: readonly unknown[];
}

/**
 * NL Query metadata
 */
export interface NLQueryMeta {
  /** How schema was obtained */
  readonly schemaSource: 'cache' | 'vector' | 'inferred';
  /** Answer confidence (0-1) */
  readonly confidence: number;
  /** Query complexity score (1-5) */
  readonly queryComplexity?: number;
  /** Whether query was repaired during execution */
  readonly wasRepaired?: boolean;
  /** Number of execution attempts */
  readonly attemptCount?: number;
  /** Warnings from execution */
  readonly warnings?: readonly string[];
}

// ============================================================================
// Graph Traversal Query
// ============================================================================

/**
 * Graph traversal direction
 */
export type TraversalDirection = 'in' | 'out' | 'both';

/**
 * Graph Traversal Query
 *
 * @example
 * ```typescript
 * const query: GraphQuery = {
 *   type: 'graph',
 *   tenantId: 'demo' as TenantId,
 *   startEntityId: 'entity-123',
 *   maxDepth: 2,
 *   relationshipTypes: ['WORKS_FOR', 'KNOWS'],
 * };
 * ```
 */
export interface GraphQuery extends QueryRequest<'graph'> {
  /** Starting entity ID */
  readonly startEntityId: string;
  /** Maximum traversal depth */
  readonly maxDepth: number;
  /** Filter by relationship types */
  readonly relationshipTypes?: readonly string[];
  /** Traversal direction */
  readonly direction?: TraversalDirection;
}

/**
 * Graph entity in query result.
 * Named QueryGraphEntity to avoid conflict with @gerts/core/graph GraphEntity.
 */
export interface QueryGraphEntity {
  /** Unique ID */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Entity type (e.g., 'Person', 'Organization') */
  readonly type: string;
  /** Description */
  readonly description?: string;
  /** Additional properties */
  readonly properties?: Record<string, unknown>;
  /** Community assignment */
  readonly communityId?: string;
}

/**
 * Graph relationship in result
 */
export interface GraphRelationship {
  /** Unique ID */
  readonly id: string;
  /** Source entity ID */
  readonly sourceId: string;
  /** Target entity ID */
  readonly targetId: string;
  /** Relationship type */
  readonly type: string;
  /** Weight/strength (0-1) */
  readonly weight?: number;
  /** Additional properties */
  readonly properties?: Record<string, unknown>;
}

/**
 * Graph Query result data
 */
export interface GraphQueryData {
  /** Entities found */
  readonly entities: readonly QueryGraphEntity[];
  /** Relationships found */
  readonly relationships: readonly GraphRelationship[];
}

/**
 * Graph Query metadata
 */
export interface GraphQueryMeta {
  /** Actual traversal depth reached */
  readonly traversalDepth: number;
  /** Number of nodes visited */
  readonly nodesVisited: number;
}

// ============================================================================
// Vector Search Query
// ============================================================================

/**
 * Vector filter operators
 */
export type VectorFilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'nin'
  | 'contains';

/**
 * Vector filter condition
 */
export interface VectorFilterCondition {
  /** Field to filter on */
  readonly field: string;
  /** Filter operator */
  readonly operator: VectorFilterOperator;
  /** Filter value */
  readonly value: unknown;
}

/**
 * Vector filter with boolean logic
 */
export interface VectorFilter {
  /** All conditions must match */
  readonly must?: readonly VectorFilterCondition[];
  /** At least one condition must match */
  readonly should?: readonly VectorFilterCondition[];
  /** No conditions should match */
  readonly mustNot?: readonly VectorFilterCondition[];
}

/**
 * Vector Search Query
 *
 * @example
 * ```typescript
 * const query: VectorQuery = {
 *   type: 'vector',
 *   tenantId: 'demo' as TenantId,
 *   query: 'AI company working on natural language',
 *   topK: 10,
 *   filter: {
 *     must: [{ field: 'type', operator: 'eq', value: 'Organization' }],
 *   },
 * };
 * ```
 */
export interface VectorQuery extends QueryRequest<'vector'> {
  /** Search query (text or embedding) */
  readonly query: string | readonly number[];
  /** Number of results */
  readonly topK: number;
  /** Metadata filters */
  readonly filter?: VectorFilter;
  /** Collection to search */
  readonly collection?: string;
  /** Include vectors in response */
  readonly includeVectors?: boolean;
}

/**
 * Vector match in result
 */
export interface VectorMatch {
  /** Document/chunk ID */
  readonly id: string;
  /** Similarity score (0-1) */
  readonly score: number;
  /** Text content */
  readonly content: string;
  /** Metadata */
  readonly metadata?: Record<string, unknown>;
  /** Vector (if requested) */
  readonly vector?: readonly number[];
}

/**
 * Vector Query result data
 */
export interface VectorQueryData {
  /** Matching documents/chunks */
  readonly matches: readonly VectorMatch[];
}

/**
 * Vector Query metadata
 */
export interface VectorQueryMeta {
  /** Embedding model used */
  readonly embeddingModel: string;
  /** Search time in ms */
  readonly searchTimeMs: number;
  /** Collection searched */
  readonly collection: string;
}

// ============================================================================
// RAG Query (GraphRAG)
// ============================================================================

/**
 * RAG search mode
 */
export type RAGMode = 'local' | 'global' | 'hybrid' | 'auto';

/**
 * RAG Query (GraphRAG local/global/hybrid)
 *
 * @example
 * ```typescript
 * const query: RAGQuery = {
 *   type: 'rag',
 *   tenantId: 'demo' as TenantId,
 *   question: 'What are the main themes in the documents?',
 *   mode: 'global',
 * };
 * ```
 */
export interface RAGQuery extends QueryRequest<'rag'> {
  /** Natural language question */
  readonly question: string;
  /** Search mode */
  readonly mode: RAGMode;
  /** Number of results to consider */
  readonly topK?: number;
  /** Include chunk content in sources */
  readonly includeChunks?: boolean;
  /** Conversation ID for context */
  readonly conversationId?: string;
}

/**
 * RAG Query result data
 */
export interface RAGQueryData {
  /** Generated answer */
  readonly answer: string;
  /** Context used for generation */
  readonly context: string;
}

/**
 * RAG Query metadata
 */
export interface RAGQueryMeta {
  /** Actual mode used */
  readonly mode: RAGMode;
  /** Total processing time */
  readonly processingTime: number;
  /** Whether quality was degraded */
  readonly degradedQuality?: boolean;
  /** Reason for fallback (if any) */
  readonly fallbackReason?: string;
  /** Number of communities searched (global mode) */
  readonly communitiesSearched?: number;
  /** Number of entities found (local mode) */
  readonly entitiesFound?: number;
}

// ============================================================================
// Query Type Registry
// ============================================================================

/**
 * Query type registry - maps query type string to request/result types.
 *
 * Provides compile-time type safety for query → result mapping.
 *
 * @example
 * ```typescript
 * // Get query type
 * type MyQuery = QueryTypeRegistry['nl']['query'];  // NLQuery
 *
 * // Get result type
 * type MyResult = QueryTypeRegistry['nl']['result'];  // QueryResult<NLQueryData, NLQueryMeta>
 *
 * // Type-safe execution
 * async function execute<T extends QueryType>(
 *   query: QueryTypeRegistry[T]['query']
 * ): Promise<QueryTypeRegistry[T]['result']> {
 *   // Implementation
 * }
 * ```
 */
export interface QueryTypeRegistry {
  /**
   * Natural Language Query
   */
  nl: {
    query: NLQuery;
    data: NLQueryData;
    meta: NLQueryMeta;
    result: QueryResult<NLQueryData, NLQueryMeta>;
  };

  /**
   * Graph Traversal Query
   */
  graph: {
    query: GraphQuery;
    data: GraphQueryData;
    meta: GraphQueryMeta;
    result: QueryResult<GraphQueryData, GraphQueryMeta>;
  };

  /**
   * Vector Search Query
   */
  vector: {
    query: VectorQuery;
    data: VectorQueryData;
    meta: VectorQueryMeta;
    result: QueryResult<VectorQueryData, VectorQueryMeta>;
  };

  /**
   * RAG Query (GraphRAG)
   */
  rag: {
    query: RAGQuery;
    data: RAGQueryData;
    meta: RAGQueryMeta;
    result: QueryResult<RAGQueryData, RAGQueryMeta>;
  };
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * All registered query types
 */
export type QueryType = keyof QueryTypeRegistry;

/**
 * Query request for a specific type
 */
export type QueryFor<T extends QueryType> = QueryTypeRegistry[T]['query'];

/**
 * Query data for a specific type
 */
export type DataFor<T extends QueryType> = QueryTypeRegistry[T]['data'];

/**
 * Query metadata for a specific type
 */
export type MetaFor<T extends QueryType> = QueryTypeRegistry[T]['meta'];

/**
 * Query result for a specific type
 */
export type ResultFor<T extends QueryType> = QueryTypeRegistry[T]['result'];

/**
 * Type-safe query execution function type
 */
export type ExecuteQuery<T extends QueryType> = (
  query: QueryFor<T>
) => Promise<ResultFor<T>>;

/**
 * Union of all query types
 */
export type AnyQuery =
  | NLQuery
  | GraphQuery
  | VectorQuery
  | RAGQuery;

/**
 * Union of all query data types
 */
export type AnyQueryData =
  | NLQueryData
  | GraphQueryData
  | VectorQueryData
  | RAGQueryData;

/**
 * Union of all query metadata types
 */
export type AnyQueryMeta =
  | NLQueryMeta
  | GraphQueryMeta
  | VectorQueryMeta
  | RAGQueryMeta;

// ============================================================================
// Type Guards for Query Types
// ============================================================================

/**
 * Type guard for NL query
 */
export function isNLQuery(query: QueryRequest): query is NLQuery {
  return query.type === 'nl';
}

/**
 * Type guard for Graph query
 */
export function isGraphQuery(query: QueryRequest): query is GraphQuery {
  return query.type === 'graph';
}

/**
 * Type guard for Vector query
 */
export function isVectorQuery(query: QueryRequest): query is VectorQuery {
  return query.type === 'vector';
}

/**
 * Type guard for RAG query
 */
export function isRAGQuery(query: QueryRequest): query is RAGQuery {
  return query.type === 'rag';
}

/**
 * Type guard for known query type
 */
export function isKnownQueryType(type: string): type is QueryType {
  return ['nl', 'graph', 'vector', 'rag'].includes(type);
}

// ============================================================================
// Query Factories
// ============================================================================

/**
 * Create an NL query
 */
export function createNLQuery(
  tenantId: TenantId,
  question: string,
  options?: Partial<Omit<NLQuery, 'type' | 'tenantId' | 'question'>>
): NLQuery {
  return {
    type: 'nl',
    tenantId,
    question,
    ...options,
  };
}

/**
 * Create a Graph query
 */
export function createGraphQuery(
  tenantId: TenantId,
  startEntityId: string,
  maxDepth: number,
  options?: Partial<Omit<GraphQuery, 'type' | 'tenantId' | 'startEntityId' | 'maxDepth'>>
): GraphQuery {
  return {
    type: 'graph',
    tenantId,
    startEntityId,
    maxDepth,
    ...options,
  };
}

/**
 * Create a Vector query
 */
export function createVectorQuery(
  tenantId: TenantId,
  query: string | readonly number[],
  topK: number,
  options?: Partial<Omit<VectorQuery, 'type' | 'tenantId' | 'query' | 'topK'>>
): VectorQuery {
  return {
    type: 'vector',
    tenantId,
    query,
    topK,
    ...options,
  };
}

/**
 * Create a RAG query
 */
export function createRAGQuery(
  tenantId: TenantId,
  question: string,
  mode: RAGMode = 'auto',
  options?: Partial<Omit<RAGQuery, 'type' | 'tenantId' | 'question' | 'mode'>>
): RAGQuery {
  return {
    type: 'rag',
    tenantId,
    question,
    mode,
    ...options,
  };
}
