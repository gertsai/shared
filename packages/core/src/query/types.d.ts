/**
 * @gerts/core - Query System Types
 *
 * Universal query types for type-safe query → result mapping.
 * Aligned with @gerts/tools ToolResult pattern and @gerts/api-types Source.
 *
 * @see RFC-032: Universal Query System
 */
import type { TenantId } from '../ids.js';
/**
 * Common options for all queries
 */
export interface QueryOptions {
    /** Timeout in milliseconds */
    readonly timeout?: number;
    /** Abort signal for cancellation */
    readonly signal?: AbortSignal;
    /** Enable caching */
    readonly cache?: boolean;
    /** Custom context for extensions */
    readonly context?: Record<string, unknown>;
}
/**
 * Base query request - all queries extend this.
 *
 * @typeParam TType - Query type discriminator string
 *
 * @example
 * ```typescript
 * interface NLQuery extends QueryRequest<'nl'> {
 *   readonly question: string;
 * }
 * ```
 */
export interface QueryRequest<TType extends string = string> {
    /** Query type discriminator */
    readonly type: TType;
    /** Tenant identifier for isolation */
    readonly tenantId: TenantId;
    /** Query options */
    readonly options?: QueryOptions;
}
/**
 * Source types for provenance tracking
 */
export type SourceType = 'entity' | 'relationship' | 'chunk' | 'document' | 'community';
/**
 * Source reference for provenance tracking.
 * Aligned with @gerts/api-types Source interface.
 *
 * @example
 * ```typescript
 * const source: SourceReference = {
 *   id: 'entity-123',
 *   type: 'entity',
 *   score: 0.95,
 *   name: 'NeuraTech',
 *   content: 'NeuraTech is an AI company...',
 * };
 * ```
 */
export interface SourceReference {
    /** Unique identifier */
    readonly id: string;
    /** Source type for categorization */
    readonly type: SourceType;
    /** Relevance score (0-1) */
    readonly score?: number;
    /** Display name */
    readonly name?: string;
    /** Content excerpt */
    readonly content?: string;
    /** Additional metadata */
    readonly metadata?: Record<string, unknown>;
}
/**
 * Query metadata with timing and diagnostics.
 *
 * @typeParam T - Custom metadata type
 */
export interface QueryMetadata<T = unknown> {
    /** Query execution duration in milliseconds */
    readonly durationMs: number;
    /** Whether result was retrieved from cache */
    readonly cached: boolean;
    /** Confidence score (0-1) for AI-generated results */
    readonly confidence?: number;
    /** Custom metadata extension */
    readonly custom?: T;
}
/**
 * Successful query result.
 *
 * @typeParam TData - Result data type
 * @typeParam TMeta - Custom metadata type
 */
export interface QuerySuccess<TData, TMeta = unknown> {
    readonly status: 'success';
    /** Result data */
    readonly data: TData;
    /** Provenance sources */
    readonly sources: readonly SourceReference[];
    /** Execution metadata */
    readonly metadata: QueryMetadata<TMeta>;
}
/**
 * Failed query result.
 * Aligned with @gerts/graph QueryError pattern.
 */
export interface QueryFailure {
    readonly status: 'error';
    /** Error code for programmatic handling */
    readonly code: string;
    /** Human-readable error message */
    readonly message: string;
    /** Whether the query can be retried */
    readonly retryable: boolean;
    /** Additional error details */
    readonly details?: Record<string, unknown>;
}
/**
 * Partial result for streaming queries.
 *
 * @typeParam TData - Result data type
 * @typeParam TMeta - Custom metadata type
 */
export interface QueryPartial<TData, TMeta = unknown> {
    readonly status: 'partial';
    /** Partial result data */
    readonly data: TData;
    /** Progress percentage (0-1) */
    readonly progress: number;
    /** Sources found so far */
    readonly sources: readonly SourceReference[];
    /** Current metadata */
    readonly metadata: QueryMetadata<TMeta>;
}
/**
 * Universal query result - discriminated union by status.
 *
 * @typeParam TData - Result data type
 * @typeParam TMeta - Custom metadata type
 *
 * @example
 * ```typescript
 * function handleResult(result: QueryResult<string>) {
 *   switch (result.status) {
 *     case 'success':
 *       console.log(result.data);  // Type: string
 *       break;
 *     case 'error':
 *       console.error(result.message);
 *       break;
 *     case 'partial':
 *       console.log(`${result.progress * 100}% complete`);
 *       break;
 *   }
 * }
 * ```
 */
