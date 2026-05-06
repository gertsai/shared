// SPDX-License-Identifier: Apache-2.0
/**
 * Re-entrancy guard — a subscriber that mutates the same target inside
 * its callback MUST NOT cause infinite recursion (CWE-674, ADR-008
 * Amendment I-13). The adapter holds a per-target boolean guard for
 * the duration of the synchronous notify, so the inner mutation's
 * trap is invoked but its `store.set(...)` short-circuits.
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
});
