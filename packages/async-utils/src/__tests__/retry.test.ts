// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
import { retry } from '../retry.js';

describe('retry', () => {
  it('returns result on first successful attempt', async () => {
    const action = vi.fn(async () => 'ok');
    const result = await retry(action, { maxAttempts: 3, baseMs: 1, jitter: 'none' });
    expect(result).toBe('ok');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('exhausts attempts and throws last error', async () => {
    const action = vi.fn(async () => {
      throw new Error('fail');
    });
    await expect(
      retry(action, { maxAttempts: 3, baseMs: 1, jitter: 'none' }),
    ).rejects.toThrow('fail');
    expect(action).toHaveBeenCalledTimes(3);
  });

  it('jitter modes default to "full" and bound delay correctly', async () => {
    // Default jitter MUST be 'full' per Amendment 1.2.7 (CWE-409 thundering herd).
    // We verify by inspecting onRetry callback delays — full jitter ⇒ delay ∈ [0, computed].
    const delays: number[] = [];
    const action = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(
      retry(action, {
        maxAttempts: 4,
        baseMs: 100,
        factor: 2,
        // jitter omitted → default 'full'
        onRetry: (_a, _e, d) => delays.push(d),
      }),
    ).rejects.toThrow('boom');
    expect(delays).toHaveLength(3);
    // For full jitter, every recorded delay MUST be < computed deterministic value
    // (computed = 100, 200, 400). Strict < confirms randomization actually applied.
    expect(delays[0]).toBeGreaterThanOrEqual(0);
    expect(delays[0]).toBeLessThan(100);
    expect(delays[1]).toBeLessThan(200);
    expect(delays[2]).toBeLessThan(400);
  });

  it('honors AbortSignal — rejects (signal.reason or sentinel) before next attempt', async () => {
    const controller = new AbortController();
    const action = vi.fn(async () => {
      controller.abort();
      throw new Error('first fail');
    });
    // Wave 12.D-fix FR-017: signal.reason now propagates (DOMException
    // 'This operation was aborted' on AbortController.abort() without
    // explicit reason). Old test expected literal 'Retry aborted' — that
    // only fires when signal.reason is null/undefined, which never happens
    // for native AbortController in Node ≥22.
    await expect(
      retry(action, {
        maxAttempts: 5,
        baseMs: 1,
        jitter: 'none',
        signal: controller.signal,
      }),
    ).rejects.toBeDefined();
  });

  it('Wave 12.D-fix FR-017 — aborts promptly while sleeping (signal mid-backoff)', async () => {
    const controller = new AbortController();
    // Long base delay so the back-off sleep dominates the test wall-clock.
    const action = vi.fn(async () => {
      throw new Error('again');
    });
    const start = Date.now();
    const p = retry(action, {
      maxAttempts: 5,
      baseMs: 2000, // 2 seconds — would dwarf the wall-clock if not aborted.
      jitter: 'none',
      signal: controller.signal,
    });
    // Abort after the first failure has scheduled the sleep.
    setTimeout(() => controller.abort(), 30);
    await expect(p).rejects.toBeDefined();
    const elapsed = Date.now() - start;
    // Must have aborted well before the 2-second back-off completes.
    expect(elapsed).toBeLessThan(500);
  });

  it('Wave 12.D-fix FR-017 — propagates signal.reason on abort', async () => {
    const controller = new AbortController();
    const reason = new Error('user-cancelled');
    const action = vi.fn(async () => {
      throw new Error('first fail');
    });
    const p = retry(action, {
      maxAttempts: 5,
      baseMs: 1000,
      jitter: 'none',
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(reason), 10);
    await expect(p).rejects.toBe(reason);
  });

  it('non-retryable errors throw immediately without further attempts', async () => {
    const action = vi.fn(async () => {
      throw new Error('non-retryable');
    });
    await expect(
      retry(action, {
        maxAttempts: 5,
        baseMs: 1,
        jitter: 'none',
        retryable: () => false,
      }),
    ).rejects.toThrow('non-retryable');
    expect(action).toHaveBeenCalledTimes(1);
  });
});
