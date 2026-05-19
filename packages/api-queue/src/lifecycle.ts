// SPDX-License-Identifier: Apache-2.0
/**
 * BullMQ Worker lifecycle for `@gertsai/api-core` services.
 *
 * Encapsulates worker creation + selective worker-mode (API Gateway vs Worker
 * Node deployment pattern, per EVID-067 §Doctor Strange #2) + worker/queue
 * teardown. Extracted from `ApiController.generateServiceSchema()` started/stopped
 * blocks in Wave 15.B.
 *
 * Selective worker-mode semantics (see also `SPEC-018`):
 *
 * | Mode | workersEnabled | enabledWorkers | Effect |
 * |---|---|---|---|
 * | All (default) | `true` | `undefined` | Every queue boots a worker |
 * | API Gateway | `false` | (ignored) | No workers boot; `addJob` still pushes |
 * | Selective | `true` | `['a','b']` | Only listed queues boot workers |
 *
 * `getQueue(name)` always creates the queue regardless (`addJob` works in any
 * mode); only worker creation is gated.
 */

import { Worker } from 'bullmq';
import type { Job, Queue } from 'bullmq';
import _forIn from 'lodash.forin';
import type Moleculer from 'moleculer';

import type {
  BullMQConnectionOptions,
  QueueHandler,
  QueueSchemaFragment,
  QueueTraceContext,
} from './types';

/**
 * Per-service options consumed by `bootQueueWorkers`.
 */
export type BootQueueWorkersOptions = {
  /** Whether to boot workers at all. `false` = API Gateway mode. */
  workersEnabled: boolean;
  /**
   * If a `Set` is supplied, only queues whose names are in the set boot workers.
   * `null` means "no filter — boot every queue that has handlers".
   */
  enabledWorkers: Set<string> | null;
  /** BullMQ connection config (required — without it there are no workers). */
  queueConfig: BullMQConnectionOptions;
};

/**
 * The shape `bootQueueWorkers` expects from the Moleculer service `this`
 * argument. We type only what we touch — keeps the package decoupled from
 * api-core's `CoreServiceSchema`.
 */
export type QueueAwareService = Moleculer.Service & {
  schema: { queues?: Record<string, QueueSchemaFragment | unknown> };
  $queues: Record<string, Queue>;
  $workers: Record<string, Worker>;
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  getQueue: (name: string) => any;
  addJob: (
    name: string,
    jobName: string,
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any,
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    opts: any,
  ) => Promise<Job>;
};

/**
 * Boot BullMQ workers for every registered queue handler on this service.
 *
 * Pure side-effect function — populates `service.$workers` and logs through
 * `service.logger`. Honours `workersEnabled` (skip all) and `enabledWorkers`
 * (skip individual). Always ensures `service.$queues[<name>]` exists so
 * `addJob` works regardless of worker mode.
 */
