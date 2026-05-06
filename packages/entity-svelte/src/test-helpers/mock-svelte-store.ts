// SPDX-License-Identifier: Apache-2.0
/**
 * Test-only stand-in for `svelte/store.writable` used by the adapter test
 * suite. Mirrors the subset of the Svelte 4 store contract relied on by
 * `svelteReactiveAdapter` and `entityStore`: `set`, `subscribe`, `update`.
 * Subscribers are notified synchronously; new subscribers are immediately
 * called with the current value, matching Svelte's documented behavior.
 *
 * Not part of the public API. Imported only from `*.test.ts` files.
 */
export interface MockWritable<T> {
  set(value: T): void;
  subscribe(callback: (value: T) => void): () => void;
  update(updater: (value: T) => T): void;
}

export function createMockWritable<T>(initial: T): MockWritable<T> {
  let value = initial;
  const subscribers = new Set<(value: T) => void>();
  return {
    set(next: T): void {
      value = next;
      for (const cb of subscribers) cb(value);
    },
    subscribe(cb: (value: T) => void): () => void {
      subscribers.add(cb);
      cb(value);
      return () => subscribers.delete(cb);
    },
    update(fn: (value: T) => T): void {
      this.set(fn(value));
    },
  };
}
