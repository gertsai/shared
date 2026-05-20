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
 *
 * Wave 24 EVID-078 MED-5 closure: the runner now exposes
 *   - optional `AbortSignal` for cooperative shutdown (SIGINT / SIGTERM
 *     wiring lives in the consumer process; this primitive is signal-
 *     transport agnostic),
 *   - bounded shutdown via `shutdownTimeoutMs` (default 30s) with
 *     `worker.close(true)` force-close fallback,
 *   - default `worker.on('error', ...)` listener so an emitted error
 *     does not crash the host process (Node ≥15 unhandled-emit semantic),
 *   - optional `onError` / `onFailed` / `onCompleted` proxy callbacks for
 *     observability without making consumers reach into BullMQ event
 *     types directly.
 */
import { createWorker, type Job, type QueueConnection, type Worker } from './index';

/**
 * Default shutdown timeout — workers that do not finish closing in this
 * window are force-closed via `worker.close(true)`. Picked to match the
 * common Kubernetes / systemd "default `terminationGracePeriodSeconds`"
 * envelope.
 *
 * @public
 */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000;

/**
 * Structural shape of a logger consumed by the standalone runner.
 * Inlined (no hard import on `@gertsai/logger-factory`) so this package
 * remains peer-dep-free. Any logger that has `.error` and `.warn`
 * methods satisfies the shape — `console` itself works in a pinch.
 *
 * @public
 */
export interface StandaloneLogger {
  readonly error: (message: string, meta?: Record<string, unknown>) => void;
  readonly warn: (message: string, meta?: Record<string, unknown>) => void;
}

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
 *
 * Wave 24 EVID-078 MED-5: `signal`, `shutdownTimeoutMs`, `logger`,
 * `onError`, `onFailed`, `onCompleted` are all additive and optional —
 * existing callers continue to work with `{ queues, connection }` only.
 */
export interface StartStandaloneOpts {
  readonly queues: ReadonlyArray<StandaloneQueueDef>;
  readonly connection: QueueConnection;
  /**
   * Optional AbortSignal. When aborted, the runner triggers `shutdown()`
   * once with the active `shutdownTimeoutMs`. Idempotent — repeated
   * aborts (or an `abort` event after `shutdown()` ran) are no-ops.
   */
  readonly signal?: AbortSignal;
  /**
   * How long `shutdown()` waits for the workers' `close()` promises
   * before force-closing each worker via `close(true)`. Default
   * {@link DEFAULT_SHUTDOWN_TIMEOUT_MS}.
   */
  readonly shutdownTimeoutMs?: number;
  /**
   * Optional logger. When supplied, the runner logs the unhandled-error
   * listener output (and the shutdown timeout warning) here. When
   * omitted, the listener still installs (preventing the process crash)
   * but the runner emits nothing — preserving silent back-compat for
   * existing consumers.
   */
  readonly logger?: StandaloneLogger;
  /**
   * Optional error callback. Called for each `worker.on('error', ...)`
   * emit across every worker. Intended for metrics / Sentry forwarding.
   * Errors thrown inside the callback are swallowed so the listener
   * cannot itself crash the worker.
   */
  readonly onError?: (err: unknown, queueName: string) => void;
  /**
   * Optional failed-job callback. Mirrors BullMQ's `worker.on('failed')`
   * payload (job + error). Errors thrown inside the callback are
   * swallowed.
   */
  readonly onFailed?: (job: Job | undefined, err: unknown, queueName: string) => void;
  /**
   * Optional completed-job callback. Mirrors BullMQ's
   * `worker.on('completed')` payload. Errors thrown inside the callback
   * are swallowed.
   */
  readonly onCompleted?: (job: Job, result: unknown, queueName: string) => void;
}

/**
 * Returned by startStandalone — call `shutdown()` to drain workers.
 *
 * Wave 24 EVID-078 MED-5: `workers` is now exposed so observability /
 * test code can inspect / interact with the underlying Worker instances
 * (e.g. attach extra listeners) without re-wrapping the runner.
 */
export interface StandaloneHandle {
  readonly shutdown: () => Promise<void>;
  /**
   * Read-only view of the workers created during `startStandalone`. Same
   * order as `opts.queues`. Surfaced for observability — `shutdown()`
   * remains the contracted way to stop the runner.
   */
  readonly workers: ReadonlyArray<Worker>;
}

