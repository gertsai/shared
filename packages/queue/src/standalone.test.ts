// SPDX-License-Identifier: Apache-2.0
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { __setBullmqLoaderForTesting, type Job } from './index';
import { DEFAULT_SHUTDOWN_TIMEOUT_MS, startStandalone } from './standalone';

describe('@gertsai/queue/standalone', () => {
  it('exports startStandalone function', () => {
    expect(typeof startStandalone).toBe('function');
  });

  it('exports DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000', () => {
    expect(DEFAULT_SHUTDOWN_TIMEOUT_MS).toBe(30_000);
  });

  it('startStandalone returns a handle with shutdown function (empty queues)', async () => {
    // With an empty queues array, createWorker is never invoked, so we never
    // touch BullMQ — verifies the runner shape without requiring Redis.
    const handle = startStandalone({
      queues: [],
      connection: { host: 'localhost', port: 6379 },
    });
    expect(typeof handle.shutdown).toBe('function');
    expect(handle.workers).toEqual([]);
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Wave 24 EVID-078 MED-5 — graceful shutdown ergonomics
// ---------------------------------------------------------------------------

interface StubWorker {
  readonly name: string;
  close: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  closed: boolean;
  forceClosed: boolean;
  emit(event: string, ...args: unknown[]): void;
  __listeners: Map<string, Array<(...args: unknown[]) => void>>;
}

const stubWorkers: StubWorker[] = [];

function makeStubBullmq(closeDelayMs = 0): {
  Queue: new (name: string) => unknown;
  Worker: new (name: string) => unknown;
} {
  return {
    Queue: class {
      constructor(public readonly name: string) {}
      async close(): Promise<void> {
        return undefined;
      }
    },
    Worker: class {
      public readonly name: string;
      public closed = false;
      public forceClosed = false;
      public readonly __listeners = new Map<
        string,
        Array<(...args: unknown[]) => void>
      >();
      public close: ReturnType<typeof vi.fn>;
      public on: ReturnType<typeof vi.fn>;

      constructor(name: string) {
        this.name = name;
        this.close = vi.fn(async (force?: boolean) => {
          if (force === true) this.forceClosed = true;
          if (closeDelayMs > 0 && force !== true) {
            await new Promise((r) => setTimeout(r, closeDelayMs));
          }
          this.closed = true;
        });
        this.on = vi.fn((event: string, fn: (...args: unknown[]) => void) => {
          const arr = this.__listeners.get(event) ?? [];
          arr.push(fn);
          this.__listeners.set(event, arr);
          return this;
        });
        stubWorkers.push(this as unknown as StubWorker);
      }

      emit(event: string, ...args: unknown[]): void {
        for (const fn of this.__listeners.get(event) ?? []) fn(...args);
      }
    },
  };
}

const noopProcessor = async (_job: Job): Promise<void> => undefined;

describe('@gertsai/queue/standalone — Wave 24 EVID-078 MED-5', () => {
  beforeEach(() => {
    stubWorkers.length = 0;
  });

  afterEach(() => {
    __setBullmqLoaderForTesting(null);
  });

  it('registers a default worker.on("error") listener (no logger required)', () => {
    __setBullmqLoaderForTesting(() => makeStubBullmq());
    const handle = startStandalone({
      queues: [{ name: 'q1', processor: noopProcessor }],
      connection: { host: 'localhost', port: 6379 },
    });
    expect(handle.workers).toHaveLength(1);
    const w = stubWorkers[0];
    expect(w.on).toHaveBeenCalledWith('error', expect.any(Function));
    // Emitting an error must not throw — host process protection.
    expect(() => w.emit('error', new Error('boom'))).not.toThrow();
  });

  it('routes worker errors to logger.error + onError callback', () => {
    __setBullmqLoaderForTesting(() => makeStubBullmq());
    const logger = { error: vi.fn(), warn: vi.fn() };
    const onError = vi.fn();
    startStandalone({
      queues: [{ name: 'q1', processor: noopProcessor }],
      connection: { host: 'localhost', port: 6379 },
      logger,
      onError,
    });
    const w = stubWorkers[0];
    const err = new Error('worker boom');
    w.emit('error', err);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(err, 'q1');
  });

  it('swallows onError callback exceptions (cannot crash worker)', () => {
    __setBullmqLoaderForTesting(() => makeStubBullmq());
    const logger = { error: vi.fn(), warn: vi.fn() };
    const onError = vi.fn(() => {
      throw new Error('observability mistake');
    });
    startStandalone({
      queues: [{ name: 'q1', processor: noopProcessor }],
      connection: { host: 'localhost', port: 6379 },
      logger,
      onError,
    });
    const w = stubWorkers[0];
    expect(() => w.emit('error', new Error('upstream'))).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('onError callback threw'),
      expect.any(Object),
    );
  });

  it('proxies failed + completed events when callbacks supplied', () => {
    __setBullmqLoaderForTesting(() => makeStubBullmq());
    const onFailed = vi.fn();
    const onCompleted = vi.fn();
    startStandalone({
      queues: [{ name: 'q1', processor: noopProcessor }],
      connection: { host: 'localhost', port: 6379 },
      onFailed,
      onCompleted,
    });
    const w = stubWorkers[0];
    const job = { id: 'j1', name: 'work', data: {} };
    const failure = new Error('failed');
    const result = { ok: true };
    w.emit('failed', job, failure);
    w.emit('completed', job, result);
    expect(onFailed).toHaveBeenCalledWith(job, failure, 'q1');
    expect(onCompleted).toHaveBeenCalledWith(job, result, 'q1');
  });

  it('triggers shutdown when AbortSignal aborts', async () => {
    __setBullmqLoaderForTesting(() => makeStubBullmq());
    const ac = new AbortController();
    const handle = startStandalone({
      queues: [{ name: 'q1', processor: noopProcessor }],
      connection: { host: 'localhost', port: 6379 },
      signal: ac.signal,
    });
    ac.abort();
    // Allow the microtask + abort handler to flush.
    await handle.shutdown();
    expect(stubWorkers[0].close).toHaveBeenCalled();
    expect(stubWorkers[0].closed).toBe(true);
  });

  it('shutdown() is idempotent (signal abort + manual shutdown share the same promise)', async () => {
    __setBullmqLoaderForTesting(() => makeStubBullmq());
    const ac = new AbortController();
    const handle = startStandalone({
      queues: [{ name: 'q1', processor: noopProcessor }],
      connection: { host: 'localhost', port: 6379 },
      signal: ac.signal,
    });
    ac.abort();
    const p1 = handle.shutdown();
    const p2 = handle.shutdown();
    await Promise.all([p1, p2]);
    // close() called exactly once — second call short-circuits via cached promise.
    expect(stubWorkers[0].close).toHaveBeenCalledTimes(1);
  });

  it('force-closes workers when shutdown exceeds shutdownTimeoutMs', async () => {
    // Make the graceful close hang for longer than the timeout.
    __setBullmqLoaderForTesting(() => makeStubBullmq(50));
    const logger = { error: vi.fn(), warn: vi.fn() };
    const handle = startStandalone({
      queues: [{ name: 'q1', processor: noopProcessor }],
      connection: { host: 'localhost', port: 6379 },
      shutdownTimeoutMs: 5,
      logger,
    });
    await handle.shutdown();
    // Either close was called with `true` (force) at some point, or the
    // force-close branch ran — both close() invocations land on the same mock.
    expect(stubWorkers[0].close).toHaveBeenCalled();
    expect(stubWorkers[0].forceClosed).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('exceeded 5ms'),
      expect.any(Object),
    );
  });

  it('handles already-aborted signal at start (schedules shutdown immediately)', async () => {
    __setBullmqLoaderForTesting(() => makeStubBullmq());
    const ac = new AbortController();
    ac.abort(); // pre-abort
    const handle = startStandalone({
      queues: [{ name: 'q1', processor: noopProcessor }],
      connection: { host: 'localhost', port: 6379 },
      signal: ac.signal,
    });
    await handle.shutdown();
    expect(stubWorkers[0].close).toHaveBeenCalled();
  });
});
