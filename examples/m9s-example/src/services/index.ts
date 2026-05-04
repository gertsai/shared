/**
 * Top-level services barrel — m9s-example.
 *
 * Mirrors `apps/pipeline/src/services/index.ts`:
 *
 *   1. Build BullMQ connection from project config (only when REDIS_URL is set;
 *      otherwise the example runs in single-process mode without queues).
 *   2. Call `ApiController.configure({ queue: queueConfig, sessionFactory })`
 *      BEFORE any service is imported — the configure call seeds the static
 *      registry that `controller.registerWorker(...)` writes into and that
 *      api-core consumes when it builds the Moleculer service schema.
 *   3. Side-effect imports of every domain service — each module attaches
 *      its lifecycle handlers and worker registrations as a side effect.
 *
 * Importing this module from `src/index.ts` is what makes the controllers
 * discoverable when `ApiController.Start` later iterates them.
 */
import IORedis from 'ioredis';

import { ApiController, type BullMQConnectionOptions } from '@gertsai/api-core';
import { defaultSession, UserType } from '@gertsai/core';

import config from '../../project.config';

// =============================================================================
// 1. Optional BullMQ connection (only when REDIS_URL is configured).
// =============================================================================

const queueConfig: BullMQConnectionOptions | undefined = config.REDIS_URL
  ? {
      connection: new IORedis(config.REDIS_URL, {
        maxRetriesPerRequest: null, // required by BullMQ
        enableReadyCheck: false,
      }) as unknown as BullMQConnectionOptions['connection'],
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 3_600, count: 1_000 },
        removeOnFail: { age: 86_400 },
      },
      // Tweak worker locking for long-running ingest jobs.
      workerLock: {
        lockDuration: 300_000, // 5 min — same default api-core ships
        stalledInterval: 60_000,
        lockRenewTime: 30_000,
        maxStalledCount: 3,
      },
    }
  : undefined;

if (queueConfig) {
  // eslint-disable-next-line no-console
  console.log(`[m9s-example] BullMQ connection ready (REDIS_URL=${config.REDIS_URL})`);
} else {
  // eslint-disable-next-line no-console
  console.log(
    '[m9s-example] REDIS_URL not set — running without BullMQ. ' +
      'Action handlers fall back to synchronous use-case execution.',
  );
}

// =============================================================================
// 2. ApiController.configure — runs ONCE, before service imports.
// =============================================================================

ApiController.configure({
  // Same shape pipeline uses (`apps/pipeline/src/services/index.ts`):
  //   sessionFactory: (uid, type) => defaultSession(uid, type, 'api', version)
  // Cast required due to monorepo type-resolution quirks already documented
  // in pipeline.
  sessionFactory: ((user_uuid: string, user_type: UserType) =>
    defaultSession(user_uuid, user_type, 'api', config.APP_VERSION)) as never,

  ...(queueConfig && { queue: queueConfig }),

  // Strict response validation in dev mode — same toggle pipeline uses.
  strictResponseValidation: process.env.NODE_ENV === 'development',
});

// =============================================================================
// 3. Side-effect imports — register controllers + lifecycle + workers.
// =============================================================================

import './ingest';
import './search';

// Namespace re-exports for OpenAPI generators / typed clients.
// oxlint-disable import/no-namespace
export * as ingest from './ingest';
export * as search from './search';
