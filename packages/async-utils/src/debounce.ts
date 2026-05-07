// SPDX-License-Identifier: Apache-2.0

export interface DebouncedFn<TArgs extends readonly unknown[]> {
  (...args: TArgs): void;
  cancel(): void;
  flush(): void;
}

/**
 * Debounce — delay `fn` invocation by `waitMs`. Subsequent calls reset the timer.
 *
 * `cancel()` clears any pending invocation; `flush()` invokes immediately if pending.
 *
 * @param fn — function to debounce.
 * @param waitMs — wait period in milliseconds.
 */
export function debounce<TArgs extends readonly unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number,
): DebouncedFn<TArgs> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: TArgs | undefined;

  const debounced = ((...args: TArgs): void => {
    lastArgs = args;
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      const callArgs = lastArgs;
      lastArgs = undefined;
      if (callArgs !== undefined) fn(...callArgs);
    }, waitMs);
  }) as DebouncedFn<TArgs>;

  debounced.cancel = (): void => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    lastArgs = undefined;
  };

  debounced.flush = (): void => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
      const callArgs = lastArgs;
      lastArgs = undefined;
      if (callArgs !== undefined) fn(...callArgs);
    }
  };

  return debounced;
}