export function bootQueueWorkers(
  service: QueueAwareService,
  options: BootQueueWorkersOptions,
): void {
  if (!service.schema.queues) return;

  const { workersEnabled, enabledWorkers, queueConfig } = options;

  _forIn(service.schema.queues, (fn: unknown, queueName: string) => {
    // Ensure queue exists for addJob (always needed for job creation,
    // even in API Gateway mode where workers don't boot).
    service.getQueue(queueName);

    // Skip worker creation if workers are disabled (API Gateway mode)
    if (!workersEnabled) {
      service.logger?.info(`⏭️  Skipping worker: ${queueName} (WORKERS_ENABLED=false)`);
      return;
    }

    // Skip worker if not in enabledWorkers list (selective worker mode)
    if (enabledWorkers && !enabledWorkers.has(queueName)) {
      service.logger?.info(`⏭️  Skipping worker: ${queueName} (not in WORKERS)`);
      return;
    }

    const queueFragment = fn as QueueSchemaFragment;

    // Build handlers map for routing (use _originalHandler for proper context)
    const handlersMap = new Map<string, { handler: QueueHandler; concurrency: number }>();
    let maxConcurrency = 1;
    queueFragment.handlers.forEach((handlerConfig) => {
      const handlerName = handlerConfig.name || '*';
      const originalHandler = handlerConfig._originalHandler ?? (handlerConfig.handler as unknown as QueueHandler);
      const concurrency = handlerConfig.concurrency || 1;
      handlersMap.set(handlerName, { handler: originalHandler, concurrency });
      maxConcurrency = Math.max(maxConcurrency, concurrency);
    });

    // Get worker lock configuration with defaults optimized for LLM operations
    const workerLockConfig = queueConfig.workerLock ?? {};
    const lockDuration = workerLockConfig.lockDuration ?? 300000; // 5 minutes default for LLM
    const stalledInterval = workerLockConfig.stalledInterval ?? 60000; // Check every minute
    const lockRenewTime = workerLockConfig.lockRenewTime ?? 30000; // Renew every 30 seconds
    const maxStalledCount = workerLockConfig.maxStalledCount ?? 3; // Mark failed after 3 stalls

    // Create ONE worker per queue with internal routing
    const worker = new Worker(
      queueName,
      async (job: Job) => {
        // Find handler for this job name (exact match or wildcard)
        let handlerConfig = handlersMap.get(job.name);
        if (!handlerConfig) {
          handlerConfig = handlersMap.get('*');
        }

        if (!handlerConfig) {
          throw new Error(`No handler found for job "${job.name}" in queue "${queueName}"`);
        }

        // Extract trace context for child job propagation (safely handle undefined data)
        const jobData = (job.data || {}) as { _traceContext?: QueueTraceContext };
        const traceContext = jobData._traceContext;

        // Build meta for S2S auth: propagate $caller and tenantId from job data
        const jobMeta: Record<string, unknown> = {
          $caller: service.fullName || service.name,
        };
        // Propagate tenantId from job data if available (BullMQ workers don't inherit meta)
        const rawJobData = (job.data || {}) as Record<string, unknown>;
        if (rawJobData.tenantId && typeof rawJobData.tenantId === 'string') {
          jobMeta.tenantId = rawJobData.tenantId;

          // Pre-load tenant config once per job to avoid N+1 in session middleware.
          // Each S2S call from worker inherits this meta, so middleware sees
          // tenantConfigLoaded !== undefined and skips redundant loads.
          try {
            const configResult = (await service.broker.call(
              'v1.tenant-config.get',
              { tenantId: rawJobData.tenantId },
              {
                meta: {
                  $caller: service.fullName || service.name,
                  tenantId: rawJobData.tenantId,
                  tenantConfigLoaded: true,
                },
              },
            )) as { success: boolean; data?: Record<string, unknown> };

            if (configResult.success && configResult.data) {
              jobMeta.tenantConfig = configResult.data;
              jobMeta.tenantConfigLoaded = true;
            } else {
              jobMeta.tenantConfigLoaded = false;
            }
          } catch {
            // Non-fatal: if config service is down, let middleware handle it per-call
            jobMeta.tenantConfigLoaded = false;
          }
        }

        // Call the handler with Orchestra-compatible context.
        // Cast through `any` to bypass `exactOptionalPropertyTypes` friction on
        // QueueHandlerCtx — semantics are preserved (handler sees the same
        // ctx object the original inline implementation built).
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        return (handlerConfig.handler as any).call(service, {
          job,
          // oxlint-disable-next-line @typescript-eslint/no-explicit-any
          call: (action: string, params?: Record<string, any>) =>
            service.broker
              .call(action, params, { meta: jobMeta })
              // oxlint-disable-next-line @typescript-eslint/no-explicit-any
              .then((res: any) => res?.data ?? res),
          logger: service.logger,
          ...(traceContext !== undefined && { traceContext }),
          // Queue methods for dispatching child jobs
          getQueue: (name: string) => service.getQueue(name),
          // oxlint-disable-next-line @typescript-eslint/no-explicit-any
          addJob: async (qName: string, jName: string, data: any, opts?: any) => {
            // Auto-inject parent trace context for distributed tracing
            const enrichedData = traceContext
              ? { _traceContext: traceContext, ...data }
              : data;
            return service.addJob(qName, jName, enrichedData, opts);
          },
        });
      },
      {
        connection: queueConfig.connection,
        concurrency: maxConcurrency,
        ...(queueConfig.prefix !== undefined && { prefix: queueConfig.prefix }),
        // Lock configuration for long-running LLM operations
        lockDuration,
        stalledInterval,
        lockRenewTime,
        maxStalledCount,
      },
    );

    // Attach event handlers to worker
    if (queueFragment.on) {
      Object.entries(queueFragment.on).forEach(([event, eventHandler]) => {
        if (eventHandler) {
          // oxlint-disable-next-line @typescript-eslint/no-explicit-any
          worker.on(event as any, (...args: any[]) => {
            // oxlint-disable-next-line @typescript-eslint/no-explicit-any
            (eventHandler as (...a: any[]) => unknown).call(service, ...args);
          });
        }
      });
    }

    // Store worker for cleanup
    service.$workers[queueName] = worker;

    const handlerNames = Array.from(handlersMap.keys()).join(', ');
    service.logger?.info(
      `🚀 BullMQ Worker started: ${queueName} (handlers: ${handlerNames}, concurrency: ${maxConcurrency})`,
    );
  });
}

/**
 * Stop and detach all BullMQ workers attached to this service. Mirrors the
 * teardown that was previously inline in `ApiController.generateServiceSchema()`
 * `stopped()`.
 */
export async function stopQueueWorkers(service: QueueAwareService): Promise<void> {
  if (!service.$workers) return;

  await Promise.all(
    Object.entries(service.$workers).map(async ([key, worker]) => {
      try {
        // Remove all event listeners to prevent memory leaks
        worker.removeAllListeners();
        await worker.close();
        service.logger?.info(`🛑 BullMQ Worker stopped: ${key}`);
      } catch (error) {
        service.logger?.error(`Error closing worker ${key}:`, error);
      }
      delete service.$workers[key];
    }),
  );
}

/**
 * Close and detach all BullMQ queue instances attached to this service.
 * No-op when there are no queues. Errors are logged per-queue but do not
 * abort the remaining shutdown sequence (matches existing api-core behaviour).
 */
export async function stopQueues(service: QueueAwareService): Promise<void> {
  if (!service.$queues) return;

  await Promise.all(
    Object.entries(service.$queues).map(async ([name, queue]) => {
      try {
        await queue.close();
      } catch (error) {
        service.logger?.error(`Error closing queue ${name}:`, error);
      }
      delete service.$queues[name];
    }),
  );
}
