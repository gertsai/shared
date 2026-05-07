// SPDX-License-Identifier: Apache-2.0

export interface CancellableSignal {
  readonly signal: AbortSignal;
  cancel(reason?: unknown): void;
}

/**
 * Create a cancellable signal — thin AbortController wrapper.
 *
 * @returns `{ signal, cancel(reason?) }`.
 */
export function makeCancellable(): CancellableSignal {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    cancel(reason?: unknown): void {
      controller.abort(reason);
    },
  };
}
