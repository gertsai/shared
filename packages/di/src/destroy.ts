// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Safe-destroy helpers for batch lifecycle teardown.
 *
 * `ServiceDirectory.$destroy()` already swallows individual service failures
 * to keep the cascade running (see `ServiceDirectory.ts`). These helpers
 * surface the same defensive pattern as a reusable utility so consumers can
 * apply it outside the directory — e.g. when tearing down ad-hoc collections
 * of {@link IDestroyable} resources.
 *
 * Originally-inspired-by: Orchestra orchlab/di's `ServiceDirectory.$destroy`
 * try/catch loop (Apache 2.0). This module factors that pattern into a
 * standalone helper without modifying the existing `ServiceDirectory` class.
 */

import { diLogger } from './logger';
import { isDestroyable } from './guards';
import type { IDestroyable } from './types';

/**
 * Result of a {@link safeDestroyAll} batch operation.
 */
export interface SafeDestroyResult {
  /** Number of targets whose `$destroy()` returned without throwing. */
  destroyed: number;
  /** Number of targets that were not destroyable (skipped). */
  skipped: number;
  /** Errors caught while invoking `$destroy()`, paired with their index. */
  errors: Array<{ index: number; error: unknown }>;
}

/**
 * Invokes `$destroy()` on `target` while swallowing any thrown error.
 *
 * Returns the caught error (if any) for callers that want to handle it,
 * but never re-throws. Logs failures via the package's `diLogger` so they
 * remain observable in development.
 *
 * @param target - Any value that may or may not be {@link IDestroyable}
 * @returns The caught error, or `undefined` on success / non-destroyable
 *
 * @example
 * ```typescript
 * const err = safeDestroy(maybeService);
 * if (err) metrics.increment('destroy.errors');
 * ```
 */
export function safeDestroy(target: unknown): unknown {
  if (!isDestroyable(target)) return undefined;
  try {
    target.$destroy();
    return undefined;
  } catch (error) {
    diLogger.warn(
      'safeDestroy: error while destroying target',
      (target as object).constructor?.name,
      error,
    );
    return error;
  }
}

/**
 * Destroys every {@link IDestroyable} in `targets`, isolating failures so
 * one bad actor cannot abort the cascade. Mirrors the contract used inside
 * `ServiceDirectory.$destroy()` — every target gets a chance, and a
 * structured summary of outcomes is returned.
 *
 * Non-destroyable entries are silently skipped (counted in the result) so
 * heterogeneous arrays don't require pre-filtering.
 *
 * @param targets - Iterable of candidate values
 * @returns A {@link SafeDestroyResult} summarising successes, skips, errors
 *
 * @example
 * ```typescript
 * const summary = safeDestroyAll([service1, service2, plainObj, service3]);
 * if (summary.errors.length) {
 *   logger.error('Teardown had errors', summary.errors);
 * }
 * ```
 */
export function safeDestroyAll(
  targets: Iterable<IDestroyable | unknown>,
): SafeDestroyResult {
  const result: SafeDestroyResult = { destroyed: 0, skipped: 0, errors: [] };
  let index = -1;
  for (const target of targets) {
    index += 1;
    if (!isDestroyable(target)) {
      result.skipped += 1;
      continue;
    }
    try {
      target.$destroy();
      result.destroyed += 1;
    } catch (error) {
      diLogger.warn(
        'safeDestroyAll: error at index',
        index,
        (target as object).constructor?.name,
        error,
      );
      result.errors.push({ index, error });
    }
  }
  return result;
}
