/**
 * @gertsai/core - Query System Types
 *
 * Universal query types for type-safe query → result mapping.
 *
 * @see RFC-032: Universal Query System
 */

import type { TenantId } from '../ids.js';

// ============================================================================
// Query Options
// ============================================================================

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

// ============================================================================
// Base Query Request
// ============================================================================

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

// ============================================================================
// Source Reference (Provenance)
// ============================================================================

/**
 * Source types for provenance tracking
 */
export type SourceType =
  | 'entity'
  | 'relationship'
  | 'chunk'
  | 'document'
  | 'community';

/**
 * Source reference for provenance tracking.
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

// ============================================================================
// Query Metadata
// ============================================================================

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

// ============================================================================
// Query Results (Discriminated Union)
// ============================================================================

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
export type QueryResult<TData, TMeta = unknown> =
  | QuerySuccess<TData, TMeta>
  | QueryFailure
  | QueryPartial<TData, TMeta>;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for successful query result
 */
export function isQuerySuccess<T, M>(
  result: QueryResult<T, M>
): result is QuerySuccess<T, M> {
  return result.status === 'success';
}

/**
 * Type guard for failed query result
 */
export function isQueryFailure<T, M>(
  result: QueryResult<T, M>
): result is QueryFailure {
  return result.status === 'error';
}

/**
 * Type guard for partial query result
 */
export function isQueryPartial<T, M>(
  result: QueryResult<T, M>
): result is QueryPartial<T, M> {
  return result.status === 'partial';
}

// ============================================================================
// Factory Functions
// ============================================================================

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
export function querySuccess<TData, TMeta = unknown>(
  data: TData,
  sources: readonly SourceReference[],
  durationMs: number,
  options?: {
    cached?: boolean;
    confidence?: number;
    custom?: TMeta;
  }
): QuerySuccess<TData, TMeta> {
  // EVID-059 FR-E-2: previously `queryPartial` clamped `progress ∈ [0,1]` but
  // `querySuccess` accepted any number for `confidence` and any number
  // (including negative / NaN) for `durationMs`. Sibling factories now apply
  // the same defensive normalisation so downstream consumers (logging, KPI
  // dashboards, retry heuristics) never see out-of-range values.
  const confidence = options?.confidence;
  const clampedConfidence =
    confidence !== undefined && Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : confidence;
  const normalisedDurationMs =
    Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
  const custom = options?.custom;
  return {
    status: 'success',
    data,
    sources,
    metadata: {
      durationMs: normalisedDurationMs,
      cached: options?.cached ?? false,
      ...(clampedConfidence !== undefined && { confidence: clampedConfidence }),
      ...(custom !== undefined && { custom }),
    },
  };
}

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
export function queryFailure(
  code: string,
  message: string,
  options?: {
    retryable?: boolean;
    details?: Record<string, unknown>;
  }
): QueryFailure {
  const details = options?.details;
  return {
    status: 'error',
    code,
    message,
    retryable: options?.retryable ?? false,
    ...(details !== undefined && { details }),
  };
}

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
export function queryPartial<TData, TMeta = unknown>(
  data: TData,
  progress: number,
  sources: readonly SourceReference[],
  durationMs: number,
  options?: {
    cached?: boolean;
    confidence?: number;
    custom?: TMeta;
  }
): QueryPartial<TData, TMeta> {
  // EVID-059 FR-E-2: align with sibling `querySuccess` — clamp `confidence`,
  // floor `durationMs` to 0 on NaN/negative.
  const confidence = options?.confidence;
  const clampedConfidence =
    confidence !== undefined && Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : confidence;
  const normalisedDurationMs =
    Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
  const safeProgress = Number.isFinite(progress) ? progress : 0;
  const custom = options?.custom;
  return {
    status: 'partial',
    data,
    progress: Math.max(0, Math.min(1, safeProgress)), // Clamp to 0-1
    sources,
    metadata: {
      durationMs: normalisedDurationMs,
      cached: options?.cached ?? false,
      ...(clampedConfidence !== undefined && { confidence: clampedConfidence }),
      ...(custom !== undefined && { custom }),
    },
  };
}

// ============================================================================
// Common Error Codes
// ============================================================================

/**
 * Standard query error codes.
 * Extensions can add custom codes.
 */
export const QUERY_ERROR_CODES = {
  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_QUERY: 'INVALID_QUERY',
  INVALID_TENANT: 'INVALID_TENANT',

  // Execution errors
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  NO_EXECUTOR: 'NO_EXECUTOR',
  EXECUTOR_NOT_FOUND: 'EXECUTOR_NOT_FOUND',

  // Security errors
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INJECTION_DETECTED: 'INJECTION_DETECTED',

  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // Infrastructure
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type QueryErrorCode = (typeof QUERY_ERROR_CODES)[keyof typeof QUERY_ERROR_CODES];

// ============================================================================
// Query Error Class
// ============================================================================

/**
 * Query error class for throwing.
 * Can be caught and converted to QueryFailure.
 */
export class QueryError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    options?: {
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'QueryError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
    if (options?.details !== undefined) {
      this.details = options.details;
    }

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, QueryError);
    }
  }

  /**
   * Convert to QueryFailure
   */
  toFailure(): QueryFailure {
    return queryFailure(this.code, this.message, {
      retryable: this.retryable,
      ...(this.details !== undefined && { details: this.details }),
    });
  }

  /**
   * Check if error is a specific code
   */
  is(code: string): boolean {
    return this.code === code;
  }
}

/**
 * Type guard for QueryError
 */
export function isQueryError(error: unknown): error is QueryError {
  return error instanceof QueryError;
}
