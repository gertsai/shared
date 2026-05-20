// SPDX-License-Identifier: Apache-2.0
/**
 * Re-entrancy contract — Wave 19 / EVID-074 H-S1.
 *
 * The Solid adapter has NO explicit boolean re-entrancy guard (unlike
 * `@gertsai/entity-react` and `@gertsai/entity-svelte`); it relies on
 * Solid's own reactive-graph batching. A subscriber registered against the
 * proxy via Solid's `createEffect` etc. would observe writes per Solid's
 * scheduling, but the adapter's Proxy traps themselves never call user
 * callbacks — they only route writes through `setStore(produce(...))`.
 *
 * **Post-conditions pinned by this suite**:
 *  - The proxy never stack-overflows on a re-entrant write (a write inside
 *    a `produce` callback that itself triggers the same proxy's `set` trap
 *    would recurse, but normal usage where re-entry happens after the
 *    outer trap returns is safe).
 *  - The underlying store reflects the FINAL inner mutation.
 *  - Sequential re-entry via post-trap callbacks works without throwing.
 *
 * Uses the **real `solid-js/store`** runtime to catch behavioural drift in
 * Solid 1.x → 2.x.
 */
import { describe, expect, it } from 'vitest';
import { solidReactiveAdapter } from '../adapter';

describe('solidReactiveAdapter — re-entrancy (real solid-js/store)', () => {
  it('sequential writes do not stack-overflow even when looped through a callback', () => {
    const target: { count: number } = { count: 0 };
    const store = solidReactiveAdapter.reactive(target);

    // Simulate a user-land effect: read counter, conditionally write.
    // We invoke the effect manually post-write since Solid's `createEffect`
    // requires a `createRoot` context — the contract under test is the
    // adapter's trap behaviour, not Solid's effect scheduling.
    const observe = (): void => {
      if (store.count < 3) {
        store.count = store.count + 1;
      }
    };

    expect(() => {
      store.count = 1;
      observe();
      observe();
      observe();
    }).not.toThrow();
    expect(store.count).toBeGreaterThanOrEqual(3);
  });

  it('final store value reflects last write in a re-entrant-style sequence', () => {
    const target: { count: number } = { count: 0 };
    const store = solidReactiveAdapter.reactive(target);

    store.count = 1;
    // Simulate a downstream observer mutating after the outer write.
    if (store.count === 1) {
      store.count = 42;
    }

    expect(store.count).toBe(42);
  });

  it('synchronous post-write read sees the new value (no microtask deferral at the trap layer)', () => {
    const target: Record<string, unknown> = { a: 'before' };
    const store = solidReactiveAdapter.reactive(target);

    store.a = 'after';
    // Trap-level write is synchronous: read immediately reflects it.
    expect(store.a).toBe('after');
  });

  it('mutating a DIFFERENT proxy from a callback works without cross-target interference', () => {
    const a: { n: number } = { n: 0 };
    const b: { n: number } = { n: 0 };
    const pa = solidReactiveAdapter.reactive(a);
    const pb = solidReactiveAdapter.reactive(b);

    pa.n = 1;
    // Callback equivalent — mutate b after pa is set.
    if (pa.n === 1) {
      pb.n = 7;
    }

    expect(pa.n).toBe(1);
    expect(pb.n).toBe(7);
  });
});
