// SPDX-License-Identifier: Apache-2.0
/**
 * ReactiveAdapter contract conformance tests for `vueReactiveAdapter`.
 *
 * Verifies the 3 ReactiveAdapter contract methods (reactive, markRaw,
 * isReactive) behave as required by `@gertsai/entity` consumers and Vue's
 * reactivity semantics.
 */
import { describe, expect, it } from 'vitest';
import { vueReactiveAdapter } from '../index';

describe('vueReactiveAdapter — ReactiveAdapter contract', () => {
  it('reactive() returns a Vue-reactive proxy distinct from the raw target', () => {
    const target = { count: 0 };
    const proxy = vueReactiveAdapter.reactive(target);
    expect(vueReactiveAdapter.isReactive(proxy)).toBe(true);
    expect(vueReactiveAdapter.isReactive(target)).toBe(false);
  });

  it('reactive() preserves read-through of fields on the proxy', () => {
    const target = { count: 42, label: 'x' };
    const proxy = vueReactiveAdapter.reactive(target);
    expect(proxy.count).toBe(42);
    expect(proxy.label).toBe('x');
  });

  it('reactive() propagates mutations made through the proxy back to the raw target (shallow semantics)', () => {
    const target = { count: 0 };
    const proxy = vueReactiveAdapter.reactive(target);
    proxy.count = 7;
    expect(target.count).toBe(7);
  });

  it('markRaw() returns a value that reactive() refuses to wrap (escape hatch)', () => {
    const raw = vueReactiveAdapter.markRaw({ b: 2 });
    const wrapped = vueReactiveAdapter.reactive(raw);
    expect(vueReactiveAdapter.isReactive(wrapped)).toBe(false);
  });

  it('markRaw() returns the same reference (mutating in place via Vue marker)', () => {
    const original = { a: 1 };
    const marked = vueReactiveAdapter.markRaw(original);
    expect(marked).toBe(original);
  });

  it('isReactive() returns false for plain non-object values', () => {
    expect(vueReactiveAdapter.isReactive(undefined)).toBe(false);
    expect(vueReactiveAdapter.isReactive(null)).toBe(false);
    expect(vueReactiveAdapter.isReactive(42)).toBe(false);
    expect(vueReactiveAdapter.isReactive('s')).toBe(false);
    expect(vueReactiveAdapter.isReactive(true)).toBe(false);
  });

  it('isReactive() returns false for plain objects that were never wrapped', () => {
    expect(vueReactiveAdapter.isReactive({})).toBe(false);
    expect(vueReactiveAdapter.isReactive([])).toBe(false);
  });

  it('reactive() is idempotent on a value already reactive (Vue returns same proxy)', () => {
    const target = { x: 1 };
    const a = vueReactiveAdapter.reactive(target);
    const b = vueReactiveAdapter.reactive(a);
    expect(vueReactiveAdapter.isReactive(a)).toBe(true);
    expect(vueReactiveAdapter.isReactive(b)).toBe(true);
  });
});

/**
 * Wave 19 / EVID-074 M-R2 parity — markRaw non-reversibility check for Vue.
 *
 * Vue's `markRaw` (from `@vue/reactivity`) installs a `__v_skip: true`
 * property via Vue's internal `def(obj, key, value, writable = false)` helper,
 * which calls `Object.defineProperty(obj, key, { configurable: true,
 * enumerable: false, writable: false, value })`. Note: Vue marks the
 * property as `configurable: true` (NOT `false` like
 * `@gertsai/entity-react` / `@gertsai/entity-svelte` adapters do for their
 * own RAW symbol). This is Vue's choice — we honor it here by asserting
 * the actual Vue contract rather than imposing a stricter shape.
 *
 * The invariant we DO pin: once installed, the brand value is `true`,
 * non-writable, and the brand's presence is what `isReactive` consults
 * when deciding to skip wrapping.
 */
describe('vueReactiveAdapter — markRaw non-reversibility (Wave 19)', () => {
  it('markRaw() installs Vue\'s __v_skip brand with writable: false, enumerable: false', () => {
    const value = { secret: 1 };
    vueReactiveAdapter.markRaw(value);
    const desc = Object.getOwnPropertyDescriptor(value, '__v_skip');
    expect(desc).toBeDefined();
    expect(desc?.value).toBe(true);
    expect(desc?.writable).toBe(false);
    expect(desc?.enumerable).toBe(false);
  });

  it('markRaw() brand value cannot be flipped via direct assignment (writable: false)', () => {
    const value: Record<string, unknown> = { secret: 1 };
    vueReactiveAdapter.markRaw(value);
    // Strict-mode assignment on a writable: false property throws.
    expect(() => {
      'use strict';
      value['__v_skip'] = false;
    }).toThrow();
  });

  it('markRaw() once branded keeps the value out of Vue reactive wrapping', () => {
    // Functional check: even if a downstream call attempts to make the
    // value reactive, Vue's reactive() respects the brand.
    const value = { secret: 1 };
    vueReactiveAdapter.markRaw(value);
    const result = vueReactiveAdapter.reactive(value);
    expect(result).toBe(value);
    expect(vueReactiveAdapter.isReactive(result)).toBe(false);
  });
});
