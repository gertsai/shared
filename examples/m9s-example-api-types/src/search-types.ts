// SPDX-License-Identifier: Apache-2.0
/**
 * Search API contract — Wave 12.E-fix-1 (PRD-038 FR-003 + EVID-053 CRIT-3).
 *
 * Canonical types for `POST /api/v1/search/query`. Mirrors backend
 * `examples/m9s-example/src/services/search/types.ts:45-60` + the underlying
 * `domain/chunk.ts:22-27` shape. Frontend imports these instead of redeclaring
 * a drifting local copy — that drift was the root cause of EVID-053 CRIT-3
 * (frontend rendered `hit.similarity.toFixed(3)` but backend returned `score`).
 *
 * Single source of truth: this file. Backend optionally `import type` from
 * here for documentation; canonical typia validators stay in the backend
 * because they need to live next to the action handlers (typia constraints
 * are compile-time-only).
 */

/**
 * One hit returned by the search action. Matches `domain/chunk.ts`
 * `ChunkSearchHit` field-for-field.
 */
export interface SearchHit {
  readonly docId: string;
  readonly chunkIdx: number;
  readonly text: string;
  readonly score: number;
}

/**
 * `POST /api/v1/search/query` request body. Matches backend
 * `SearchQueryRequest`. Field name is `topK`, NOT `limit` — pre-fix the
 * frontend sent `{ query, limit: 10 }` which typia silently dropped because
 * the handler reads `topK`.
 */
export interface SearchQueryRequest {
  /** Free-form natural language query. */
  readonly query: string;
  /** Optional override; defaults to 3 server-side. */
  readonly topK?: number;
  /** Caller user identifier (optional). */
  readonly userId?: string;
}

/**
 * `POST /api/v1/search/query` response body. Matches backend
 * `SearchQueryResponse`.
 */
export interface SearchQueryResponse {
  readonly results: readonly SearchHit[];
}
