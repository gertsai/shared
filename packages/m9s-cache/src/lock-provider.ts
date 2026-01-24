import { createRequire } from 'node:module';
import type { CacheLockProvider } from './types';

interface RedlockLike {
  lock(resource: string, ttl: number): Promise<{ unlock: () => Promise<void> }>;
}

interface RedlockConstructor {
  new (clients: unknown[], options?: Record<string, unknown>): RedlockLike;
}

export interface RedlockProviderOptions {
  /** Redlock clients (ioredis instances). */
  clients?: unknown[];
  /** Prebuilt Redlock instance. */
  redlock?: RedlockLike;
  /** Redlock constructor options. */
  options?: Record<string, unknown>;
}

/**
 * No-op lock provider.
 */
export class NoopLockProvider implements CacheLockProvider {
  async acquire(): Promise<() => void> {
    return () => undefined;
  }

  async tryAcquire(): Promise<() => void> {
    return () => undefined;
  }
}

/**
 * Redlock-based distributed lock provider.
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
    const require = createRequire(import.meta.url);
    let Redlock: RedlockConstructor;

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      Redlock = require('redlock');
    } catch (err) {
      throw new Error(
        "The 'redlock' package is required for distributed cache locks. Install it with 'pnpm add redlock'.",
      );
    }

    this.redlock = new Redlock(clients, options.options);
    this.redlockNonBlocking = new Redlock(clients, { ...options.options, retryCount: 0 });
  }

  async acquire(key: string, ttlMs: number): Promise<() => Promise<void>> {
    const lock = await this.redlock.lock(key, ttlMs);
    return () => lock.unlock();
  }

  async tryAcquire(key: string, ttlMs: number): Promise<(() => Promise<void>) | null> {
    try {
      const lock = await this.redlockNonBlocking.lock(key, ttlMs);
      return () => lock.unlock();
    } catch {
      return null;
    }
  }
}
