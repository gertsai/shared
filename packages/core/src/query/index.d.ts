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
export type { QueryOptions, QueryRequest, SourceType, SourceReference, QueryMetadata, QuerySuccess, QueryFailure, QueryPartial, QueryResult, QueryErrorCode, } from './types.js';
export { isQuerySuccess, isQueryFailure, isQueryPartial, isQueryError, querySuccess, queryFailure, queryPartial, QUERY_ERROR_CODES, QueryError, } from './types.js';
export type { ExecutorLatency, ExecutorMetadata, QueryToolOptions, IQueryExecutor, ExecutorFactory, ExecutorRegistryEntry, } from './executor.js';
export { BaseQueryExecutor, createExecutorMetadata, executorSupportsType, getAllSupportedTypes, findExecutorByName, findExecutorsByType, } from './executor.js';
export type { NLQuery, NLQueryData, NLQueryMeta, TraversalDirection, GraphQuery, QueryGraphEntity, GraphRelationship, GraphQueryData, GraphQueryMeta, VectorFilterOperator, VectorFilterCondition, VectorFilter, VectorQuery, VectorMatch, VectorQueryData, VectorQueryMeta, RAGMode, RAGQuery, RAGQueryData, RAGQueryMeta, QueryTypeRegistry, QueryType, QueryFor, DataFor, MetaFor, ResultFor, ExecuteQuery, AnyQuery, AnyQueryData, AnyQueryMeta, } from './registry.js';
export { isNLQuery, isGraphQuery, isVectorQuery, isRAGQuery, isKnownQueryType, createNLQuery, createGraphQuery, createVectorQuery, createRAGQuery, } from './registry.js';
export type { QuerySelection, IQuerySelector, } from './router.js';
export { TypeBasedSelector, PriorityBasedSelector, QueryRouter, createQueryRouter, createPriorityRouter, } from './router.js';
