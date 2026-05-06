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
 * Default `jitter: 'full'` per ADR-009 Amendment 1.2.7 — randomizes delay in
 * [0, computedDelay] for thundering-herd protection (CWE-409).
 *
 * Honors `signal: AbortSignal` if provided — throws if signal aborts before next attempt.
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
    if (signal?.aborted) throw new Error('Retry aborted');
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
      await sleep(delayMs);
    }
  }
  throw lastError;
}
