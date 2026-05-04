/**
 * Creates a promise that resolves after a specified number of milliseconds.
 *
 * @param ms - The number of milliseconds to wait before resolving the promise.
 * @returns A promise that resolves after the specified time.
 *
 * @example
 * ```typescript
 * async function delayedLog() {
 *   await promiseTimeout(1000);
 *   console.log('This message is logged after 1 second');
 * }
 * ```
 */
export const promiseTimeout = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
