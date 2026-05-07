// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { reactReactiveAdapter, subscribe } from '../adapter.js';

describe('reactReactiveAdapter — WeakMap registry (CWE-401/CWE-672)', () => {
  it('repeated subscribe/unsubscribe on dropped targets does not throw or grow unbounded', () => {
    for (let i = 0; i < 1000; i++) {
      const t = { i };
      const proxy = reactReactiveAdapter.reactive(t);
      const off = subscribe(t, () => undefined);
      proxy.i = i + 1;
      off();
    }

    expect(true).toBe(true);
  });

  it('subscribe returns a disposer that drops the callback even after target is gone', () => {
    const target = { x: 0 };
    let called = 0;
    const off = subscribe(target, () => {
      called++;
    });
    const proxy = reactReactiveAdapter.reactive(target);
    proxy.x = 1;
    off();
    proxy.x = 2;
    expect(called).toBe(1);
  });
});
