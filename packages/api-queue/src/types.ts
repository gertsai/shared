// SPDX-License-Identifier: Apache-2.0
/**
 * BullMQ-specific types for @gertsai/api-queue.
 *
 * Extracted from @gertsai/api-core/lib/controller/types.ts in Wave 15.B
 * (PRD-051 / EVID-067 §15.B). api-core keeps these names as re-exports for
 * backward source compat.
 *
 * @packageDocumentation
 */

import type {
  Job,
  Queue,
  JobsOptions,
  ConnectionOptions as BullMQConnectionType,
  Worker,
} from 'bullmq';
import type Moleculer from 'moleculer';
import type { ServiceSchema } from 'moleculer';

// =============================================================================
// Job + Queue primitives
// =============================================================================

/**
 * Job status enum for BullMQ compatibility
 */
export type JobStatus =
  | 'completed'
  | 'waiting'
  | 'active'
  | 'delayed'
  | 'failed'
  | 'paused'
  | 'prioritized'
  | 'waiting-children';

/**
 * BullMQ Worker lock configuration options.
 * These settings control how BullMQ handles job locking and stalled job detection.
 * Important for long-running jobs like LLM operations.
 */
export type BullMQWorkerLockOptions = {
  /**
   * Duration of the lock for the job in milliseconds.
   * The lock prevents other workers from processing the same job.
   * @default 30000 (30 seconds)
   * @example 300000 // 5 minutes for LLM operations
   */
  lockDuration?: number;

  /**
   * Interval in milliseconds at which to check for stalled jobs.
   * A job is considered stalled if it's been locked longer than lockDuration
   * without being renewed.
   * @default 30000 (30 seconds)
   * @example 60000 // Check every minute
   */
  stalledInterval?: number;

  /**
   * How often the lock is renewed in milliseconds.
   * Should be less than lockDuration to prevent premature stalling.
   * @default lockDuration / 2
   * @example 30000 // Renew every 30 seconds
   */
  lockRenewTime?: number;

  /**
   * Maximum number of times a job can be recovered from stalled state.
   * After this limit, the job will be marked as failed.
   * @default 1
   * @example 3 // Mark failed after 3 stalls
   */
  maxStalledCount?: number;
};

/**
 * BullMQ Queue configuration options.
 *
 * Connection supports:
 * - RedisOptions: { host, port, password, db, ... }
 * - ClusterOptions: { host, port, ... } for AWS MemoryDB/ElastiCache
 * - IORedis instance: new IORedis(...)
 * - IORedis.Cluster instance: new Cluster(...)
 */
export type BullMQConnectionOptions = {
  /**
   * Redis connection (BullMQ works ONLY with Redis via ioredis)
   * @see https://docs.bullmq.io/guide/connections
   */
  connection: BullMQConnectionType;
  /** Default job options */
  defaultJobOptions?: JobsOptions;
  /** Queue prefix */
  prefix?: string;
  /**
   * Worker lock configuration for handling long-running jobs.
   * Essential for LLM operations that may take several minutes.
   * @see https://docs.bullmq.io/guide/workers/stalled-jobs
   */
  workerLock?: BullMQWorkerLockOptions;
};

// =============================================================================
// Trace context
// =============================================================================

/**
 * Trace context for distributed tracing through queues.
 * W3C Trace Context compatible format.
 */
export type QueueTraceContext = {
  /** Trace ID (32 hex chars) */
  traceId?: string;
  /** Parent span ID (16 hex chars) */
  parentId?: string;
  /** Whether trace is sampled */
  sampled?: boolean;
  /** W3C traceparent header if available */
  traceparent?: string;
};

/**
 * Job data with optional trace context for distributed tracing.
 * Use this to type job data that includes trace propagation.
 *
 * @example
 * ```typescript
 * type MyJobData = { tenantId?: string; documentId: string };
 * const job: Job<JobDataWithTraceContext<MyJobData>> = ...;
 * const traceContext = job.data._traceContext;
 * ```
 */
