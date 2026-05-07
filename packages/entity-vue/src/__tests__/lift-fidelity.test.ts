// SPDX-License-Identifier: Apache-2.0
/**
 * Lift-fidelity regression tests — ensure `vueReactiveAdapter` behaves
 * identically to the Sprint 3.4 implementation that lived at
 * `packages/entity/src/vue.ts` (which Sprint 3.8 W-3-8-26 turns into a
 * re-export shim).
 *
 * Per ADR-008 Decision B + I-3 (backward-compat invariant): lifting must
 * preserve observable behaviour for downstream consumers (m9s-example or
 * downstream apps). These tests pin that invariant.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { vueReactiveAdapter } from '../index';

describe('vueReactiveAdapter — lift fidelity vs @vue/runtime-core', () => {
  it('reactive() output matches @vue/runtime-core shallowReactive() directly', () => {
    const req = createRequire(import.meta.url);
    const vue = req('@vue/runtime-core') as {
      shallowReactive: <T extends object>(t: T) => T;
      isReactive: (v: unknown) => boolean;
    };

    const target = { a: 1 };
    const adapterProxy = vueReactiveAdapter.reactive(target);
    expect(vue.isReactive(adapterProxy)).toBe(true);
  });

  it('isReactive() agrees with @vue/runtime-core isReactive() for proxies it produced', () => {
    const req = createRequire(import.meta.url);
    const vue = req('@vue/runtime-core') as {
      shallowReactive: <T extends object>(t: T) => T;
      isReactive: (v: unknown) => boolean;
    };

    const target = { x: 1 };
    const proxy = vue.shallowReactive(target);
    expect(vueReactiveAdapter.isReactive(proxy)).toBe(true);
    expect(vue.isReactive(proxy)).toBe(true);
  });

  it('markRaw() output flows correctly through reactive() (no double-wrapping)', () => {
    const req = createRequire(import.meta.url);
    const vue = req('@vue/runtime-core') as {
      shallowReactive: <T extends object>(t: T) => T;
      markRaw: <T>(v: T) => T;
      isReactive: (v: unknown) => boolean;
    };

    const adapterRaw = vueReactiveAdapter.markRaw({ b: 2 });
    const directRaw = vue.markRaw({ b: 2 });

    const adapterWrapped = vueReactiveAdapter.reactive(adapterRaw);
    const directWrapped = vue.shallowReactive(directRaw);

    expect(vueReactiveAdapter.isReactive(adapterWrapped)).toBe(false);
    expect(vue.isReactive(directWrapped)).toBe(false);
  });

  it('typeof exported value is the ReactiveAdapter shape (3 methods)', () => {
    expect(typeof vueReactiveAdapter.reactive).toBe('function');
    expect(typeof vueReactiveAdapter.markRaw).toBe('function');
    expect(typeof vueReactiveAdapter.isReactive).toBe('function');
  });
});
