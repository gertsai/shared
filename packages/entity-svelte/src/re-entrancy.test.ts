// SPDX-License-Identifier: Apache-2.0
/**
 * Re-entrancy guard — a subscriber that mutates the same target inside
 * its callback MUST NOT cause infinite recursion (CWE-674, ADR-008
 * Amendment I-13). The adapter holds a per-target boolean guard for
 * the duration of the synchronous notify, so the inner mutation's
 * trap is invoked but its `store.set(...)` short-circuits.
 */
/**
 * Re-entrancy contract — Wave 19 / EVID-074 H-Sv1.
 *
 * When a subscriber mutates the same target inside its callback, the
 * adapter's `notify()` holds a per-target boolean guard. The inner trap's
 * call to `notify()` short-circuits BEFORE `writable.set({...target})`
 * fires, so subscribers see exactly ONE notification per outer mutation
 * burst.
 *
 * **Post-conditions pinned by this suite**:
 *  - No stack overflow on a re-entrant subscriber.
 *  - The underlying target reflects the FINAL inner mutation (data IS
 *    written; the inner Proxy `set` trap's `Reflect.set(target, ...)` ran
 *    before `notify()` was suppressed).
 *  - The `writable` store fires exactly ONCE per outer burst.
 *  - The snapshot delivered to the subscriber by the inner write has
 *    ALREADY been suppressed; if the subscriber re-reads `target.x` after
 *    the inner write, it sees the inner value (live data), even though no
 *    NEW `store.set(...)` event was emitted.
 *  - A subsequent NON-re-entrant outer write produces a fresh notification.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockWritable } from './test-helpers/mock-svelte-store';

vi.mock('svelte/store', () => ({
  writable: <T>(initial: T) => createMockWritable(initial),
}));

let svelteReactiveAdapter: typeof import('./adapter').svelteReactiveAdapter;
let getStore: typeof import('./adapter').getStore;
let __resetWritableCacheForTests: typeof import('./adapter').__resetWritableCacheForTests;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('./adapter');
  svelteReactiveAdapter = mod.svelteReactiveAdapter;
  getStore = mod.getStore;
  __resetWritableCacheForTests = mod.__resetWritableCacheForTests;
});

afterEach(() => {
  __resetWritableCacheForTests();
});

describe('re-entrancy guard', () => {
  it('a subscriber that mutates the same target does not stack-overflow', () => {
    const target: Record<string, unknown> = { count: 0 };
    const proxy = svelteReactiveAdapter.reactive(target);
    const store = getStore(target)!;
    let observations = 0;
    let didInnerWrite = false;
    store.subscribe(() => {
      observations++;
      if (!didInnerWrite && observations >= 2) {
        didInnerWrite = true;
        proxy.count = (target.count as number) + 1;
      }
    });
    expect(() => {
      proxy.count = 1;
    }).not.toThrow();
    expect(target.count).toBe(2);
  });

  it('a subscriber that mutates a DIFFERENT target is allowed to fire its own notify chain', () => {
    const a: Record<string, unknown> = { n: 0 };
    const b: Record<string, unknown> = { n: 0 };
    const pa = svelteReactiveAdapter.reactive(a);
    const pb = svelteReactiveAdapter.reactive(b);
    const sa = getStore(a)!;
    const sb = getStore(b)!;
    let bSeen = 0;
    sb.subscribe(() => {
      bSeen++;
    });
    const initialB = bSeen;
    sa.subscribe((aValue) => {
      // Skip the synchronous initial subscribe playback; only react to
      // genuine post-subscription mutations of `a`.
      if ((aValue as { n: number }).n !== 0) {
        pb.n = (b.n as number) + 1;
      }
    });
    pa.n = 1;
    expect(b.n).toBe(1);
    expect(bSeen).toBe(initialB + 1);
  });

  it('final target reflects INNER mutation (re-entrant write IS persisted to underlying data)', () => {
    const target: Record<string, number> = { count: 0 };
    const proxy = svelteReactiveAdapter.reactive(target);
    const store = getStore(target)!;
    store.subscribe(() => {
      if (proxy.count === 1) {
        proxy.count = 99;
      }
    });
    proxy.count = 1;
    // Mock writable mutates the captured target in `Reflect.set`, then the
    // inner set trap's Reflect.set fires again with 99 → final data is 99.
    expect(target.count).toBe(99);
    expect(proxy.count).toBe(99);
  });

  it('store fires EXACTLY ONCE per outer mutation burst even when subscriber re-enters', () => {
    const target: Record<string, number> = { count: 0 };
    const proxy = svelteReactiveAdapter.reactive(target);
    const store = getStore(target)!;

    let postInitialCount = 0;
    let initialPlaybackConsumed = false;
    store.subscribe(() => {
      if (!initialPlaybackConsumed) {
        initialPlaybackConsumed = true;
        return;
      }
      postInitialCount++;
      if (proxy.count === 1) {
        proxy.count = 2;
      }
    });

    proxy.count = 1;
    // The outer write fires `store.set({...target})` once. The inner write
    // (`proxy.count = 2`) hits the trap → notify → guard is true → early
    // return → no second `store.set(...)`.
    expect(postInitialCount).toBe(1);
  });

  it('subscribers that read target AFTER the re-entrant write see inner value (live data)', () => {
    const target: Record<string, number> = { count: 0 };
    const proxy = svelteReactiveAdapter.reactive(target);
    const store = getStore(target)!;

    // The store callback receives the value snapshot; we additionally
    // observe target directly to verify the data is live.
    let initialPlayback = true;
    let observedDuringCallback = -1;
    store.subscribe(() => {
      if (initialPlayback) {
        initialPlayback = false;
        return;
      }
      if (proxy.count === 1) {
        proxy.count = 7;
        // After the inner write returns, target.count is 7 (live data).
        observedDuringCallback = target.count;
      }
    });

    proxy.count = 1;
    expect(observedDuringCallback).toBe(7);
    expect(target.count).toBe(7);
  });

  it('a subsequent non-re-entrant write produces a fresh notification', () => {
    const target: Record<string, number> = { count: 0 };
    const proxy = svelteReactiveAdapter.reactive(target);
    const store = getStore(target)!;

    let initialPlayback = true;
    let postInitialCount = 0;
    store.subscribe(() => {
      if (initialPlayback) {
        initialPlayback = false;
        return;
      }
      postInitialCount++;
      if (postInitialCount === 1) {
        // Re-enter only on the first non-initial event.
        proxy.count = 100;
      }
    });

    proxy.count = 1;
    expect(postInitialCount).toBe(1);
    expect(target.count).toBe(100);

    proxy.count = 200;
    expect(postInitialCount).toBe(2);
    expect(target.count).toBe(200);
  });
});
