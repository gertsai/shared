// SPDX-License-Identifier: Apache-2.0

/**
 * Sleep for the specified milliseconds. Optionally honors an
 * {@link AbortSignal} — when the signal aborts before the timer fires the
 * returned promise rejects with `signal.reason` (or a generic `Error('Sleep
 * aborted')` if `reason` is absent).
 *
 * Wave 12.D-fix per PRD-036 FR-017 — `retry()` must be able to interrupt a
 * pending back-off sleep instead of completing it (signal-aborted in the
 * middle of `sleep(delayMs)` was previously ignored).
 *
 * @param ms — duration in milliseconds.
 * @param signal — optional abort signal. If `signal.aborted` is already
 *   true on entry the promise rejects synchronously on the next microtask.
 * @returns Promise that resolves after `ms` or rejects on abort.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Sleep aborted'));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = (): void => {
      cleanup();
      reject(signal?.reason ?? new Error('Sleep aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
