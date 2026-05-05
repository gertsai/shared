// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/queue/standalone — headless worker runner.
 *
 * Run BullMQ workers without a full Moleculer broker boot. Per PRD-001 FR-019.
 *
 * Useful for "API gateway off, workers on" deployments where a separate
 * process consumes queues but does not serve HTTP. ApiController BullMQ
 * migration to consume this primitive is a Sprint 3.x follow-up
 * (out of scope for the initial @gertsai/queue release).
 */
import type { Job } from 'bullmq';
import { createWorker, type QueueConnection } from './index';

/**
 * Single queue + processor binding for the standalone runner.
 */
export interface StandaloneQueueDef {
  readonly name: string;
  readonly processor: (job: Job) => Promise<unknown>;
  readonly concurrency?: number;
}

/**
 * Aggregate startup options.
 */
export interface StartStandaloneOpts {
  readonly queues: ReadonlyArray<StandaloneQueueDef>;
  readonly connection: QueueConnection;
}

/**
 * Returned by startStandalone — call `shutdown()` to drain workers.
 */
export interface StandaloneHandle {
  readonly shutdown: () => Promise<void>;
}

/**
 * Start one Worker per queue definition and return a shutdown handle.
 *
 * @param opts - Connection + queue defs.
 * @returns A handle with `shutdown()` that closes all workers.
 */
export function startStandalone(opts: StartStandaloneOpts): StandaloneHandle {
  const workers = opts.queues.map((q) =>
    createWorker(q.name, q.processor as (job: Job<unknown, void>) => Promise<void>, {
      connection: opts.connection,
      concurrency: q.concurrency,
    }),
  );

  return {
    shutdown: async () => {
      await Promise.all(workers.map((w) => w.close()));
    },
  };
}