export type QueryResult<TData, TMeta = unknown> = QuerySuccess<TData, TMeta> | QueryFailure | QueryPartial<TData, TMeta>;
/**
 * Type guard for successful query result
 */
export declare function isQuerySuccess<T, M>(result: QueryResult<T, M>): result is QuerySuccess<T, M>;
/**
 * Type guard for failed query result
 */
export declare function isQueryFailure<T, M>(result: QueryResult<T, M>): result is QueryFailure;
/**
 * Type guard for partial query result
 */
export declare function isQueryPartial<T, M>(result: QueryResult<T, M>): result is QueryPartial<T, M>;
/**
 * Create a successful query result
 *
 * @example
 * ```typescript
 * const result = querySuccess(
 *   { answer: 'NeuraTech is an AI company' },
 *   [{ id: 'e1', type: 'entity', score: 0.95 }],
 *   150,
 *   { confidence: 0.9, cached: false }
 * );
 * ```
 */
export declare function querySuccess<TData, TMeta = unknown>(data: TData, sources: readonly SourceReference[], durationMs: number, options?: {
    cached?: boolean;
    confidence?: number;
    custom?: TMeta;
}): QuerySuccess<TData, TMeta>;
/**
 * Create a failed query result
 *
 * @example
 * ```typescript
 * const result = queryFailure(
 *   'VALIDATION_FAILED',
 *   'Invalid query syntax',
 *   { retryable: false, details: { field: 'question' } }
 * );
 * ```
 */
export declare function queryFailure(code: string, message: string, options?: {
    retryable?: boolean;
    details?: Record<string, unknown>;
}): QueryFailure;
/**
 * Create a partial query result (for streaming)
 *
 * @example
 * ```typescript
 * const result = queryPartial(
 *   { chunk: 'Processing...' },
 *   0.5,
 *   [],
 *   100
 * );
 * ```
 */
export declare function queryPartial<TData, TMeta = unknown>(data: TData, progress: number, sources: readonly SourceReference[], durationMs: number, options?: {
    cached?: boolean;
    confidence?: number;
    custom?: TMeta;
}): QueryPartial<TData, TMeta>;
/**
 * Standard query error codes.
 * Extensions can add custom codes.
 */
export declare const QUERY_ERROR_CODES: {
    readonly VALIDATION_FAILED: "VALIDATION_FAILED";
    readonly INVALID_QUERY: "INVALID_QUERY";
    readonly INVALID_TENANT: "INVALID_TENANT";
    readonly EXECUTION_FAILED: "EXECUTION_FAILED";
    readonly TIMEOUT: "TIMEOUT";
    readonly CANCELLED: "CANCELLED";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly NO_EXECUTOR: "NO_EXECUTOR";
    readonly EXECUTOR_NOT_FOUND: "EXECUTOR_NOT_FOUND";
    readonly PERMISSION_DENIED: "PERMISSION_DENIED";
    readonly INJECTION_DETECTED: "INJECTION_DETECTED";
    readonly RATE_LIMITED: "RATE_LIMITED";
    readonly QUOTA_EXCEEDED: "QUOTA_EXCEEDED";
    readonly SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
};
export type QueryErrorCode = (typeof QUERY_ERROR_CODES)[keyof typeof QUERY_ERROR_CODES];
/**
 * Query error class for throwing.
 * Can be caught and converted to QueryFailure.
 */
export declare class QueryError extends Error {
    readonly code: string;
    readonly retryable: boolean;
    readonly details?: Record<string, unknown>;
    constructor(code: string, message: string, options?: {
        retryable?: boolean;
        details?: Record<string, unknown>;
        cause?: Error;
    });
    /**
     * Convert to QueryFailure
     */
    toFailure(): QueryFailure;
    /**
     * Check if error is a specific code
     */
    is(code: string): boolean;
}
/**
 * Type guard for QueryError
 */
export declare function isQueryError(error: unknown): error is QueryError;
//# sourceMappingURL=types.d.ts.map