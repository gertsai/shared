// ============================================================================
// Type Guards for Query Types
// ============================================================================
/**
 * Type guard for NL query
 */
export function isNLQuery(query) {
    return query.type === 'nl';
}
/**
 * Type guard for Graph query
 */
export function isGraphQuery(query) {
    return query.type === 'graph';
}
/**
 * Type guard for Vector query
 */
export function isVectorQuery(query) {
    return query.type === 'vector';
}
/**
 * Type guard for RAG query
 */
export function isRAGQuery(query) {
    return query.type === 'rag';
}
/**
 * Type guard for known query type
 */
export function isKnownQueryType(type) {
    return ['nl', 'graph', 'vector', 'rag'].includes(type);
}
// ============================================================================
// Query Factories
// ============================================================================
/**
 * Create an NL query
 */
export function createNLQuery(tenantId, question, options) {
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
export function createGraphQuery(tenantId, startEntityId, maxDepth, options) {
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
export function createVectorQuery(tenantId, query, topK, options) {
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
export function createRAGQuery(tenantId, question, mode = 'auto', options) {
    return {
        type: 'rag',
        tenantId,
        question,
        mode,
        ...options,
    };
}
