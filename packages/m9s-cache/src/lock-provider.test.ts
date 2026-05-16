import { describe, expect, it, vi } from 'vitest';
import { NoopLockProvider, RedlockLockProvider } from './lock-provider';

describe('NoopLockProvider', () => {
  it('always grants acquire', async () => {
    const provider = new NoopLockProvider();
    const unlock = await provider.acquire('key', 1000);
    expect(typeof unlock).toBe('function');
    await unlock();
  });

  it('always grants tryAcquire', async () => {
    const provider = new NoopLockProvider();
    const unlock = await provider.tryAcquire('key', 1000);
    expect(typeof unlock).toBe('function');
    if (unlock) await unlock();
  });
});

describe('RedlockLockProvider.tryAcquire (Wave 12.B-fix-2 — error classification)', () => {
  /**
   * Build a RedlockLockProvider over a mock Redlock instance that we control.
   * The constructor accepts `redlock` directly so we can inject behaviour
   * per-test without depending on the real `redlock` package or Redis.
   */
  function buildProvider(acquireImpl: () => Promise<unknown>): RedlockLockProvider {
    const mockRedlock = { acquire: vi.fn(acquireImpl) };
    return new RedlockLockProvider({ redlock: mockRedlock as never });
  }

  it('returns null when Redlock raises ResourceLockedError (lock held)', async () => {
    const lockHeld = Object.assign(new Error('Resource already locked'), {
      name: 'ResourceLockedError',
    });
    const provider = buildProvider(async () => {
      throw lockHeld;
    });

    const result = await provider.tryAcquire('key', 1000);
    expect(result).toBeNull();
  });

  it('returns null when Redlock raises ExecutionError with quorum message', async () => {
    const quorumErr = Object.assign(
      new Error('The operation was unable to achieve a quorum during its retry window.'),
      { name: 'ExecutionError' },
    );
    const provider = buildProvider(async () => {
      throw quorumErr;
    });

    const result = await provider.tryAcquire('key', 1000);
    expect(result).toBeNull();
  });

  it('returns null when Redlock raises ExecutionError with "locked" in message', async () => {
    const lockedErr = Object.assign(new Error('resource is locked by another client'), {
      name: 'ExecutionError',
    });
    const provider = buildProvider(async () => {
      throw lockedErr;
    });

    const result = await provider.tryAcquire('key', 1000);
    expect(result).toBeNull();
  });

  it('rethrows ECONNREFUSED (Redis unreachable) instead of silently returning null', async () => {
    const connRefused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:6379'), {
      code: 'ECONNREFUSED',
      name: 'Error',
    });
    const provider = buildProvider(async () => {
      throw connRefused;
    });

    await expect(provider.tryAcquire('key', 1000)).rejects.toThrow(/ECONNREFUSED/);
  });

  it('rethrows generic Error (misconfiguration / unknown failure)', async () => {
    const provider = buildProvider(async () => {
      throw new Error('Redlock misconfigured: no clients provided');
    });

    await expect(provider.tryAcquire('key', 1000)).rejects.toThrow(/misconfigured/);
  });

  it('rethrows non-object thrown values (string, null) — they are not lock-held', async () => {
    // Defensive: redlock-like libs sometimes throw raw strings.
    const provider = buildProvider(async () => {
      throw 'unexpected string throw';
    });

    await expect(provider.tryAcquire('key', 1000)).rejects.toBe('unexpected string throw');
  });

  it('returns an unlock function on successful acquisition', async () => {
    const release = vi.fn(async () => undefined);
    const provider = buildProvider(async () => ({ release }));

    const unlock = await provider.tryAcquire('key', 1000);
    expect(unlock).not.toBeNull();
    expect(typeof unlock).toBe('function');
    await unlock!();
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe('RedlockLockProvider construction', () => {
  it('throws when no clients and no redlock instance provided', () => {
    expect(() => new RedlockLockProvider({})).toThrow(/at least one Redis client/);
  });

  it('uses injected redlock instance verbatim', async () => {
    const release = vi.fn(async () => undefined);
    const acquire = vi.fn(async () => ({ release }));
    const provider = new RedlockLockProvider({
      redlock: { acquire } as never,
    });

    const unlock = await provider.acquire('key', 1000);
    expect(acquire).toHaveBeenCalledWith(['key'], 1000);
    await unlock();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
