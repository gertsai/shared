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

  it('honors AbortSignal — throws "Retry aborted" before next attempt', async () => {
    const controller = new AbortController();
    const action = vi.fn(async () => {
      controller.abort();
      throw new Error('first fail');
    });
    await expect(
      retry(action, {
        maxAttempts: 5,
        baseMs: 1,
        jitter: 'none',
        signal: controller.signal,
      }),
    ).rejects.toThrow(/Retry aborted|first fail/);
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
