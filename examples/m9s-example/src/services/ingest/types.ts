/**
 * Ingest Service Types — m9s-example.
 *
 * Mirrors `apps/pipeline/src/services/ingest/types.ts` shape, trimmed to the
 * minimum the example needs: a typed `ServiceContextBase` extension that
 * api-core uses to type `ctx.service.<thing>`, plus public REST shapes.
 *
 * NOTE: queue infrastructure is owned by api-core when `ApiController.configure`
 * provides a `queue` connection. The service then exposes:
 *   - `service.addJob(queueName, jobName, payload, opts?)` — produce side
 *   - `service.getQueue(queueName)` — direct BullMQ Queue access
 * No queue handle on the context — those methods come from api-core directly.
 */

import type { ServiceContextBase } from '@gertsai/api-core';

import type { IngestDocumentUseCase } from '../../application/IngestDocumentUseCase';
import type { IDocumentStore } from '../../domain/ports/IDocumentStore';
import type { IChunkStore } from '../../domain/ports/IChunkStore';
import type { IEmbedder } from '../../domain/ports/IEmbedder';
import type { IPermissionGate } from '../../domain/ports/IPermissionGate';

// =============================================================================
// Service Context
// =============================================================================

/**
 * Properties wired into `ctx.service` by the ingest lifecycle handler.
 * Action handlers see these strongly-typed via ApiController's
 * `ServiceContext` generic.
 *
 * `addJob` and `getQueue` are NOT declared here — they are added by api-core
 * onto every service whose ApiController has a queue config.
 */
export interface IngestServiceContext extends ServiceContextBase {
  docStore: IDocumentStore;
  chunkStore: IChunkStore;
  embedder: IEmbedder;
  gate: IPermissionGate;
  useCase: IngestDocumentUseCase;
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
 * In **queue mode** (REDIS_URL set + workers enabled): action returns
 * immediately with `mode='queued'`, `jobId=<bullmq id>`, `chunkCount=null`.
 * Processing happens asynchronously in the BullMQ Worker.
 *
 * In **inline mode** (REDIS_URL not set): action runs the use case
 * synchronously and returns `mode='inline'`, `chunkCount=<final count>`.
 * `jobId` is a synthetic identifier.
 */
export interface IngestDocumentResponse {
  /** Echoed back for client-side correlation */
  docId: string;
  /** BullMQ job id (or a synthetic id when running in inline mode) */
  jobId: string;
  /** 'queued' when handed to BullMQ, 'inline' when run synchronously here */
  mode: 'queued' | 'inline';
  /** Final chunk count when synchronous; null in async/queued mode */
  chunkCount: number | null;
}
