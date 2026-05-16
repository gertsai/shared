// SPDX-License-Identifier: Apache-2.0
import { sleep } from './sleep.js';

export interface RetryOpts {
  readonly maxAttempts?: number;
  readonly baseMs?: number;
  readonly maxMs?: number;
  readonly factor?: number;
  readonly jitter?: 'none' | 'full' | 'equal';
  readonly retryable?: (error: unknown) => boolean;
  readonly onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  readonly signal?: AbortSignal;
}

/**
 * Retry an async action with exponential backoff + jitter.
 *
 * Jitter modes:
 *   - `'full'` (DEFAULT, recommended): delay ∈ [0, computedDelay].
 *     Maximises de-correlation of retrying clients — see Sprint 3.9
 *     ADR-009 Amendment 1.2.7 (thundering-herd protection, CWE-409).
 *     Selected as default after the audit determined that workloads
 *     calling `retry()` without explicit jitter config were the most
 *     likely to suffer from synchronised retry storms.
 *   - `'equal'`: delay ∈ [computedDelay/2, computedDelay]. Lower
 *     variance, useful when callers depend on a soft minimum wait
 *     (e.g. polling a backend that returns 429 too eagerly).
 *   - `'none'`: deterministic exponential backoff (testing only —
 *     production callers must NOT use this against shared upstreams).
 *
 * Sprint 3.10 W-3-10-15: cross-reference confirmed; default value
 * unchanged. Consumers wanting backwards-compatible deterministic
 * sleeps must opt in via `jitter: 'none'`.
 *
 * Honors `signal: AbortSignal` if provided — throws if signal aborts
 * before next attempt.
 *
 * @param action — async function to invoke.
 * @param opts — retry configuration.
 * @returns Promise resolving to action result or rejecting with last error.
 */
export async function retry<T>(action: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseMs = opts.baseMs ?? 100;
  const maxMs = opts.maxMs ?? 5000;
  const factor = opts.factor ?? 2;
  const jitter = opts.jitter ?? 'full';
  const retryable = opts.retryable ?? ((): boolean => true);
  const signal = opts.signal;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw signal.reason ?? new Error('Retry aborted');
    try {
      return await action();
    } catch (e) {
      lastError = e;
      if (!retryable(e) || attempt === maxAttempts) throw e;
      let delayMs = Math.min(baseMs * Math.pow(factor, attempt - 1), maxMs);
      if (jitter === 'full') delayMs = Math.random() * delayMs;
      else if (jitter === 'equal') delayMs = delayMs / 2 + Math.random() * (delayMs / 2);
      // 'none' — no jitter applied.
      opts.onRetry?.(attempt, e, delayMs);
      // Wave 12.D-fix FR-017: propagate signal into sleep AND re-check
      // after — signal-aborted mid-sleep must reject promptly rather than
      // wait the full backoff window.
      if (signal?.aborted) throw signal.reason ?? new Error('Retry aborted');
      await sleep(delayMs, signal);
      if (signal?.aborted) throw signal.reason ?? new Error('Retry aborted');
    }
  }
  throw lastError;
}
