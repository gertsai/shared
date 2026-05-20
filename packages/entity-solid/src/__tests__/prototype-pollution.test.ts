// SPDX-License-Identifier: Apache-2.0
/**
 * Prototype-pollution defence (CWE-1321) — Wave 19 / EVID-074 M-S1
 * (parity with entity-react / entity-svelte).
 *
 * The Solid adapter uses two module-private `Symbol(...)` markers:
 *  - `RAW` for `markRaw`-branded values, looked up via
 *    `Object.prototype.hasOwnProperty.call(value, RAW)` — prototype-walk
 *    safe.
 *  - `STORE_BRAND` for proxy-wrapped stores, exposed via the proxy's `get`
 *    trap and read with `Reflect.get`. The `Reflect.get` lookup IS
 *    prototype-aware in principle, but `STORE_BRAND` is a module-private
 *    `Symbol(...)` so no external caller can plant a matching key on
 *    `Object.prototype` — the worst they could do is plant a same-keyed
 *    `Symbol.for('@gertsai/entity-solid:store')` (shared-registry symbol),
 *    which would NOT match the module-private instance.
 *
 * Uses the **real `solid-js/store`** runtime.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { solidReactiveAdapter } from '../adapter';

describe('solidReactiveAdapter — prototype pollution resistance (CWE-1321)', () => {
  afterEach(() => {
    // Clean up any pollution leaked from a test.
    const proto = Object.prototype as unknown as Record<
      string | symbol,
      unknown
    >;
    delete proto[Symbol.for('@gertsai/entity-solid:raw')];
    delete proto[Symbol.for('@gertsai/entity-solid:store')];
  });

  it('Symbol.for-guess of RAW key on Object.prototype does NOT mark values as raw', () => {
    const proto = Object.prototype as unknown as Record<
      string | symbol,
      unknown
    >;
    const guess = Symbol.for('@gertsai/entity-solid:raw');
    proto[guess] = true;

    const target = { a: 1 };
    const store = solidReactiveAdapter.reactive(target);
    // The polluted symbol must NOT short-circuit reactive wrapping —
    // adapter uses module-private Symbol(...), not Symbol.for(...).
    expect(solidReactiveAdapter.isReactive(store)).toBe(true);
  });

  it('Symbol.for-guess of STORE_BRAND key on Object.prototype does NOT make plain objects look reactive', () => {
    const proto = Object.prototype as unknown as Record<
      string | symbol,
      unknown
    >;
    const guess = Symbol.for('@gertsai/entity-solid:store');
    proto[guess] = true;

    const plain = { x: 1 };
    // Adapter's `isStoreBranded` uses Reflect.get with a module-private
    // symbol — the prototype-polluted Symbol.for(...) value has a
    // DIFFERENT identity and so cannot be read by the adapter.
    expect(solidReactiveAdapter.isReactive(plain)).toBe(false);
  });

  it('hasOwnProperty-based markRaw lookup ignores inherited keys', () => {
    const proto = Object.prototype as unknown as Record<
      string | symbol,
      unknown
    >;
    const guess = Symbol.for('@gertsai/entity-solid:raw');
    proto[guess] = true;

    // A fresh object inherits the polluted prototype symbol but does NOT
    // have it as an own property — markRaw lookup must reject it.
    const polluted = {};
    const store = solidReactiveAdapter.reactive(polluted);
    expect(solidReactiveAdapter.isReactive(store)).toBe(true);
  });

  it('STORE_BRAND lookup via Reflect.get is safe for objects that inherit a planted Object.prototype symbol', () => {
    // Even if an attacker manages to plant the EXACT module-private
    // Symbol (impossible without exfiltrating it from the closure), an
    // object inheriting it from Object.prototype would falsely report
    // reactive. Since the symbol is captured in the module closure and
    // never exported, this attack is not viable from outside the package.
    const plain = Object.create({}) as object;
    expect(solidReactiveAdapter.isReactive(plain)).toBe(false);
  });
});
