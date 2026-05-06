// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { reactReactiveAdapter, subscribe } from '../adapter.js';

describe('reactReactiveAdapter — re-entrancy guard (CWE-674)', () => {
  it('a subscriber that mutates the same target does not stack-overflow', () => {
    const target: Record<string, number> = { count: 0 };
    const proxy = reactReactiveAdapter.reactive(target);
    let invocations = 0;

    subscribe(target, () => {
      invocations++;
      if (proxy.count < 3) {
        proxy.count = proxy.count + 1;
      }
    });

    proxy.count = 1;

    expect(invocations).toBeGreaterThan(0);
    expect(target.count).toBeGreaterThanOrEqual(1);
  });

  it('synchronous notify in trap propagates a single mutation atomically', () => {
    const target: Record<string, unknown> = { a: 1 };
    const proxy = reactReactiveAdapter.reactive(target);
    const order: string[] = [];

    subscribe(target, () => order.push('cb'));

    order.push('before');
    proxy.a = 2;
    order.push('after');

    expect(order).toEqual(['before', 'cb', 'after']);
  });
});
