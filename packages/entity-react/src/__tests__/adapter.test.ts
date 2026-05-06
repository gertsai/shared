// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { reactReactiveAdapter } from '../adapter.js';

describe('reactReactiveAdapter — ReactiveAdapter conformance', () => {
  it('reactive() wraps a plain object and returns a proxy that reads through', () => {
    const target = { a: 1, b: 'two' };
    const proxy = reactReactiveAdapter.reactive(target);
    expect(proxy.a).toBe(1);
    expect(proxy.b).toBe('two');
    expect(reactReactiveAdapter.isReactive(proxy)).toBe(true);
  });

  it('markRaw() prevents wrapping — reactive() returns the raw value as-is', () => {
    const raw = { keep: 'me' };
    reactReactiveAdapter.markRaw(raw);
    const result = reactReactiveAdapter.reactive(raw);
    expect(result).toBe(raw);
    expect(reactReactiveAdapter.isReactive(result)).toBe(false);
  });

  it('isReactive() identifies values produced by reactReactiveAdapter.reactive', () => {
    const target = { x: 10 };
    const proxy = reactReactiveAdapter.reactive(target);

    expect(reactReactiveAdapter.isReactive(proxy)).toBe(true);
    expect(reactReactiveAdapter.isReactive(target)).toBe(false);
    expect(reactReactiveAdapter.isReactive({})).toBe(false);
    expect(reactReactiveAdapter.isReactive(null)).toBe(false);
    expect(reactReactiveAdapter.isReactive(undefined)).toBe(false);
    expect(reactReactiveAdapter.isReactive(42)).toBe(false);
    expect(reactReactiveAdapter.isReactive('s')).toBe(false);
  });

  it('reactive() is idempotent for already-wrapped proxies', () => {
    const target = { a: 1 };
    const proxy1 = reactReactiveAdapter.reactive(target);
    const proxy2 = reactReactiveAdapter.reactive(proxy1);
    expect(proxy2).toBe(proxy1);
  });
});
