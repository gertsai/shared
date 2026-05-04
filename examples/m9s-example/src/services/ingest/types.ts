/**
 * Ingest Service Types — m9s-example.
 *
 * Mirrors `apps/pipeline/src/services/ingest/types.ts` shape but trimmed to
 * the minimum needed for the example: a typed ServiceContext (used by
 * ApiController to type `ctx.service.<thing>`) plus request/response shapes
 * for the public REST action.
 */

import type { ServiceContextBase } from '@gertsai/api-core';

import type { IngestDocumentUseCase } from '../../application/IngestDocumentUseCase';
import type { IDocumentStore } from '../../domain/ports/IDocumentStore';
import type { IChunkStore } from '../../domain/ports/IChunkStore';
import type { IEmbedder } from '../../domain/ports/IEmbedder';
import type { IPermissionGate } from '../../domain/ports/IPermissionGate';
import type { IngestQueueHandle } from './src/queues';

// =============================================================================
// Service Context
// =============================================================================

/**
 * Properties wired into `ctx.service` by the ingest lifecycle handler.
 * Action handlers see these strongly-typed thanks to ApiController's
 * `ServiceContext` generic.
 */
export interface IngestServiceContext extends ServiceContextBase {
  docStore: IDocumentStore;
  chunkStore: IChunkStore;
  embedder: IEmbedder;
  gate: IPermissionGate;
  useCase: IngestDocumentUseCase;
  queue: IngestQueueHandle;
}

// =============================================================================
// Request / Response Shapes
// =============================================================================

/**
 * `POST /api/v1/ingest/document` — request body.
 *
 * Defined here (rather than in domain/) because it is a TRANSPORT contract:
 * shaped for typia validation and OpenAPI generation, not domain invariants.
 */
export interface IngestDocumentRequest {
  /** Stable document identifier supplied by the caller */
  docId: string;
  /** Raw document text */
  text: string;
  /** Optional metadata bag (passed through to the domain layer) */
  metadata?: {
    source?: string;
    tags?: string[];
    author?: string;
    createdAt?: string;
  };
  /**
   * Caller user identifier. Optional in this example so curl works without
   * an auth provider; production wiring should set `auth: 'required'` on
   * the action and use `session.user_uuid` instead.
   */
  userId?: string;
}

/**
 * `POST /api/v1/ingest/document` — response body.
 *
 * In queue mode (REDIS_URL set) `chunkCount` is `null` and processing
 * happens in the BullMQ worker; the job id is returned so callers can poll
 * for completion. In inline mode (no Redis), processing is synchronous and
 * `chunkCount` is the final count.
 */
export interface IngestDocumentResponse {
  /** Echoed back for client-side correlation */
  docId: string;
  /** BullMQ job id (or a synthetic id when running in inline mode) */
  jobId: string;
  /** 'redis' when backed by BullMQ, 'inline' when fallback synchronous */
  mode: 'redis' | 'inline';
  /** Final chunk count when synchronous; null in async/Redis mode */
  chunkCount: number | null;
}