export type JobDataWithTraceContext<T = Record<string, unknown>> = T & {
  _traceContext?: QueueTraceContext;
};

/**
 * Utility type for traced job data in queue handlers.
 * Shorthand for adding _traceContext to any job data type.
 */
export type TracedJobData<T> = T & { _traceContext?: QueueTraceContext };

// =============================================================================
// Logger surface (intentionally narrow — same shape as api-core CtxLoggerType)
// =============================================================================

export type CtxLoggerType = {
  info: (...args: any[]) => void;
  error: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  trace: (...args: any[]) => void;
};

// =============================================================================
// Queue handler context + handler signatures
// =============================================================================

/**
 * Type alias for queue-action call function. Re-declared here to avoid a
 * circular dep on api-core's `RegisteredActions` declaration-merge target.
 * api-core's QueueActionCallFunction is the public one with full inference.
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
export type QueueActionCallFunction = (
  path: string,
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  params?: Record<string, any>,
  options?: Moleculer.CallingOptions,
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

export type QueueHandlerCtx<T extends Job = Job> = {
  call: QueueActionCallFunction;
  job: T;
  logger: CtxLoggerType;
  meta?: {
    user_uuid: string;
    user_type: string;
  };
  /**
   * Trace context propagated from parent request.
   * Use this to link queue job spans to the original request trace.
   */
  traceContext?: QueueTraceContext;
  /**
   * Get a queue by name to add child jobs.
   * Use this to dispatch follow-up jobs from within a queue handler.
   */
  getQueue: (name: string) => Queue;
  /**
   * Add a job to a queue with trace context auto-injection.
   */
  addJob: <TData>(
    queueName: string,
    jobName: string,
    data: TData,
    options?: JobsOptions,
  ) => Promise<Job<TData>>;
};

/**
 * Queue handler
 */
export type QueueHandler<T extends Job = Job> = (params: QueueHandlerCtx<T>) => any;

// =============================================================================
// Queue registration
// =============================================================================

/**
 * Parameters to transfer to the queue
 */
export type QueueOptions<
  QueueName extends string,
  Concurrency extends number,
  Handler extends QueueHandler<T> = any,
  T extends Job = Job,
> = {
  name: QueueName;
  concurrency: Concurrency;
  handler: Handler;
};

/**
 * The type of queue registration in the API controller
 */
export type ApiControllerRegisteredQueue<
  Name extends string,
  Concurrency extends number,
  QueueStatusType extends QueueProcessingStatus = any,
  T extends Job = Job,
> = {
  name: Name;
  handlers: QueueOptions<Name, Concurrency, QueueHandler<T>, T>[];
  /**
   * Event handlers
   */
  on?: QueueStatusType;
};

/**
 * Registered queues in the controller
 */
export type ApiControllerQueues = Record<string, ApiControllerRegisteredQueue<any, any>>;

/**
 * Snapshot/view of a BullMQ job as the consumer typically reads it. Kept for
 * source-level back-compat with api-core.
 */
export type QueueJob = {
  queue: Queue;
  name: string;
  opts: {
    delay: number;
    attempts: number;
    timestamp: number;
    backoff: undefined | any;
  };
  data: any;
  _progress: number;
  delay: number;
  timestamp: number;
  stacktrace: any[];
  returnvalue: any | null;
  attemptsMade: number;
  toKey: any[];
  id: string | number;
  processedOn: number;
  failedReason: any | undefined;
};

// =============================================================================
// Queue status event surface (32 events)
// =============================================================================

/**
 * Queue Status Handlers
 */
