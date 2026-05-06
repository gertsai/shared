// SPDX-License-Identifier: Apache-2.0

export interface ThrottledFn<TArgs extends readonly unknown[]> {
  (...args: TArgs): void;
  cancel(): void;
}

/**
 * Throttle — limit `fn` invocation to once per `limitMs`. Leading-edge invocation;
 * trailing-edge invocation if calls happened during the cooldown.
 *
 * @param fn — function to throttle.
 * @param limitMs — cooldown in milliseconds.
 */
export function throttle<TArgs extends readonly unknown[]>(
  fn: (...args: TArgs) => void,
  limitMs: number,
): ThrottledFn<TArgs> {
  let lastInvoke = 0;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: TArgs | undefined;

  const throttled = ((...args: TArgs): void => {
    const now = Date.now();
    const elapsed = now - lastInvoke;

    if (elapsed >= limitMs) {
      lastInvoke = now;
      fn(...args);
      return;
    }

    pendingArgs = args;
    if (timeoutId !== undefined) return;

    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      lastInvoke = Date.now();
      const callArgs = pendingArgs;
      pendingArgs = undefined;
      if (callArgs !== undefined) fn(...callArgs);
    }, limitMs - elapsed);
  }) as ThrottledFn<TArgs>;

  throttled.cancel = (): void => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    pendingArgs = undefined;
    lastInvoke = 0;
  };

  return throttled;
}
