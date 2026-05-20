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

  // Wave 19 / EVID-074 M-R2 — pin markRaw non-reversibility invariant.
  it('markRaw() installs a non-configurable, non-writable brand (one-way)', () => {
    const value = { secret: 1 };
    reactReactiveAdapter.markRaw(value);

    const ownSymbols = Object.getOwnPropertySymbols(value);
    // The RAW symbol is module-private; we can still observe its
    // descriptor through Object.getOwnPropertyDescriptor.
    const rawSym = ownSymbols.find((s) => s.toString() === 'Symbol(raw)');
    expect(rawSym).toBeDefined();
    const desc = Object.getOwnPropertyDescriptor(value, rawSym!);
    expect(desc?.configurable).toBe(false);
    expect(desc?.writable).toBe(false);
    expect(desc?.enumerable).toBe(false);
    expect(desc?.value).toBe(true);
  });

  it('markRaw() brand cannot be overwritten by Object.defineProperty with value: false', () => {
    const value = { secret: 1 };
    reactReactiveAdapter.markRaw(value);
    const rawSym = Object.getOwnPropertySymbols(value).find(
      (s) => s.toString() === 'Symbol(raw)',
    );
    expect(rawSym).toBeDefined();
    // Attempting to flip the brand to `false` MUST throw in strict mode
    // because the original definition pinned `configurable: false`,
    // `writable: false`.
    expect(() =>
      Object.defineProperty(value, rawSym!, {
        value: false,
        configurable: true,
      }),
    ).toThrow();
  });

  it('markRaw() brand cannot be deleted', () => {
    const value: Record<symbol, unknown> = { secret: 1 } as unknown as Record<
      symbol,
      unknown
    >;
    reactReactiveAdapter.markRaw(value);
    const rawSym = Object.getOwnPropertySymbols(value).find(
      (s) => s.toString() === 'Symbol(raw)',
    );
    expect(rawSym).toBeDefined();
    // Strict-mode delete on a non-configurable property throws.
    expect(() => {
      'use strict';
      // @ts-expect-error — deleting a symbol-keyed own property
      delete value[rawSym!];
    }).toThrow();
  });
});
