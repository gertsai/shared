// @ts-nocheck — TEMPLATE skeleton: copy into your @gertsai/Moleculer app and adapt the TODOs.
// Imports (@gertsai/*, app-relative paths) resolve only inside a consuming app, not in this repo.
// Some skeletons concatenate several files under "// ===== FILE: <path> =====" banners — split on paste.
// Delete this header once pasted into a real, typed project.
// SPDX-License-Identifier: Apache-2.0
// ============================================================================
// FILE 1 — queues/<feature>.worker.ts
//   Worker registration runs as a MODULE-LOAD SIDE EFFECT. api-core reads the
//   registry when it synthesizes the Moleculer service schema (before broker
//   start), so registration must exist by then — never defer into a lifecycle.
// ============================================================================
import type { QueueHandlerCtx } from '@gertsai/api-core/moleculer';
import type Moleculer from 'moleculer';

import { resolveExampleController } from '../../../../lib/example-controller';
import config from '../../../../../project.config';
import type { MyServiceContext } from '../../types';

// `this` inside the handler = the Moleculer service instance. Combine your
// typed service-context (deps stashed in addStartedHandler) with the bits of
// the Moleculer.Service surface you actually touch.
type MyQueueThis = MyServiceContext & Pick<Moleculer.Service, 'logger' | 'broker'>;

// --- Public contract: queue name, job name, job data/result shapes ---
// Convention: '<service>.<purpose>' keeps queues namespaced on shared Redis.
export const MY_QUEUE_NAME = 'myapp.myqueue' as const;          // TODO rename
export const JOB_DO_WORK = 'do-work' as const;                  // TODO rename

export interface MyJobData {
  // TODO: serializable job payload (goes through Redis — no class instances)
  id: string;
  text: string;
}
export interface MyJobResult {
  id: string;
  count: number;
}

const controller = resolveExampleController<'v1', 'myservice', MyServiceContext>(
  'v1',
  'myservice',
);

// ONE Worker per queue is created by api-core; it routes internally on job.name.
controller.registerWorker(MY_QUEUE_NAME, [
  {
    name: JOB_DO_WORK,
    concurrency: config.WORKER_CONCURRENCY, // TODO from project.config (env-driven)
    // NON-arrow function so `this` binds to the service (api-core calls
    // handler.call(service, ctx)). Arrow functions would lose `this`.
    async handler(
      this: MyQueueThis,
      ctx: QueueHandlerCtx<import('bullmq').Job<MyJobData>>,
    ): Promise<MyJobResult> {
      const { job } = ctx;
      const payload = job.data;

      // Mid-shutdown guard: re-read the flag (a closure, not a one-time read)
      // after each significant await so we abort cleanly during teardown.
      const serviceRef: MyQueueThis = this;
      const isDestroyed = (): boolean =>
        (serviceRef as { _destroyed?: boolean })._destroyed === true;

      this.logger?.info?.(`[myqueue] job ${job.id} (id=${payload.id})`);

      try {
        // TODO delegate to your application use case — keep the worker thin.
        const result = await this.useCase.execute({ id: payload.id, text: payload.text });
        if (isDestroyed()) return { id: result.id, count: result.count };

        // OPTIONAL: publish a durable cross-service event (@moleculer/channels).
        const broker = this.broker as unknown as {
          sendToChannel?: (topic: string, p: Record<string, unknown>) => Promise<void>;
        };
        if (broker?.sendToChannel) {
          await broker.sendToChannel('my.done.channel', { id: result.id, jobId: String(job.id ?? '') });
          if (isDestroyed()) return { id: result.id, count: result.count };
        }

        return { id: result.id, count: result.count };
      } catch (err) {
        // TODO emit any terminal client signal (e.g. SSE error frame) BEFORE
        // the rethrow so the rethrow can trigger BullMQ retry without leaving
        // the client dangling.
        // Convert domain errors so BullMQ records a useful failedReason, then
        // rethrow — BullMQ's defaultJobOptions.attempts/backoff handle retry.
        throw err;
      }
    },
  },
]);

export { controller };

// ============================================================================
// FILE 2 — queues/index.ts  (barrel: side-effect import + public re-exports)
// ============================================================================
import './my-feature.worker'; // side-effect: registers the worker at load time
export {
  MY_QUEUE_NAME,
  JOB_DO_WORK,
  type MyJobData,
  type MyJobResult,
} from './my-feature.worker';

// ============================================================================
// FILE 3 — actions/do-work.action.ts  (PRODUCER side)
//   addJob / getQueue are injected by api-core ONLY when configure({queue})
//   was supplied — mirror that gate with the same env var.
// ============================================================================
import { defineAction } from '@gertsai/api-core/moleculer';
import config from '../../../../../project.config';
import { MY_QUEUE_NAME, JOB_DO_WORK } from '../queues';
// ... controller.register('do-work', { ... handler }) wrapped in defineAction()

const QUEUE_ENABLED = !!config.REDIS_URL; // single switch: queued vs inline

// inside the action handler ({ params, service, addJob, respond }):
//   if (QUEUE_ENABLED) {
//     const job = await addJob(MY_QUEUE_NAME, JOB_DO_WORK, { id, text });
//     return respond({ id, jobId: String(job?.id), mode: 'queued', count: null });
//   }
//   const { count } = await service.useCase.execute({ id, text }); // inline fallback
//   return respond({ id, jobId: `inline-${Date.now()}`, mode: 'inline', count });

// ============================================================================
// FILE 4 — services/index.ts  (CONNECTION + configure — runs ONCE, pre-import)
// ============================================================================
import IORedis from 'ioredis';
import { ApiController, type BullMQConnectionOptions } from '@gertsai/api-core/moleculer';

const queueConfig: BullMQConnectionOptions | undefined = config.REDIS_URL
  ? {
      connection: new IORedis(config.REDIS_URL, {
        maxRetriesPerRequest: null, // REQUIRED by BullMQ
        enableReadyCheck: false,
      }) as unknown as BullMQConnectionOptions['connection'],
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 3_600, count: 1_000 },
        removeOnFail: { age: 86_400 },
      },
      workerLock: { lockDuration: 300_000, stalledInterval: 60_000, lockRenewTime: 30_000, maxStalledCount: 3 },
    }
  : undefined;

ApiController.configure({
  ...(queueConfig && { queue: queueConfig }), // conditional spread → omit key when no Redis
  // ... sessionFactory, etc.
});

import './myservice'; // side-effect import AFTER configure — registers workers

// ============================================================================
// FILE 5 — index.ts  (entry point — worker-mode gating)
// ============================================================================
// await ApiController.Start({
//   brokerConfig,
//   services: [...],
//   workersEnabled: config.WORKERS_ENABLED,        // false => producer-only (API Gateway)
//   ...(enabledWorkers && { enabledWorkers }),     // CSV WORKERS=... => selective worker node
// });
