// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/api-queue — BullMQ queue/worker lifecycle for @gertsai/api-core.
 *
 * Tier-2 package extracted from `@gertsai/api-core/lib/controller/ApiController.class.ts`
 * in Wave 15.B (PRD-051 / EVID-067 §15.B).
 *
 * Surfaces three concerns:
 *  - **types** — `BullMQConnectionOptions`, `ApiControllerRegisteredQueue`,
 *    `QueueProcessingStatus` (32-event union), `QueueHandlerCtx`, etc.
 *  - **schema fragment** — `createQueueSchemaFragment(...)` builds the
 *    Moleculer-service queue block (handlers + tracing-aware wrappers).
 *  - **service methods + lifecycle** — `createQueueServiceMethods(...)`,
 *    `bootQueueWorkers(...)`, `stopQueueWorkers(...)`, `stopQueues(...)`.
 *
 * Selective worker-mode (API Gateway vs Worker Node deployment pattern,
 * per EVID-067 §Doctor Strange #2) is surfaced as `BootQueueWorkersOptions`
 * + documented in `SPEC-018`.
 *
 * @packageDocumentation
 */

// --- Types ---
export type {
  ApiControllerQueues,
  ApiControllerRegisteredQueue,
  BullMQConnectionOptions,
  BullMQWorkerLockOptions,
  CtxLoggerType,
  JobDataWithTraceContext,
  JobStatus,
  QueueActionCallFunction,
  QueueHandler,
  QueueHandlerCtx,
  QueueJob,
  QueueOptions,
  QueueProcessingStatus,
  QueueSchemaFragment,
  QueueServiceSchemaParts,
  QueueTraceContext,
  TracedJobData,
} from './types';

// --- Schema fragment builder ---
export {
  createQueueSchemaFragment,
  type CreateQueueSchemaFragmentOptions,
  type QueueErrorTranslator,
} from './schema';

// --- Service methods factory ---
export {
  createQueueServiceMethods,
  type QueueServiceMethods,
} from './methods';

// --- Worker lifecycle ---
export {
  bootQueueWorkers,
  stopQueueWorkers,
  stopQueues,
  type BootQueueWorkersOptions,
  type QueueAwareService,
} from './lifecycle';
