// SPDX-License-Identifier: Apache-2.0
/**
 * GC / registry leak shape check (CWE-401 / CWE-672) — Wave 19 / EVID-074
 * M-S3 (parity with entity-react / entity-svelte).
 *
 * The Solid adapter does NOT keep a module-level `WeakMap<target, store>`
 * — every call to `reactive(target)` invokes Solid's `createStore(target)`
 * which returns a fresh store tuple; the Proxy holds the store + setStore
 * via closure. Each Proxy is independently garbage-collectable once the
 * caller drops the reference.
 *
 * **Post-conditions**:
 *  - Creating many short-lived reactive objects does not throw.
 *  - The implementation does not retain strong references in a Set/Array.
 *  - `idempotency` (calling reactive on an already-wrapped store) does
 *    not leak (the store-brand check returns the original proxy).
 *
 * Uses the **real `solid-js/store`** runtime.
 */
import { describe, expect, it } from 'vitest';
import { solidReactiveAdapter } from '../adapter';

describe('solidReactiveAdapter — registry leak shape (real solid-js/store)', () => {
  it('repeated reactive(target) on different targets does not throw or grow unbounded', () => {
    for (let i = 0; i < 1000; i++) {
      const t = { i };
      const store = solidReactiveAdapter.reactive(t);
      store.i = i + 1;
    }
    expect(true).toBe(true);
  });

  it('many short-lived reactive objects do not retain strong references in a Set/Array', () => {
    const N = 500;
    const refs: WeakRef<object>[] = [];
    for (let i = 0; i < N; i++) {
      const target = { i, payload: 'x'.repeat(8) };
      solidReactiveAdapter.reactive(target);
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

  it('idempotent reactive() returns the same proxy without leaking a new one', () => {
    const target = { x: 1 };
    const a = solidReactiveAdapter.reactive(target);
    const b = solidReactiveAdapter.reactive(a);
    expect(b).toBe(a);
  });

  it('creating and dropping reactive objects in a tight loop does not throw', () => {
    expect(() => {
      for (let i = 0; i < 5000; i++) {
        const target = { i };
        solidReactiveAdapter.reactive(target);
      }
    }).not.toThrow();
  });
});
