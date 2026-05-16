import { createRequire } from 'node:module';
import type { CacheLockProvider, UnlockFunction } from './types.js';

const require = createRequire(import.meta.url);

/**
 * Redlock v5 Lock interface.
 */
interface RedlockLock {
  release(): Promise<void>;
}

/**
 * Internal Redlock-like interface (Redlock v5 API).
 */
interface RedlockLike {
  acquire(resources: string[], duration: number): Promise<RedlockLock>;
}

/**
 * Redlock constructor interface.
 */
interface RedlockConstructor {
  new (clients: unknown[], options?: Record<string, unknown>): RedlockLike;
}

/**
 * Options for RedlockLockProvider.
 */
export interface RedlockProviderOptions {
  /** Redis clients (ioredis instances) for Redlock. */
  clients?: unknown[];
  /** Pre-built Redlock instance. */
  redlock?: RedlockLike;
  /** Redlock constructor options (retryCount, retryDelay, etc). */
  options?: Record<string, unknown>;
}

/**
 * No-op lock provider for development/testing.
 * All lock acquisitions succeed immediately.
 */
export class NoopLockProvider implements CacheLockProvider {
  async acquire(_key: string, _ttlMs: number): Promise<UnlockFunction> {
    return () => undefined;
  }

  async tryAcquire(_key: string, _ttlMs: number): Promise<UnlockFunction> {
    return () => undefined;
  }
}

/**
 * Redlock-based distributed lock provider.
 *
 * Uses the Redlock algorithm for distributed locking across multiple Redis instances.
 * Provides both blocking (acquire) and non-blocking (tryAcquire) lock methods.
 *
 * @example
 * ```typescript
 * const redis = new Redis('redis://localhost');
 * const lockProvider = new RedlockLockProvider({
 *   clients: [redis],
 *   options: {
 *     retryCount: 3,
 *     retryDelay: 200,
 *   },
 * });
 *
 * // Use with CacheStore
 * const store = new CacheStore({
 *   driver: new RedisCacheDriver({ client: redis }),
 * });
 *
 * const result = await store.wrap(
 *   'expensive:query',
 *   () => fetchData(),
 *   { lockProvider, lockTtlMs: 10000 }
 * );
 * ```
 */
export class RedlockLockProvider implements CacheLockProvider {
  private readonly redlock: RedlockLike;
  private readonly redlockNonBlocking: RedlockLike;

  constructor(options: RedlockProviderOptions) {
    if (options.redlock) {
      this.redlock = options.redlock;
      this.redlockNonBlocking = options.redlock;
      return;
    }

    const clients = options.clients ?? [];
    if (clients.length === 0) {
      throw new Error('RedlockLockProvider requires at least one Redis client');
    }

    let Redlock: RedlockConstructor;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const redlockModule = require('redlock');
      // Redlock v5 exports default in ESM, handle both cases
      Redlock = redlockModule.default ?? redlockModule;
    } catch {
      throw new Error(
        "The 'redlock' package is required for distributed cache locks. " +
          "Install it with 'pnpm add redlock'.",
      );
    }

    // Blocking Redlock with default retry settings
    this.redlock = new Redlock(clients, options.options);

    // Non-blocking Redlock with no retries
    this.redlockNonBlocking = new Redlock(clients, {
      ...options.options,
      retryCount: 0,
    });
  }

  /**
   * Acquire lock, blocking until available.
   * @returns Unlock function to release the lock.
   */
  async acquire(key: string, ttlMs: number): Promise<UnlockFunction> {
    // Redlock v5 uses acquire(resources[], duration) API
    const lock = await this.redlock.acquire([key], ttlMs);
    return () => lock.release();
  }

  /**
   * Try to acquire lock without blocking.
   *
   * Distinguishes "lock currently held by another client" (returns `null`)
   * from infrastructure failures — Redis unreachable, misconfigured Redlock,
   * network partition (rethrows so the caller can fail fast / fall back
   * deliberately). Wave 12.B-fix-2 (EVID-044 HIGH-1 / defense-in-depth):
   * the previous catch-all swallowed *every* error, which turned a Redis
   * outage into a silent cache-bypass DoS amplifier — every request would
   * see `unlock == null`, skip the lock-protected cache write, and stampede
   * the origin loader.
   *
   * @returns Unlock function if acquired, null if lock is held.
   * @throws Underlying error when the failure is *not* lock contention
   *   (e.g. `ECONNREFUSED`, misconfiguration). Caller decides recovery.
   */
  async tryAcquire(key: string, ttlMs: number): Promise<UnlockFunction | null> {
    try {
      // Redlock v5 uses acquire(resources[], duration) API
      const lock = await this.redlockNonBlocking.acquire([key], ttlMs);
      return () => lock.release();
    } catch (err: unknown) {
      if (this._isLockHeldError(err)) {
        return null; // Expected: lock unavailable, not an infrastructure failure.
      }
      // Unexpected: Redis-down, misconfiguration, network. Surface to caller.
      throw err;
    }
  }

  /**
   * Classify an error thrown by `redlock.acquire(...)` as "lock currently held"
   * vs everything else. Redlock 5.x raises `ResourceLockedError` when a
   * resource is already locked, and `ExecutionError` (with a message
   * mentioning quorum/locked) when retries are exhausted because the
   * quorum was not reached due to contention. Anything else (`ECONNREFUSED`,
   * `Error`, `TypeError`, …) is treated as infrastructure failure.
   */
  private _isLockHeldError(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false;
    const errObj = err as { name?: string; code?: string; message?: string };
    if (errObj.name === 'ResourceLockedError') return true;
    if (errObj.name === 'ExecutionError') {
      const msg = errObj.message ?? '';
      return msg.includes('quorum') || msg.includes('locked');
    }
    return false;
  }
}
