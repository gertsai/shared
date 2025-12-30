/**
 * @gerts/core - Query System
 *
 * Universal query types for type-safe query → result mapping.
 *
 * @see RFC-032: Universal Query System
 *
 * @example
 * ```typescript
 * import {
 *   QueryRouter,
 *   createNLQuery,
 *   isQuerySuccess,
 *   type NLQuery,
 *   type QueryResult,
 * } from '@gerts/core';
 *
 * // Create typed query
 * const query = createNLQuery(tenantId, 'Who works at NeuraTech?');
 *
 * // Execute with router
 * const result = await router.execute(query);
 *
 * // Type-safe result handling
 * if (isQuerySuccess(result)) {
 *   console.log(result.data.answer);
 *   console.log(result.sources);
 * }
 * ```
 */

// Types
export type {
  QueryOptions,
  QueryRequest,
  SourceType,
  SourceReference,
  QueryMetadata,
  QuerySuccess,
  QueryFailure,
  QueryPartial,
  QueryResult,
  QueryErrorCode,
} from './types.js';

export {
  // Type guards
  isQuerySuccess,
  isQueryFailure,
  isQueryPartial,
  isQueryError,

  // Factories
  querySuccess,
  queryFailure,
  queryPartial,

  // Error codes
  QUERY_ERROR_CODES,

  // Error class
  QueryError,
} from './types.js';

// Executor
export type {
  ExecutorLatency,
  ExecutorMetadata,
  QueryToolOptions,
  IQueryExecutor,
  ExecutorFactory,
  ExecutorRegistryEntry,
} from './executor.js';

export {
  BaseQueryExecutor,
  createExecutorMetadata,
  executorSupportsType,
  getAllSupportedTypes,
  findExecutorByName,
  findExecutorsByType,
} from './executor.js';

// Registry - Query Types
export type {
  // NL Query
  NLQuery,
  NLQueryData,
  NLQueryMeta,

  // Graph Query
  TraversalDirection,
  GraphQuery,
  QueryGraphEntity,
  GraphRelationship,
  GraphQueryData,
  GraphQueryMeta,

  // Vector Query
  VectorFilterOperator,
  VectorFilterCondition,
  VectorFilter,
  VectorQuery,
  VectorMatch,
  VectorQueryData,
  VectorQueryMeta,

  // RAG Query
  RAGMode,
  RAGQuery,
  RAGQueryData,
  RAGQueryMeta,

  // Registry
  QueryTypeRegistry,
  QueryType,
  QueryFor,
  DataFor,
  MetaFor,
  ResultFor,
  ExecuteQuery,
  AnyQuery,
  AnyQueryData,
  AnyQueryMeta,
} from './registry.js';

export {
  // Type guards
  isNLQuery,
  isGraphQuery,
  isVectorQuery,
  isRAGQuery,
  isKnownQueryType,

  // Factories
  createNLQuery,
  createGraphQuery,
  createVectorQuery,
  createRAGQuery,
} from './registry.js';

// Router
export type {
  QuerySelection,
  IQuerySelector,
} from './router.js';

export {
  TypeBasedSelector,
  PriorityBasedSelector,
  QueryRouter,
  createQueryRouter,
  createPriorityRouter,
} from './router.js';
