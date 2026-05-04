/**
 * Ingest Queue Worker — registered via `controller.registerWorker()`.
 *
 * Mirrors `apps/pipeline/src/services/ingest/src/queues/ingest.ts` exactly:
 *
 *   - **Registration**: at module-load time, this file calls
 *     `controller.registerWorker(queueName, [{ name, concurrency, handler }])`.
 *     api-core stores the registration; later `_createServiceSchema` drops it
 *     into the Moleculer service schema, and the service's `started()` handler
 *     creates ONE BullMQ Worker per queue with internal routing on `job.name`.
 *
 *   - **Worker gating**: api-core respects the static `_workersEnabled` and
 *     `_enabledWorkers` flags set by `ApiController.Start({ workersEnabled,
 *     enabledWorkers })`. When workers are disabled (API-gateway mode), the
 *     queue is still configured (so producers can call `service.addJob(...)`)
 *     but no Worker is instantiated in this process.
 *
 *   - **Handler context**: the handler receives a `QueueHandlerCtx<T>` from
 *     api-core that exposes `{ job, call, addJob, getQueue, logger, service }`.
 *     We delegate to `service.useCase` (typed via `IngestServiceContext`) —
 *     the worker stays a thin transport layer.
 *
 * Producer side lives in `actions/ingest-document.action.ts` and uses
 * `service.addJob(QUEUE_NAME, JOB_PROCESS_DOCUMENT, payload)`.
 */
import type { QueueHandlerCtx } from '@gertsai/api-core';

import { resolveExampleController } from '../../../../lib/example-controller';
import config from '../../../../../project.config';
import { PermissionDeniedError } from '../../../../application/IngestDocumentUseCase';
import type { IngestServiceContext } from '../../types';

// =============================================================================
// Public Constants & Job Shapes
// =============================================================================

/**
 * Fully-qualified BullMQ queue name. Pipeline convention is
 * `<service>.<purpose>` — keeps queues namespaced even when multiple apps
 * share a Redis instance.
 */
export const INGEST_QUEUE_NAME = 'm9s-example.ingest' as const;

/**
 * Job name routed by api-core's per-queue worker (one Worker, multiple
 * `job.name` handlers — see api-core `_createServiceSchema`).
 */
export const JOB_PROCESS_DOCUMENT = 'process-document' as const;

export interface ProcessDocumentJobData {
  docId: string;
  text: string;
  userId: string;
  metadata?: {
    source?: string;
    tags?: string[];
    author?: string;
    createdAt?: string;
  };
}

export interface ProcessDocumentJobResult {
  docId: string;
  chunkCount: number;
}

// =============================================================================
// Worker Registration
// =============================================================================

const controller = resolveExampleController<'v1', 'ingest', IngestServiceContext>('v1', 'ingest');

controller.registerWorker(INGEST_QUEUE_NAME, [
  {
    name: JOB_PROCESS_DOCUMENT,
    concurrency: config.WORKER_CONCURRENCY,
    /**
     * Handler runs on the BullMQ Worker created by api-core. The `service`
     * argument is the Moleculer service instance; we recover the typed
     * `IngestServiceContext` shape we wired in `lifecycle.ts`.
     */
    handler: async (
      ctx: QueueHandlerCtx<import('bullmq').Job<ProcessDocumentJobData>>,
    ): Promise<ProcessDocumentJobResult> => {
      // `service` is the Moleculer.Service this queue lives on; cast to our
      // typed context to access `useCase`.
      const service = (ctx as unknown as { service: IngestServiceContext & { logger?: Console } })
        .service;
      const job = ctx.job;
      const payload = job.data;

      service.logger?.info?.(
        `[ingest queue] worker handling job ${job.id} (docId=${payload.docId}, ` +
          `text=${payload.text.length} chars)`,
      );

      try {
        const { docId, chunkCount } = await service.useCase.execute({
          userId: payload.userId,
          docId: payload.docId,
          text: payload.text,
          metadata: payload.metadata,
        });
        return { docId, chunkCount };
      } catch (err) {
        // Convert domain errors to standard errors so BullMQ records them.
        // Pipeline-style: the action layer maps to APIError; the worker
        // layer just throws and lets BullMQ's retry policy handle it.
        if (err instanceof PermissionDeniedError) {
          throw new Error(`[permission-denied] ${err.message}`);
        }
        throw err;
      }
    },
  },
]);

export { controller };
