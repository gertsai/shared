// SPDX-License-Identifier: Apache-2.0
/**
 * Re-entrancy contract (CWE-674) — Wave 19 / EVID-074 H-R1.
 *
 * When a subscriber mutates the same target inside its callback, the
 * `notify()` helper installs a per-target boolean guard so the inner
 * mutation's trap-side `notify()` short-circuits. This is **intentional
 * flood-control**:
 *
 *   1. Outer write → trap → Reflect.set updates underlying target → notify
 *      → guard up → version++  → iterate subscribers.
 *   2. Subscriber reads `target.x` (sees outer post-write value) → mutates
 *      `proxy.x = innerValue` → inner trap → Reflect.set updates target →
 *      notify → guard is `true` → EARLY RETURN (no version bump, no
 *      subscriber dispatch).
 *   3. Outer notify resumes the for-loop, calls remaining subscribers (each
 *      reads target.x and now sees the INNER post-write value because data
 *      mutation already happened).
 *   4. Outer notify clears guard.
 *
 * **Post-conditions pinned by this suite**:
 *  - The proxy never stack-overflows on a re-entrant subscriber.
 *  - The underlying target reflects the FINAL inner mutation (the data IS
 *    written).
 *  - Subscribers fire AT MOST ONCE per outer mutation burst.
 *  - The version counter bumps EXACTLY ONCE per outer mutation burst. This
 *    matters for `useSyncExternalStore`: when React subsequently calls
 *    `getSnapshot()` it reads the live proxy + live version, so the React
 *    tree re-renders against the FINAL data even though only one version
 *    bump occurred.
 *  - Subscribers that run AFTER the re-entrant callback (registered later)
 *    observe the INNER post-write value (the underlying write has already
 *    happened by then).
 */
import { describe, expect, it } from 'vitest';
import { getVersion, reactReactiveAdapter, subscribe } from '../adapter.js';

describe('reactReactiveAdapter — re-entrancy guard (CWE-674)', () => {
  it('a subscriber that mutates the same target does not stack-overflow', () => {
    const target: Record<string, number> = { count: 0 };
    const proxy = reactReactiveAdapter.reactive(target);
    let invocations = 0;

    subscribe(target, () => {
      invocations++;
      if (proxy.count < 3) {
        proxy.count = proxy.count + 1;
      }
    });

    proxy.count = 1;

    expect(invocations).toBeGreaterThan(0);
    expect(target.count).toBeGreaterThanOrEqual(1);
  });

  it('synchronous notify in trap propagates a single mutation atomically', () => {
    const target: Record<string, unknown> = { a: 1 };
    const proxy = reactReactiveAdapter.reactive(target);
    const order: string[] = [];

    subscribe(target, () => order.push('cb'));

    order.push('before');
    proxy.a = 2;
    order.push('after');

    expect(order).toEqual(['before', 'cb', 'after']);
  });

  it('subscriber fires exactly ONCE per outer mutation burst, even when it re-mutates', () => {
    const target: Record<string, number> = { count: 0 };
    const proxy = reactReactiveAdapter.reactive(target);
    let invocations = 0;

    subscribe(target, () => {
      invocations++;
      if (proxy.count === 1) {
        proxy.count = 2;
      }
    });

    proxy.count = 1;

    expect(invocations).toBe(1);
  });

  it('final data reflects the INNER mutation (re-entrant write IS persisted)', () => {
    const target: Record<string, number> = { count: 0 };
    const proxy = reactReactiveAdapter.reactive(target);

    subscribe(target, () => {
      if (proxy.count === 1) {
        proxy.count = 99;
      }
    });

    proxy.count = 1;

    expect(target.count).toBe(99);
    expect(proxy.count).toBe(99);
  });

  it('version counter bumps EXACTLY ONCE per outer burst (flood control)', () => {
    const target: Record<string, number> = { count: 0 };
    const proxy = reactReactiveAdapter.reactive(target);

    subscribe(target, () => {
      if (proxy.count === 1) {
        proxy.count = 2;
      }
    });

    const v0 = getVersion(target);
    proxy.count = 1;
    expect(getVersion(target)).toBe(v0 + 1);
  });

  it('useSyncExternalStore-style consumers see the FINAL data on re-read after a re-entrant burst', () => {
    // Simulates how React's getSnapshot works: subscribers fire (and may
    // re-enter), then React re-reads getSnapshot() to decide if a render
    // is needed. The snapshot's `data` is the live proxy, so reading
    // `data.count` after the burst MUST return the inner post-write value.
    const target: Record<string, number> = { count: 0 };
    const proxy = reactReactiveAdapter.reactive(target);

    subscribe(target, () => {
      if (proxy.count === 1) {
        proxy.count = 42;
      }
    });

    proxy.count = 1;

    const snapshot = { data: proxy, version: getVersion(target) };
    expect(snapshot.data.count).toBe(42);
  });

  it('subscribers registered AFTER a re-entrant one observe the inner post-write value', () => {
    const target: Record<string, number> = { count: 0 };
    const proxy = reactReactiveAdapter.reactive(target);

    // First subscriber re-enters and writes 7 when it sees 1.
    subscribe(target, () => {
      if (proxy.count === 1) {
        proxy.count = 7;
      }
    });

    // Second subscriber simply observes the current value at call time.
    const observed: number[] = [];
    subscribe(target, () => {
      observed.push(proxy.count);
    });

    proxy.count = 1;

    // The first subscriber ran and updated count → 7 by the time the
    // second subscriber's body executes. The Set iteration order in
    // the outer for-loop continues past the early-returning inner notify
    // so the later subscriber STILL fires.
    expect(observed).toEqual([7]);
  });

  it('a non-re-entrant second mutation after the burst settles produces a fresh notification', () => {
    const target: Record<string, number> = { count: 0 };
    const proxy = reactReactiveAdapter.reactive(target);

    let invocations = 0;
    subscribe(target, () => {
      invocations++;
      if (invocations === 1) {
        // Re-enter only on the first call.
        proxy.count = 100;
      }
    });

    // First burst: outer write → subscriber fires (re-enters) → inner
    // notify suppressed → guard cleared. invocations = 1.
    proxy.count = 1;
    expect(invocations).toBe(1);
    expect(target.count).toBe(100);

    // Second burst: clean outer write, no re-entry → subscriber fires.
    proxy.count = 200;
    expect(invocations).toBe(2);
    expect(target.count).toBe(200);
  });
});
