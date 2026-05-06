// SPDX-License-Identifier: Apache-2.0
/**
 * Prototype-pollution defense (CWE-1321, ADR-008 Amendment I-11).
 *
 * The adapter's raw marker is a module-private `Symbol('raw')` looked up
 * with `Object.prototype.hasOwnProperty.call(target, RAW)`. An attacker
 * who pollutes `Object.prototype[Symbol.for('raw')]` (or any other shared
 * registry key) cannot turn `markRaw`/`isReactive` into universal
 * truth-or-bypass machinery.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockWritable } from './test-helpers/mock-svelte-store';

vi.mock('svelte/store', () => ({
  writable: <T>(initial: T) => createMockWritable(initial),
}));

let svelteReactiveAdapter: typeof import('./adapter').svelteReactiveAdapter;
let __resetWritableCacheForTests: typeof import('./adapter').__resetWritableCacheForTests;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('./adapter');
  svelteReactiveAdapter = mod.svelteReactiveAdapter;
  __resetWritableCacheForTests = mod.__resetWritableCacheForTests;
});

afterEach(() => {
  __resetWritableCacheForTests();
});

describe('prototype-pollution defense', () => {
  it('Object.prototype["raw"] does NOT cause arbitrary objects to be treated as markRaw', () => {
    const polluted = Object.prototype as unknown as Record<
      string | symbol,
      unknown
    >;
    const sharedRawKey = Symbol.for('raw');
    polluted[sharedRawKey] = true;
    try {
      const target = { x: 1 };
      const proxy = svelteReactiveAdapter.reactive(target);
      expect(proxy).not.toBe(target);
      expect(svelteReactiveAdapter.isReactive(proxy)).toBe(true);
    } finally {
      delete polluted[sharedRawKey];
    }
  });

  it('Object.prototype branded as "REACTIVE_BRAND" via Symbol.for does NOT short-circuit reactive()', () => {
    const polluted = Object.prototype as unknown as Record<
      string | symbol,
      unknown
    >;
    const sharedReactiveKey = Symbol.for('svelte-reactive');
    polluted[sharedReactiveKey] = true;
    try {
      const target = { x: 1 };
      const proxy = svelteReactiveAdapter.reactive(target);
      expect(proxy).not.toBe(target);
    } finally {
      delete polluted[sharedReactiveKey];
    }
  });
});
