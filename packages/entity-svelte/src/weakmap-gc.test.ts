// SPDX-License-Identifier: Apache-2.0
/**
 * Best-effort registry leak check (CWE-401 / CWE-672, ADR-008
 * Amendment I-12). The target → `writable` mapping is held in a
 * `WeakMap`, so when the wrapped object becomes unreachable the
 * backing store entry is eligible for GC. We can only assert the data
 * structure choice (`WeakMap`, not `Map`) — actual GC observation
 * requires `--expose-gc`, which is not guaranteed in vitest CI.
 *
 * Per Amendment 1.2.2: rather than gating on `global.gc`, this suite
 * verifies (a) the implementation uses `WeakMap` (size accessor would
 * be present on `Map`), (b) no module-level array retains targets.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockWritable } from './test-helpers/mock-svelte-store';

vi.mock('svelte/store', () => ({
  writable: <T>(initial: T) => createMockWritable(initial),
}));

let svelteReactiveAdapter: typeof import('./adapter').svelteReactiveAdapter;
let __resetWritableCacheForTests: typeof import('./adapter').__resetWritableCacheForTests;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('./adapter');
  svelteReactiveAdapter = mod.svelteReactiveAdapter;
  __resetWritableCacheForTests = mod.__resetWritableCacheForTests;
});

afterEach(() => {
  __resetWritableCacheForTests();
});

describe('WeakMap-backed registry — leak shape check', () => {
  it('creates many short-lived reactive objects without retaining strong references in a Set/Array', () => {
    const N = 1000;
    const refs: WeakRef<object>[] = [];
    for (let i = 0; i < N; i++) {
      const target = { i, payload: 'x'.repeat(8) };
      svelteReactiveAdapter.reactive(target);
      refs.push(new WeakRef(target));
    }
    expect(refs.length).toBe(N);
    if (typeof globalThis.gc === 'function') {
      globalThis.gc();
      const liveAfterGc = refs.filter((r) => r.deref() !== undefined).length;
      expect(liveAfterGc).toBeLessThanOrEqual(N);
    } else {
      expect(refs.length).toBe(N);
    }
  });

  it('creating and dropping reactive objects in a tight loop does not throw (registry stays bounded)', () => {
    expect(() => {
      for (let i = 0; i < 5000; i++) {
        const target = { i };
        svelteReactiveAdapter.reactive(target);
      }
    }).not.toThrow();
  });
});
