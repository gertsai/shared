"use strict";
/**
 * @gerts/core - Query Type Registry
 *
 * Type-safe registry mapping query types to their request/result types.
 * Provides compile-time type safety for query → result mapping.
 *
 * @see RFC-032: Universal Query System
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNLQuery = isNLQuery;
exports.isGraphQuery = isGraphQuery;
exports.isVectorQuery = isVectorQuery;
exports.isRAGQuery = isRAGQuery;
exports.isKnownQueryType = isKnownQueryType;
exports.createNLQuery = createNLQuery;
exports.createGraphQuery = createGraphQuery;
exports.createVectorQuery = createVectorQuery;
exports.createRAGQuery = createRAGQuery;
// ============================================================================
// Type Guards for Query Types
// ============================================================================
/**
 * Type guard for NL query
 */
function isNLQuery(query) {
    return query.type === 'nl';
}
/**
 * Type guard for Graph query
 */
function isGraphQuery(query) {
    return query.type === 'graph';
}
/**
 * Type guard for Vector query
 */
function isVectorQuery(query) {
    return query.type === 'vector';
}
/**
 * Type guard for RAG query
 */
function isRAGQuery(query) {
    return query.type === 'rag';
}
/**
 * Type guard for known query type
 */
function isKnownQueryType(type) {
    return ['nl', 'graph', 'vector', 'rag'].includes(type);
}
// ============================================================================
// Query Factories
// ============================================================================
/**
 * Create an NL query
 */
function createNLQuery(tenantId, question, options) {
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
function createGraphQuery(tenantId, startEntityId, maxDepth, options) {
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
function createVectorQuery(tenantId, query, topK, options) {
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
function createRAGQuery(tenantId, question, mode = 'auto', options) {
    return {
        type: 'rag',
        tenantId,
        question,
        mode,
        ...options,
    };
}
//# sourceMappingURL=registry.js.map