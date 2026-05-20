// SPDX-License-Identifier: Apache-2.0
/**
 * Proxy trap coverage — set / defineProperty / deleteProperty all route
 * mutations through `setStore(produce(...))` so Solid's reactive graph is
 * notified. Wave 19 / EVID-074 H-S1 + M-S3 — parity with entity-react's
 * `proxy-traps.test.ts`.
 *
 * Uses the **real `solid-js/store`** runtime (no `vi.mock`) so behavioural
 * drift in Solid 1.x → 2.x is observable in CI. This closes EVID-074 L-S2
 * (the existing `adapter.test.ts` short-circuits `produce` via a hand-rolled
 * mock).
 */
import { describe, expect, it } from 'vitest';
import { solidReactiveAdapter } from '../adapter';

describe('solidReactiveAdapter — Proxy traps (real solid-js/store)', () => {
  it('set trap persists property assignment to underlying store', () => {
    const target: Record<string, unknown> = { a: 1 };
    const store = solidReactiveAdapter.reactive(target);
    store.a = 99;
    expect(store.a).toBe(99);
  });

  it('Object.defineProperty on the proxy persists the new value', () => {
    const target: Record<string, unknown> = { a: 1 };
    const store = solidReactiveAdapter.reactive(target);
    Object.defineProperty(store, 'b', {
      value: 'new',
      enumerable: true,
      writable: true,
      configurable: true,
    });
    expect(store['b']).toBe('new');
  });

  it('delete trap removes the property from the store', () => {
    const target: Record<string, unknown> = { a: 1, b: 2 };
    const store = solidReactiveAdapter.reactive(target);
    delete store['a'];
    expect(store['a']).toBeUndefined();
  });

  it('Reflect.set with attacker-controlled receiver still persists (no receiver bypass)', () => {
    const target: Record<string, unknown> = { x: 1 };
    const store = solidReactiveAdapter.reactive(target);
    const attacker = { hijacked: false };
    const ok = Reflect.set(store, 'x', 42, attacker);
    expect(ok).toBe(true);
    expect(store.x).toBe(42);
    // The attacker receiver should NOT have been written to — the trap
    // does not propagate the receiver into setStore.
    expect(attacker.hijacked).toBe(false);
    expect((attacker as Record<string, unknown>).x).toBeUndefined();
  });

  it('multiple distinct mutations each persist (no batching loss)', () => {
    const target: Record<string, unknown> = { a: 1 };
    const store = solidReactiveAdapter.reactive(target);
    store.a = 2;
    store.a = 3;
    store['b'] = 4;
    expect(store.a).toBe(3);
    expect(store['b']).toBe(4);
  });

  it('isReactive(proxy) returns true for adapter-produced stores (brand surfaces via get trap)', () => {
    const target = { x: 1 };
    const store = solidReactiveAdapter.reactive(target);
    expect(solidReactiveAdapter.isReactive(store)).toBe(true);
  });
});
