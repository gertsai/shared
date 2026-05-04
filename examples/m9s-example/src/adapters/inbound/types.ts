import type { ServiceContextBase } from '@gertsai/api-core';
import type { IngestDocumentUseCase } from '../../application/IngestDocumentUseCase';
import type { SearchDocumentsUseCase } from '../../application/SearchDocumentsUseCase';

/**
 * Service context shared by both inbound Moleculer adapters.
 *
 * Stored as service-instance properties via ApiController.addStartedHandler()
 * so that action handlers can access them through `ctx.service.<x>`.
 *
 * Keeping the use cases here (instead of constructing them inside handlers)
 * means each broker instance owns one set of use-case singletons, aligned
 * with its lifecycle.
 */
export interface DocumentsServiceContext extends ServiceContextBase {
  ingestUseCase: IngestDocumentUseCase;
  searchUseCase: SearchDocumentsUseCase;
}

// =============================================================================
// Request/response shapes used by both REST endpoints.
// Defined here (rather than in domain/) because they are TRANSPORT contracts —
// shaped for typia validation and OpenAPI generation, not domain invariants.
// =============================================================================

/**
 * `POST /api/v1/ingest` — request body.
 */
export interface IngestRequest {
  /** Stable document identifier supplied by the caller */
  docId: string;
  /** Raw document text */
  text: string;
  /** Optional bag of metadata stored alongside the document */
  metadata?: {
    source?: string;
    tags?: string[];
    author?: string;
    createdAt?: string;
  };
}

/**
 * `POST /api/v1/ingest` — response body.
 */
export interface IngestResponse {
  docId: string;
  chunkCount: number;
}

/**
 * `POST /api/v1/search` — request body.
 */
export interface SearchRequest {
  /** Free-form natural language query */
  query: string;
  /** Optional override; defaults to 3 server-side */
  topK?: number;
}

/**
 * `POST /api/v1/search` — response body.
 */
export interface SearchResponse {
  results: Array<{
    docId: string;
    chunkIdx: number;
    text: string;
    score: number;
  }>;
}
