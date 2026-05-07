// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/queue — BullMQ wrapper primitives.
 *
 * Lazy peer-deps on `bullmq` and `ioredis`. Consumers without queue needs do
 * not pay for package weight. Per PRD-001 FR-019 + ADR-004 (Preserve-history
 * + fresh boundary; replaces unifying with @gertsai/api-core BullMQ runtime —
 * import direction: @gertsai/queue is consumed BY api-core, not vice versa).
 */
import type {
  Queue,
  Worker,
  Job,
  ConnectionOptions,
  QueueOptions,
  WorkerOptions,
} from 'bullmq';

/**
 * Minimal Redis connection descriptor accepted by createQueue/createWorker.
 *
 * Wraps BullMQ's ConnectionOptions surface with the four fields ApiController
 * v0.x already passes. Consumers that need full ioredis options can construct
 * an ioredis instance themselves and pass it through bullmq directly — this
 * primitive intentionally keeps the public surface narrow.
 */
export interface QueueConnection {
  readonly host: string;
  readonly port: number;
  readonly password?: string;
  readonly db?: number;
}

/**
 * Options forwarded to BullMQ's `new Queue()`.
 */
export interface QueueOpts {
  readonly connection: QueueConnection;
  readonly defaultJobOptions?: QueueOptions['defaultJobOptions'];
}

/**
 * Options forwarded to BullMQ's `new Worker()`.
 *
 * @typeParam T - Job data shape.
 * @typeParam R - Job return shape (worker processor return type).
 */
// _T and _R reserved for future generic worker-options surface (lockDuration,
// stalledInterval, maxStalledCount). Currently only `concurrency` is exposed.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface WorkerOpts<_T = unknown, _R = unknown> extends QueueOpts {
  readonly concurrency?: number;
}

/**
 * Thrown when the optional peer dependency `bullmq` is not installed.
 *
 * Consumers must `pnpm add bullmq ioredis` to use createQueue/createWorker.
 */
export class QueuePeerDepMissingError extends Error {
  constructor() {
    super(
      `@gertsai/queue: missing optional peer dep 'bullmq'. Install: pnpm add bullmq ioredis`,
    );
    this.name = 'QueuePeerDepMissingError';
  }
}

/**
 * Lazy-require bullmq. Throws QueuePeerDepMissingError if not installed.
 *
 * Kept as a function (not top-level import) so that consumers who never call
 * createQueue/createWorker do not pay for the BullMQ initialization cost.
 */
function loadBullmq(): typeof import('bullmq') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('bullmq') as typeof import('bullmq');
  } catch {
    throw new QueuePeerDepMissingError();
  }
}

/**
 * Create a BullMQ Queue with a normalized connection descriptor.
 *
 * @param name - Queue name (visible in Redis as `bull:<name>:*`).
 * @param opts - Connection + default job options.
 * @returns A BullMQ Queue instance, ready for `.add()`.
 * @throws {QueuePeerDepMissingError} if `bullmq` is not installed.
 */
export function createQueue<T = unknown>(name: string, opts: QueueOpts): Queue<T> {
  const bullmq = loadBullmq();
  const connection: ConnectionOptions = {
    host: opts.connection.host,
    port: opts.connection.port,
    password: opts.connection.password,
    db: opts.connection.db,
  };
  return new bullmq.Queue<T>(name, {
    connection,
    defaultJobOptions: opts.defaultJobOptions,
  });
}

/**
 * Create a BullMQ Worker with a normalized connection descriptor.
 *
 * @param name - Queue name to consume from.
 * @param processor - Async function invoked per job.
 * @param opts - Connection + concurrency.
 * @returns A BullMQ Worker instance, already started.
 * @throws {QueuePeerDepMissingError} if `bullmq` is not installed.
 */
export function createWorker<T = unknown, R = void>(
  name: string,
  processor: (job: Job<T, R>) => Promise<R>,
  opts: WorkerOpts<T, R>,
): Worker<T, R> {
  const bullmq = loadBullmq();
  const connection: ConnectionOptions = {
    host: opts.connection.host,
    port: opts.connection.port,
    password: opts.connection.password,
    db: opts.connection.db,
  };
  return new bullmq.Worker<T, R>(name, processor, {
    connection,
    concurrency: opts.concurrency,
  } as WorkerOptions);
}

export type { Queue, Worker, Job, ConnectionOptions } from 'bullmq';
