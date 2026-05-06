// SPDX-License-Identifier: Apache-2.0

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

/**
 * Create a deferred promise — externally controllable resolve/reject.
 *
 * @returns object with `promise`, `resolve`, `reject`.
 */
export function defer<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