function safeInvoke<TArgs extends readonly unknown[]>(
  fn: ((...args: TArgs) => void) | undefined,
  args: TArgs,
  logger: StandaloneLogger | undefined,
  context: string,
): void {
  if (fn === undefined) return;
  try {
    fn(...args);
  } catch (cbErr) {
    logger?.warn(`@gertsai/queue/standalone: ${context} callback threw`, {
      error: cbErr instanceof Error ? cbErr.message : String(cbErr),
    });
  }
}

/**
 * Start one Worker per queue definition and return a shutdown handle.
 *
 * @param opts - Connection + queue defs + (optional) shutdown ergonomics.
 * @returns A handle with `shutdown()` that closes all workers.
 */
export function startStandalone(opts: StartStandaloneOpts): StandaloneHandle {
  const shutdownTimeoutMs = opts.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const logger = opts.logger;

  const workers: Worker[] = opts.queues.map((q) => {
    const worker = createWorker(
      q.name,
      q.processor as (job: Job<unknown, void>) => Promise<void>,
      {
        connection: opts.connection,
        ...(q.concurrency !== undefined && { concurrency: q.concurrency }),
      },
    );

    // EVID-078 MED-5: always register an `error` listener so an emitted
    // error never crashes the host process under Node ≥15. The listener
    // proxies to `opts.onError` (if any) and `opts.logger.error` (if any);
    // without either, it still silently absorbs the error rather than
    // letting it surface unhandled.
    worker.on('error', (...args: unknown[]) => {
      const err = args[0];
      logger?.error(`@gertsai/queue/standalone: worker '${q.name}' emitted error`, {
        error: err instanceof Error ? err.message : String(err),
      });
      safeInvoke(opts.onError, [err, q.name] as const, logger, 'onError');
    });

    if (opts.onFailed !== undefined) {
      worker.on('failed', (...args: unknown[]) => {
        const job = args[0] as Job | undefined;
        const err = args[1];
        safeInvoke(
          opts.onFailed,
          [job, err, q.name] as const,
          logger,
          'onFailed',
        );
      });
    }

    if (opts.onCompleted !== undefined) {
      worker.on('completed', (...args: unknown[]) => {
        const job = args[0] as Job;
        const result = args[1];
        safeInvoke(
          opts.onCompleted,
          [job, result, q.name] as const,
          logger,
          'onCompleted',
        );
      });
    }

    return worker;
  });

  let shutdownPromise: Promise<void> | undefined;

  async function shutdown(): Promise<void> {
    // Idempotent: repeated calls (signal abort + manual shutdown, or two
    // SIGTERMs) return the same promise instead of re-closing.
    if (shutdownPromise !== undefined) return shutdownPromise;

    shutdownPromise = (async () => {
      const closeAll = Promise.all(workers.map((w) => w.close()));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), shutdownTimeoutMs);
        // Allow the host process to exit even if Worker.close() hangs —
        // shutdown is the last act before exit, we never want this timer
        // to block process termination.
        if (typeof timer.unref === 'function') {
          timer.unref();
        }
      });

      const outcome = await Promise.race([
        closeAll.then(() => 'ok' as const),
        timeout,
      ]);

      if (timer !== undefined) clearTimeout(timer);

      if (outcome === 'timeout') {
        logger?.warn(
          `@gertsai/queue/standalone: graceful shutdown exceeded ${shutdownTimeoutMs}ms — forcing close`,
          { workerCount: workers.length },
        );
        // Force-close (BullMQ Worker.close(true) drops the running job
        // and releases the lock). We await all force-closes but do not
        // bound them further — at this point the process is exiting and
        // any remaining hang is operational, not a runner bug.
        await Promise.allSettled(workers.map((w) => w.close(true)));
      }
    })();

    return shutdownPromise;
  }

  if (opts.signal !== undefined) {
    if (opts.signal.aborted) {
      // Signal already tripped before startStandalone returned — schedule
      // shutdown but don't block the caller; they get the handle.
      void shutdown();
    } else {
      opts.signal.addEventListener(
        'abort',
        () => {
          void shutdown();
        },
        { once: true },
      );
    }
  }

  return {
    shutdown,
    workers,
  };
}
