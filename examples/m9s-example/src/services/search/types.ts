/**
 * Search Service Types — m9s-example.
 *
 * Mirrors the ingest service's type module: a typed ServiceContext for
 * `ctx.service` access and request/response shapes for the public REST
 * action.
 */

import type { ServiceContextBase } from '@gertsai/api-core';

import type { SearchDocumentsUseCase } from '../../application/SearchDocumentsUseCase';
import type { IChunkStore } from '../../domain/ports/IChunkStore';
import type { IEmbedder } from '../../domain/ports/IEmbedder';
import type { IPermissionGate } from '../../domain/ports/IPermissionGate';

// =============================================================================
// Service Context
// =============================================================================

/**
 * Properties wired into `ctx.service` by the search lifecycle handler.
 *
 * Search shares the same chunk store + embedder + gate as ingest in real
 * apps — for the example we keep them per-service so each service is
 * self-contained and easy to read in isolation.
 */
export interface SearchServiceContext extends ServiceContextBase {
  chunkStore: IChunkStore;
  embedder: IEmbedder;
  gate: IPermissionGate;
  useCase: SearchDocumentsUseCase;
}

// =============================================================================
// Request / Response Shapes
// =============================================================================

/**
 * `POST /api/v1/search/query` — request body.
 */
export interface SearchQueryRequest {
  /** Free-form natural language query */
  query: string;
  /** Optional override; defaults to 3 server-side */
  topK?: number;
  /** Caller user identifier (optional in this example — see ingest types). */
  userId?: string;
}

/**
 * `POST /api/v1/search/query` — response body.
 */
export interface SearchQueryResponse {
  results: Array<{
    docId: string;
    chunkIdx: number;
    text: string;
    score: number;
  }>;
}
