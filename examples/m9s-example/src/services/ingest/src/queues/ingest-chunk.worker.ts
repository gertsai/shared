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
import type { QueueHandlerCtx } from '@gertsai/api-core/moleculer';
import type Moleculer from 'moleculer';

import { resolveExampleController } from '../../../../lib/example-controller';
import config from '../../../../../project.config';
import { ForbiddenError } from '../../../../shared/errors';
import { DOCUMENT_INDEXED_CHANNEL } from '../../../channels/document-events.channel';
// Wave 12.E-fix-2 Phase 2 (PRD-039 FR-005 / EVID-053 H-2): queue-mode SSE
// terminal frames. Pre-fix only the `started` frame fired (from the action
// handler) and the worker silently completed without emitting
// `embedding`/`persisted`/`done` — every queued ingest looked like a
// phantom timeout to the UI. Mirrors the inline-mode 4-frame sequence
// emitted by `ingest-document.action.ts:162-169`.
import { emitSse } from '../sse-emitter';
import type { IngestServiceContext } from '../../types';

/**
 * Handler `this` shape: api-core binds the Moleculer service instance to
 * `this` when invoking the queue handler — same pattern pipeline uses.
 * The service has our typed IngestServiceContext fields (useCase, etc.)
 * plus the standard Moleculer.Service surface (logger, broker, ...).
 */
type IngestQueueThis = IngestServiceContext &
  Pick<Moleculer.Service, 'logger' | 'broker'>;

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
     * Handler runs on the BullMQ Worker created by api-core.
     *
     * api-core invokes the handler with `handler.call(service, ctxObj)` —
     * `this` is the Moleculer service instance (with our typed
     * `IngestServiceContext` fields), `ctxObj` carries `{ job, call, ... }`.
     * Use a non-arrow function to capture `this` correctly.
     */
    async handler(
      this: IngestQueueThis,
      ctx: QueueHandlerCtx<import('bullmq').Job<ProcessDocumentJobData>>,
    ): Promise<ProcessDocumentJobResult> {
      const job = ctx.job;
      const payload = job.data;
      // Wave 12.E-fix-2 Phase 2 (PRD-039 FR-006 / EVID-053 H-3): destroyed
      // re-check helper. Moleculer doesn't track a built-in `_destroyed`
      // boolean — the lifecycle's `addStoppedHandler` flips it
      // (`services/ingest/lifecycle.ts`) so workers short-circuit cleanly
      // mid-shutdown. We capture `this` once and re-read the flag inside
      // a closure so each call refreshes the read (TS would otherwise
      // narrow the type after the first check and reject subsequent
      // comparisons as `false | undefined === true`).
      const serviceRef: IngestQueueThis = this;
      const isDestroyed = (): boolean =>
        (serviceRef as { _destroyed?: boolean })._destroyed === true;

      this.logger?.info?.(
        `[ingest queue] worker handling job ${job.id} (docId=${payload.docId}, ` +
          `text=${payload.text.length} chars)`,
      );

      try {
        // Wave 12.E-fix-2 Phase 2 (PRD-039 FR-005 / EVID-053 H-2): emit
        // `embedding` BEFORE the use case runs — mirrors the inline path
        // (`actions/ingest-document.action.ts:162`). Subscribers added via
        // `subscribe(docId, tenantId, fn)` see the lifecycle in source
        // order regardless of inline vs queue mode.
        emitSse({ kind: 'embedding', docId: payload.docId, ts: Date.now() });

        const { docId, chunkCount } = await this.useCase.execute({
          userId: payload.userId,
          docId: payload.docId,
          text: payload.text,
          ...(payload.metadata !== undefined && { metadata: payload.metadata }),
        });

        // Wave 12.E-fix-2 Phase 2 (PRD-039 FR-006 / EVID-053 H-3): re-check
        // `_destroyed` after the use-case await. If the broker started
        // tearing down mid-await we abort without emitting further SSE
        // frames / channel events — BullMQ will retry the job on the next
        // process.
        if (isDestroyed()) {
          this.logger?.warn?.(
            `[ingest queue] worker aborting post-useCase await (job=${job.id}, ` +
              `docId=${docId}) — service destroyed`,
          );
          return { docId, chunkCount };
        }

        // Wave 12.E-fix-2 Phase 2 (PRD-039 FR-005 / EVID-053 H-2): emit
        // `persisted` after the use case completes. Carries the final
        // chunk count in `detail` to match the inline-path payload shape
        // (`actions/ingest-document.action.ts:163-167`).
        emitSse({
          kind: 'persisted',
          docId,
          ts: Date.now(),
          detail: `chunkCount=${chunkCount}`,
        });

        // Publish a durable cross-service event via @moleculer/channels.
        // Subscribers (`channel-document-events` service) get at-least-once
        // delivery with consumer-group balancing + DLQ on persistent failure.
        // No-op when REDIS_URL is unset (channels middleware not loaded).
        const broker = this.broker as unknown as {
          sendToChannel?: (topic: string, payload: Record<string, unknown>) => Promise<void>;
        };
        if (broker?.sendToChannel) {
          await broker.sendToChannel(DOCUMENT_INDEXED_CHANNEL, {
            docId,
            chunkCount,
            userId: payload.userId,
            indexedAt: Date.now(),
            jobId: String(job.id ?? ''),
          });
          // Wave 12.E-fix-2 Phase 2 (PRD-039 FR-006 / EVID-053 H-3):
          // re-check `_destroyed` after the channel-publish await — same
          // contract as above.
          if (isDestroyed()) {
            this.logger?.warn?.(
              `[ingest queue] worker aborting post-channel-publish await ` +
                `(job=${job.id}, docId=${docId}) — service destroyed`,
            );
            return { docId, chunkCount };
          }
          this.logger?.info?.(
            `[ingest queue] published ${DOCUMENT_INDEXED_CHANNEL} (job=${job.id})`,
          );
        }

        // Wave 12.E-fix-2 Phase 2 (PRD-039 FR-005 / EVID-053 H-2): emit
        // terminal `done` frame so the UI panel closes the stream cleanly
        // rather than dangling at `started`/`embedding`/`persisted` until
        // the 30s idle timeout fires.
        emitSse({ kind: 'done', docId, ts: Date.now() });

        return { docId, chunkCount };
      } catch (err) {
        // Wave 12.E-fix-2 Phase 2 (PRD-039 FR-005 / EVID-053 H-2): on
        // worker-side failure, surface a terminal `error` frame so the
        // SSE consumer terminates rather than dangling at the last
        // pipeline-stage frame. Done BEFORE the BullMQ-facing throw so the
        // frame fires even when the rethrow triggers BullMQ retry logic.
        emitSse({
          kind: 'error',
          docId: payload.docId,
          ts: Date.now(),
          detail: err instanceof Error ? err.message : String(err),
        });
        // Convert domain errors to standard errors so BullMQ records them.
        // Pipeline-style: the action layer maps to APIError; the worker
        // layer just throws and lets BullMQ's retry policy handle it.
        if (err instanceof ForbiddenError) {
          throw new Error(`[permission-denied] ${err.message}`, { cause: err });
        }
        throw err;
      }
    },
  },
]);

export { controller };
