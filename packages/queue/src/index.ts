// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/queue — BullMQ wrapper primitives.
 *
 * Lazy peer-deps on `bullmq` and `ioredis`. Consumers without queue needs do
 * not pay for package weight. Per PRD-001 FR-019 + ADR-004 (Preserve-history
 * + fresh boundary; replaces unifying with @gertsai/api-core BullMQ runtime —
 * import direction: @gertsai/queue is consumed BY api-core, not vice versa).
 *
 * Wave 12.C-fix-2 (FR-001): bullmq types are inlined as minimal structural
 * interfaces so consumers do NOT need to `pnpm add bullmq` for `.d.ts`
 * resolution. The runtime path still lazy-`require`s bullmq via {@link
 * loadBullmq}; only the type surface is local now.
 */

/**
 * Minimal Redis connection descriptor accepted by createQueue/createWorker.
 *
 * Wraps BullMQ's ConnectionOptions surface with the fields ApiController v0.x
 * already passes. Consumers that need full ioredis options can construct an
 * ioredis instance themselves and pass it through bullmq directly — this
 * primitive intentionally keeps the public surface narrow.
 */
export interface QueueConnection {
  readonly host: string;
  readonly port: number;
  readonly password?: string;
  readonly db?: number;
}

/**
 * Inlined structural mirror of BullMQ's `ConnectionOptions` (the subset we
 * construct internally). Kept local per Wave 12.C-fix-2 (FR-001) so
 * `dist/index.d.ts` does not re-export the bullmq type.
 *
 * @public
 */
export interface ConnectionOptions {
  readonly host?: string;
  readonly port?: number;
  readonly password?: string;
  readonly db?: number;
  readonly tls?: boolean | Record<string, unknown>;
}

/**
 * Opaque pass-through bag for BullMQ default job options. Treated as an
 * untyped record at the @gertsai/queue boundary — consumers that need the
 * full BullMQ shape should import it from bullmq directly.
 *
 * @public
 */
export type DefaultJobOptions = Record<string, unknown>;

/**
 * Options forwarded to BullMQ's `new Queue()`.
 */
export interface QueueOpts {
  readonly connection: QueueConnection;
  readonly defaultJobOptions?: DefaultJobOptions;
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
 * Inlined minimal structural mirror of BullMQ's `Job` (Wave 12.C-fix-2 /
 * FR-001). Only fields actually consumed by `@gertsai/queue` consumers via
 * the processor signature are typed here; everything else is reachable by
 * casting to the bullmq type directly.
 *
 * @public
 */
export interface Job<DataType = unknown, ReturnType = unknown> {
  readonly id?: string;
  readonly name: string;
  readonly data: DataType;
  readonly returnvalue?: ReturnType;
}

/**
 * Inlined minimal structural mirror of BullMQ's `Queue` (Wave 12.C-fix-2 /
 * FR-001). Surface is intentionally narrow — just what consumers reach for
 * through this package; deeper BullMQ APIs require importing bullmq itself.
 *
 * @public
 */
export interface Queue<DataType = unknown, ReturnType = unknown> {
  readonly name: string;
  add(
    name: string,
    data: DataType,
    opts?: Record<string, unknown>,
  ): Promise<Job<DataType, ReturnType>>;
  close(): Promise<void>;
}

/**
 * Inlined minimal structural mirror of BullMQ's `Worker` (Wave 12.C-fix-2 /
 * FR-001). Includes the lifecycle + event hooks that ApiController v0.x and
 * the standalone runner consume.
 *
 * @public
 */
export interface Worker<DataType = unknown, ReturnType = unknown> {
  readonly name: string;
  close(force?: boolean): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): this;
  // Tag is required so generic instantiation tracks DataType/ReturnType.
  readonly __dataType?: DataType;
  readonly __returnType?: ReturnType;
}

/**
 * Inlined `QueueOptions` mirror — kept for backward source compat where the
 * old name was used as a generic alias. Mirrors the actually-consumed shape.
 *
 * @public
 */
export interface QueueOptions {
  readonly connection?: ConnectionOptions;
  readonly defaultJobOptions?: DefaultJobOptions;
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

// Minimal structural shape of the bullmq module surface this package touches.
// Typed as `unknown`-bearing constructors at the boundary — the casts below
// land on the local `Queue<T>` / `Worker<T, R>` interfaces so callers never
// see the bullmq nominal types.
interface BullmqModule {
  readonly Queue: new (name: string, opts: Record<string, unknown>) => unknown;
  readonly Worker: new (
    name: string,
    processor: (job: unknown) => Promise<unknown>,
    opts: Record<string, unknown>,
  ) => unknown;
}

/**
 * Default bullmq loader. Kept as a function (not top-level import) so that
 * consumers who never call createQueue/createWorker do not pay for the
 * BullMQ initialization cost.
 */
function defaultLoadBullmq(): BullmqModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('bullmq') as BullmqModule;
  } catch {
    throw new QueuePeerDepMissingError();
  }
}

let activeLoader: () => BullmqModule = defaultLoadBullmq;

/**
 * Lazy-load bullmq. Throws QueuePeerDepMissingError if not installed.
 */
function loadBullmq(): BullmqModule {
  return activeLoader();
}

/**
 * Test-only seam — replace the bullmq loader with a stub so unit tests can
 * inspect the constructor options passed to `new Worker(...)` / `new
 * Queue(...)` without spinning up a real Redis. Pass `null` (or omit) to
 * restore the default `require('bullmq')` loader.
 *
 * **NOT part of the public API.** The double-underscore prefix marks this
 * as internal; tooling that surfaces typed exports should ignore it.
 *
 * @internal
 */
export function __setBullmqLoaderForTesting(loader: (() => BullmqModule) | null): void {
  activeLoader = loader ?? defaultLoadBullmq;
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
    ...(opts.connection.password !== undefined && { password: opts.connection.password }),
    ...(opts.connection.db !== undefined && { db: opts.connection.db }),
  };
  const instance = new bullmq.Queue(name, {
    connection,
    ...(opts.defaultJobOptions !== undefined && { defaultJobOptions: opts.defaultJobOptions }),
  });
  return instance as Queue<T>;
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
  // Wave 12.C-fix-2 (FR-008): mirror createQueue's conditional-spread pattern
  // so undefined fields do not surface in the constructed BullMQ options.
  const connection: ConnectionOptions = {
    host: opts.connection.host,
    port: opts.connection.port,
    ...(opts.connection.password !== undefined && { password: opts.connection.password }),
    ...(opts.connection.db !== undefined && { db: opts.connection.db }),
  };
  const instance = new bullmq.Worker(
    name,
    processor as (job: unknown) => Promise<unknown>,
    {
      connection,
      ...(opts.concurrency !== undefined && { concurrency: opts.concurrency }),
    },
  );
  return instance as Worker<T, R>;
}