export type QueueProcessingStatus = {
  /**
   * A Job is waiting to be processed as soon as a worker is idling.
   * @param id - Job id string
   */
  waiting?: (this: Moleculer.Service, jobId: string) => void;

  /**
   * A job has been marked as stalled. This is useful for debugging job workers that crash or pause the event loop.
   * @param jobId
   */
  stalled?: (this: Moleculer.Service, job: Job) => void;

  /**
   * A job has started. You can use `jobPromise.cancel()`` to abort it.
   * @param job - Job object
   * @param data - Job data object
   * @param status - Job status
   */
  active?: (this: Moleculer.Service, job: Job, data: any, status: JobStatus) => void;

  /**
   * A job successfully completed with a `result`.
   * @param job
   * @param result - result job
   * @param status - status job
   */
  completed?: (this: Moleculer.Service, job: Job, result: any, status: JobStatus) => void;

  /**
   * Will listen globally, to instances of this queue...
   * @param job - Job object
   * @param progress - Progress value
   */
  globalСompleted?: (job: Job, progress: number) => any;

  /**
   * A job failed with reason `error`!
   * @param job - Job object
   * @param error - Error object
   */
  failed?: (this: Moleculer.Service, job: Job, error: Error) => void;

  /**
   * Delayoed job
   * @param job - Job object
   */
  delayed?: (this: Moleculer.Service, job: Job) => void;

  /**
   * The queue has been paused.
   * @param job - Job object
   */
  paused?: (this: Moleculer.Service, job: Job) => void;

  /**
   * An error occured.
   * @param error - Error object
   */
  error?: (this: Moleculer.Service, error: Error) => any;

  /**
   * A job successfully removed.
   * @param job - Job object
   */
  removed?: (this: Moleculer.Service, job: Job) => any;

  /**
   * Emitted every time the queue has processed all the waiting jobs (even if there can be some delayed jobs not yet processed)
   */
  drained?: (this: Moleculer.Service) => any;

  /**
   * Old jobs have been cleaned from the queue. `jobs` is an array of cleaned jobs, and `type` is the type of jobs cleaned.
   */
  cleaned?: (this: Moleculer.Service) => any;

  /**
   * A job's progress was updated!
   * @param job - Job object
   * @param progress - Progress value
   */
  progress?: (this: Moleculer.Service, job: Job, progress: number) => any;

  /**
   * whereas global events only pass the job ID:
   * @param job - Job object
   * @param progress - Progress value
   */
  globalProgress?: (this: Moleculer.Service, job: Job, progress: number) => any;

  /**
   * The queue has been resumed.
   * @param job - Job object
   */
  resumed?: (this: Moleculer.Service, job: Job) => any;

  /**
   * A job failed to extend lock. This will be useful to debug redis connection issues and jobs getting restarted because workers are not able to extend locks.
   * @param job - Job object
   */
  lockExtensionFailed?: (this: Moleculer.Service, job: Job, error: Error) => any;
};

// =============================================================================
// Service-schema queue surface (the queue/worker slots api-core attaches)
// =============================================================================

/**
 * Schema fragment representing a single queue's runtime configuration —
 * what gets attached to the synthesized Moleculer service schema's `queues`
 * field by `createQueueSchemaFragment(...)`.
 *
 * Mirrors the original inline shape api-core was building, kept loose so
 * tracing / on / `_originalHandler` fields can ride along without changing
 * the public surface.
 */
export type QueueSchemaFragment = {
  name?: string;
  on?: QueueProcessingStatus;
  handlers: Array<{
    name?: string;
    concurrency?: number;
    _originalHandler: QueueHandler;
    handler: (this: Moleculer.Service, job: Job) => Promise<unknown>;
  }>;
};

/**
 * Service-schema mixin contributed by `@gertsai/api-queue` on top of stock
 * Moleculer `ServiceSchema`.
 *
 * - `queues` — opt-in queue registry (filled by `createQueueSchemaFragment`).
 * - `$queues` / `$workers` — runtime state slots populated in `started()`.
 *
 * api-core's `CoreServiceSchema` extends this so consumers don't have to
 * import this type directly.
 */
export interface QueueServiceSchemaParts extends ServiceSchema {
  queues?: ApiControllerQueues;
  $queues: Record<string, Queue>;
  $workers: Record<string, Worker>;
}
