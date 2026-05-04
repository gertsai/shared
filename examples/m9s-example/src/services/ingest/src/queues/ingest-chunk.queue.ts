/**
 * Ingest Queue — BullMQ-backed with synchronous in-process fallback.
 *
 * Mirrors `apps/pipeline/src/services/ingest/src/queues/ingest.ts` in
 * shape: a queue + worker pair created at service start, closed at stop.
 * Real pipeline uses Postgres-backed `@gerts/queue`; we use bullmq directly
 * to keep the example dependency-light.
 *
 * Two run modes (selected by env):
 *
 * 1. **Redis mode** — `REDIS_URL=redis://localhost:6379` → real BullMQ
 *    queue + worker. Producer (`enqueue`) returns immediately with a job
 *    id; consumer processes via `IngestDocumentUseCase` in the background.
 *
 * 2. **Inline mode** — `REDIS_URL` unset → in-process synchronous handler.
 *    `enqueue` runs the use case to completion before resolving. Same
 *    user-visible behaviour, no Redis needed for tests/demos.
 *
 * The chunkCount is propagated back through the response shape so callers
 * see the final count in inline mode and `null` (= "look up later") in
 * Redis mode.
 */
import type { ConnectionOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type Moleculer from 'moleculer';

import type { IngestDocumentUseCase } from '../../../../application/IngestDocumentUseCase';

// =============================================================================
// Public Types
// =============================================================================

export const INGEST_QUEUE_NAME = 'm9s-example.ingest' as const;

/**
 * Payload sent through the queue. Mirrors the use-case input shape so we
 * don't introduce a second DTO inside the boundary.
 */
export interface IngestJobPayload {
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

/**
 * Result of submitting a job. In inline mode `chunkCount` is final; in
 * Redis mode it is `null` (fetch via job status if needed).
 */
export interface EnqueueResult {
  jobId: string;
  chunkCount: number | null;
}

/**
 * Handle returned to the lifecycle and stored on the service context so
 * actions can call `service.queue.enqueue(...)` without knowing the mode.
 */
export interface IngestQueueHandle {
  /** 'redis' when backed by BullMQ; 'inline' when fallback synchronous. */
  readonly mode: 'redis' | 'inline';
  enqueue(payload: IngestJobPayload): Promise<EnqueueResult>;
  close(): Promise<void>;
}

export interface InitIngestQueueDeps {
  /** Use case that performs the actual work — no infra inside this file. */
  useCase: IngestDocumentUseCase;
  /** Optional Moleculer logger for queue lifecycle messages. */
  logger?: Moleculer.LoggerInstance;
  /** BullMQ Worker concurrency (jobs in flight per process). Default: 1 */
  concurrency?: number;
  /**
   * When `false`, the producer (`enqueue`) still works but no Worker is
   * started in this process. Mirrors pipeline's WORKERS_ENABLED — lets one
   * node act as API gateway while another consumes the queue.
   * Default: true.
   */
  workerEnabled?: boolean;
}

// =============================================================================
// Init
// =============================================================================

/**
 * Initialise the ingest queue. Returns a handle that the lifecycle attaches
 * to `ctx.service.queue`.
 */
export async function initIngestQueue(deps: InitIngestQueueDeps): Promise<IngestQueueHandle> {
  const { useCase, logger, concurrency = 1, workerEnabled = true } = deps;
  const redisUrl = process.env.REDIS_URL;

  // ---------------------------------------------------------------------------
  // Inline mode (no Redis configured)
  // ---------------------------------------------------------------------------
  if (!redisUrl) {
    logger?.warn(
      '[ingest queue] REDIS_URL not set — using inline (synchronous) mode. ' +
        'Set REDIS_URL=redis://host:port to switch to BullMQ-backed async mode.',
    );

    return {
      mode: 'inline',
      async enqueue(payload) {
        const result = await processIngestJob(payload, useCase);
        // Synthetic id keeps the response shape consistent with Redis mode.
        return { jobId: `inline-${Date.now()}-${result.chunkCount}`, chunkCount: result.chunkCount };
      },
      async close() {
        // Nothing to close — the function is pure.
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Redis-backed mode
  // ---------------------------------------------------------------------------
  // BullMQ requires `maxRetriesPerRequest: null` on the connection it uses
  // for blocking pop operations. See https://docs.bullmq.io/guide/connections
  const connection: ConnectionOptions = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  const queue = new Queue<IngestJobPayload>(INGEST_QUEUE_NAME, { connection });

  // Optional consumer side. When workerEnabled=false this node is a pure
  // producer (API gateway) and a separate worker process drains the queue.
  let worker: Worker<IngestJobPayload> | undefined;
  if (workerEnabled) {
    worker = new Worker<IngestJobPayload>(
      INGEST_QUEUE_NAME,
      async (job) => {
        // Worker reuses the same use case singleton wired by the lifecycle.
        const out = await processIngestJob(job.data, useCase);
        return out;
      },
      { connection, concurrency },
    );

    worker.on('failed', (job, err) => {
      logger?.error(
        `[ingest queue] job ${job?.id ?? '<unknown>'} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    worker.on('completed', (job) => {
      logger?.info(`[ingest queue] job ${job.id} completed`);
    });

    logger?.info(
      `[ingest queue] BullMQ worker started for '${INGEST_QUEUE_NAME}' (concurrency=${concurrency})`,
    );
  } else {
    logger?.info(
      `[ingest queue] producer-only mode for '${INGEST_QUEUE_NAME}' (no worker started)`,
    );
  }

  return {
    mode: 'redis',
    async enqueue(payload) {
      const job = await queue.add('process', payload);
      // Async mode — chunkCount is only known once the worker finishes.
      return { jobId: job.id ?? `bullmq-${Date.now()}`, chunkCount: null };
    },
    async close() {
      if (worker) {
        try {
          await worker.close();
        } catch (err) {
          logger?.error('[ingest queue] error closing worker', err);
        }
      }
      try {
        await queue.close();
      } catch (err) {
        logger?.error('[ingest queue] error closing queue', err);
      }
      try {
        await (connection as IORedis).quit();
      } catch (err) {
        logger?.error('[ingest queue] error closing redis connection', err);
      }
    },
  };
}

/**
 * Tear down the queue. Safe to call with `undefined` for symmetry with
 * lifecycle handlers that may not have initialised it.
 */
export async function closeIngestQueue(handle?: IngestQueueHandle): Promise<void> {
  if (!handle) return;
  await handle.close();
}

// =============================================================================
// Pure Processing Function — same code path used by both modes
// =============================================================================

async function processIngestJob(
  payload: IngestJobPayload,
  useCase: IngestDocumentUseCase,
): Promise<{ chunkCount: number }> {
  const result = await useCase.execute({
    userId: payload.userId,
    docId: payload.docId,
    text: payload.text,
    metadata: payload.metadata,
  });
  return { chunkCount: result.chunkCount };
}
