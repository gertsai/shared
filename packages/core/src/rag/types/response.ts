/**
 * @fileoverview RAG Response Types (RFC-036)
 *
 * Core response types for RAG API Standard.
 * These types are used across HTTP APIs (RFC-030), agent responses,
 * and GraphRAG queries.
 *
 * @module @gertsai/core/rag
 */

import { randomUUID } from 'crypto';

// ============================================
// Branded Types for Type-Safe IDs
// ============================================

declare const ResponseIdBrand: unique symbol;
declare const SourceIdBrand: unique symbol;
declare const CitationIdBrand: unique symbol;

/**
 * Branded type for RAG response IDs.
 * Format: `rag_<uuid>`
 */
export type ResponseId = string & { readonly [ResponseIdBrand]: typeof ResponseIdBrand };

/**
 * Branded type for source IDs.
 * Format: `src_<uuid>`
 */
export type SourceId = string & { readonly [SourceIdBrand]: typeof SourceIdBrand };

/**
 * Branded type for citation IDs.
 * Format: `cit_<uuid>`
 */
export type CitationId = string & { readonly [CitationIdBrand]: typeof CitationIdBrand };

/**
 * Creates a unique response ID.
 *
 * @returns ResponseId in format `rag_<uuid>`
 *
 * @example
 * ```typescript
 * const id = createResponseId();
 * // id: "rag_550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function createResponseId(): ResponseId {
  return `rag_${randomUUID()}` as ResponseId;
}

/**
 * Creates a unique source ID.
 *
 * @returns SourceId in format `src_<uuid>`
 *
 * @example
 * ```typescript
 * const id = createSourceId();
 * // id: "src_550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function createSourceId(): SourceId {
  return `src_${randomUUID()}` as SourceId;
}

/**
 * Creates a unique citation ID.
 *
 * @returns CitationId in format `cit_<uuid>`
 *
 * @example
 * ```typescript
 * const id = createCitationId();
 * // id: "cit_550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function createCitationId(): CitationId {
  return `cit_${randomUUID()}` as CitationId;
}

// ============================================
// Source Types
// ============================================

/**
 * Represents a retrieved source chunk used in RAG response generation.
 *
 * Sources are ordered by relevance score and include optional scoring
 * details from different retrieval stages.
 */
export interface Source {
  /** Unique identifier for this source */
  readonly id: SourceId;

  /** The text content of this source chunk */
  readonly text: string;

  /** Combined relevance score (0-1), higher is more relevant */
  readonly score: number;

  /** ID of the parent document */
  readonly documentId: string;

  /** Position of this chunk within the document (0-indexed) */
  readonly chunkIndex: number;

  /** URL to the original document (if available) */
  readonly url?: string;

  /** Title of the source document */
  readonly title?: string;

  /** Page number in the original document (1-indexed) */
  readonly pageNumber?: number;

  // Scoring breakdown
  /** Score from vector similarity search (0-1) */
  readonly vectorScore?: number;

  /** Score from keyword/BM25 search (0-1) */
  readonly keywordScore?: number;

  /** Score after re-ranking (0-1) */
  readonly rerankScore?: number;

  // Graph context
  /** Entity names mentioned in this source */
  readonly entityMentions?: readonly string[];

  /** ISO 8601 timestamp when this source was indexed */
  readonly indexedAt?: string;

  /** Additional metadata from the document */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================
// Token Usage (OpenAI-compatible)
// ============================================

/**
 * Token usage statistics for a RAG response.
 *
 * Compatible with OpenAI's usage format for easy integration
 * with existing tools and dashboards.
 */
export interface TokenUsage {
  /** Tokens used in the prompt (context + question) */
  readonly promptTokens: number;

  /** Tokens generated in the response */
  readonly completionTokens: number;

  /** Total tokens (promptTokens + completionTokens) */
  readonly totalTokens: number;

  /** Tokens from retrieved sources (subset of promptTokens) */
  readonly retrievalTokens?: number;

  /** Tokens from graph context (subset of promptTokens) */
  readonly graphTokens?: number;

  /** Tokens served from cache */
  readonly cachedTokens?: number;
}

// ============================================
// RAG Response Core
// ============================================

/**
 * Core RAG response fields (always present).
 *
 * This is the base response type. Use `RAGResponse<C>` with
 * capability type parameters for additional fields.
 *
 * @see RAGResponse
 * @see RAGCapabilities
 */
export interface RAGResponseCore {
  /** Unique response identifier */
  readonly id: ResponseId;

  /** Object type (always 'rag.response') */
  readonly object: 'rag.response';

  /** The generated answer text */
  readonly answer: string;

  /** Sources used to generate the answer, ordered by relevance */
  readonly sources: readonly Source[];

  /** Token usage statistics */
  readonly usage: TokenUsage;

  /** ISO 8601 timestamp when response was created */
  readonly createdAt: string;

  /** Tenant identifier for multi-tenancy */
  readonly tenantId: string;

  /** Model used for generation */
  readonly model?: string;

  /** API version (Stripe-style, e.g., "2025-01-03") */
  readonly apiVersion?: string;
}
