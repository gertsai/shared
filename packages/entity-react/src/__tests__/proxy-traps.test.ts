// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import {
  getVersion,
  reactReactiveAdapter,
  subscribe,
} from '../adapter.js';

describe('reactReactiveAdapter — Proxy traps (set/defineProperty/deleteProperty)', () => {
  it('set trap notifies subscribers and bumps version', () => {
    const target: Record<string, unknown> = { a: 1 };
    const proxy = reactReactiveAdapter.reactive(target);
    const cb = vi.fn();
    subscribe(target, cb);

    const v0 = getVersion(target);
    proxy.a = 99;
    expect(cb).toHaveBeenCalledTimes(1);
    expect(getVersion(target)).toBe(v0 + 1);
    expect(target.a).toBe(99);
  });

  it('Object.defineProperty on the proxy notifies subscribers', () => {
    const target: Record<string, unknown> = { a: 1 };
    const proxy = reactReactiveAdapter.reactive(target);
    const cb = vi.fn();
    subscribe(target, cb);

    const v0 = getVersion(target);
    Object.defineProperty(proxy, 'b', {
      value: 'new',
      enumerable: true,
      writable: true,
      configurable: true,
    });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(getVersion(target)).toBe(v0 + 1);
    expect((target as Record<string, unknown>).b).toBe('new');
  });

  it('delete trap notifies subscribers', () => {
    const target: Record<string, unknown> = { a: 1, b: 2 };
    const proxy = reactReactiveAdapter.reactive(target);
    const cb = vi.fn();
    subscribe(target, cb);

    const v0 = getVersion(target);
    delete proxy.a;
    expect(cb).toHaveBeenCalledTimes(1);
    expect(getVersion(target)).toBe(v0 + 1);
    expect('a' in target).toBe(false);
  });

  it('Reflect.set with attacker-controlled receiver still notifies (no receiver bypass)', () => {
    const target: Record<string, unknown> = { x: 1 };
    const proxy = reactReactiveAdapter.reactive(target);
    const cb = vi.fn();
    subscribe(target, cb);

    const attacker = { hijacked: false };
    const ok = Reflect.set(proxy, 'x', 42, attacker);

    expect(ok).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(target.x).toBe(42);
  });

  it('multiple subscribers all notified on a single mutation', () => {
    const target: Record<string, unknown> = { a: 1 };
    const proxy = reactReactiveAdapter.reactive(target);
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();
    subscribe(target, cb1);
    subscribe(target, cb2);
    subscribe(target, cb3);

    proxy.a = 2;
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb3).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops further notifications for that callback only', () => {
    const target: Record<string, unknown> = { a: 1 };
    const proxy = reactReactiveAdapter.reactive(target);
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const off1 = subscribe(target, cb1);
    subscribe(target, cb2);

    proxy.a = 2;
    off1();
    proxy.a = 3;

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(2);
  });
});
