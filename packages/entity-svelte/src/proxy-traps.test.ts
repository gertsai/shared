// SPDX-License-Identifier: Apache-2.0
/**
 * Proxy trap coverage — set / defineProperty / deleteProperty all notify
 * the backing writable synchronously (CWE-20, ADR-008 Amendment I-13).
 * The `set` trap uses `Reflect.set(target, key, value)` without an
 * external receiver to defeat receiver-injection attacks
 * (CWE-362, ADR-008 Amendment 1.2.5).
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

describe('Proxy traps notify the writable store', () => {
  it('set trap notifies on property assignment', () => {
    const target: Record<string, unknown> = { name: 'Ada' };
    const proxy = svelteReactiveAdapter.reactive(target);
    const store = getStore(target)!;
    let count = 0;
    store.subscribe(() => count++);
    expect(count).toBe(1);
    proxy.name = 'Grace';
    expect(count).toBe(2);
  });

  it('defineProperty trap notifies on Object.defineProperty()', () => {
    const target: Record<string, unknown> = { a: 1 };
    const proxy = svelteReactiveAdapter.reactive(target);
    const store = getStore(target)!;
    let count = 0;
    store.subscribe(() => count++);
    expect(count).toBe(1);
    Object.defineProperty(proxy, 'newKey', {
      value: 42,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    expect(count).toBe(2);
    expect(target.newKey).toBe(42);
  });

  it('deleteProperty trap notifies on delete', () => {
    const target: Record<string, unknown> = { a: 1, b: 2 };
    const proxy = svelteReactiveAdapter.reactive(target);
    const store = getStore(target)!;
    let count = 0;
    store.subscribe(() => count++);
    expect(count).toBe(1);
    delete proxy.a;
    expect(count).toBe(2);
    expect('a' in target).toBe(false);
  });

  it('Reflect.set with attacker-controlled receiver still notifies (no receiver propagation in trap)', () => {
    const target: Record<string, unknown> = { x: 1 };
    const proxy = svelteReactiveAdapter.reactive(target);
    const store = getStore(target)!;
    let count = 0;
    store.subscribe(() => count++);
    expect(count).toBe(1);
    const attackerReceiver: Record<string, unknown> = {};
    Reflect.set(proxy, 'x', 99, attackerReceiver);
    expect(count).toBe(2);
    expect(target.x).toBe(99);
  });

  it('multiple distinct mutations each fire one notification', () => {
    const target: Record<string, unknown> = { a: 1 };
    const proxy = svelteReactiveAdapter.reactive(target);
    const store = getStore(target)!;
    let count = 0;
    store.subscribe(() => count++);
    expect(count).toBe(1);
    proxy.a = 2;
    proxy.a = 3;
    proxy.b = 4;
    expect(count).toBe(4);
  });
});
