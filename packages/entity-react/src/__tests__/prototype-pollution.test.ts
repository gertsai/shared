// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it } from 'vitest';
import { reactReactiveAdapter } from '../adapter.js';

describe('reactReactiveAdapter — prototype pollution resistance (CWE-1321)', () => {
  const POLLUTE = Symbol('attacker-raw');

  afterEach(() => {
    delete (Object.prototype as unknown as Record<symbol, unknown>)[POLLUTE];
  });

  it('a third-party Symbol planted on Object.prototype does NOT mark values as raw', () => {
    (Object.prototype as unknown as Record<symbol, unknown>)[POLLUTE] = true;

    const target = { a: 1 };
    const proxy = reactReactiveAdapter.reactive(target);

    expect(reactReactiveAdapter.isReactive(proxy)).toBe(true);
    expect(proxy).not.toBe(target);
  });

  it('isReactive uses hasOwnProperty (not prototype-walking lookup) for the brand', () => {
    const target = { a: 1 };
    const proxy = reactReactiveAdapter.reactive(target);

    const masquerade = Object.create(proxy) as object;
    expect(reactReactiveAdapter.isReactive(masquerade)).toBe(false);
  });
});
