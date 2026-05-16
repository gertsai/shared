// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { plainReactiveAdapter } from './plain';

describe('plainReactiveAdapter', () => {
  it('reactive() returns the same reference (pass-through)', () => {
    const obj = { a: 1 };
    expect(plainReactiveAdapter.reactive(obj)).toBe(obj);
  });

  it('isReactive() always returns false', () => {
    expect(plainReactiveAdapter.isReactive({})).toBe(false);
    expect(plainReactiveAdapter.isReactive(null)).toBe(false);
    expect(plainReactiveAdapter.isReactive(42)).toBe(false);
  });

  it('markRaw() brands objects so isMarkedRaw() reports true', () => {
    const obj = { a: 1 };
    plainReactiveAdapter.markRaw(obj);
    expect(plainReactiveAdapter.isMarkedRaw(obj)).toBe(true);
  });

  it('markRaw() leaves primitives unchanged', () => {
    expect(plainReactiveAdapter.markRaw(7)).toBe(7);
    expect(plainReactiveAdapter.markRaw('x')).toBe('x');
  });

  // PRD-033 FR-003: brand is module-private and locked.
  it('brand cannot be discovered via the global Symbol registry', () => {
    const v: Record<string | symbol, unknown> = { foo: 1 };
    plainReactiveAdapter.markRaw(v);
    const guessedBrand = Symbol.for('@gertsai/entity:raw');
    // The module-private symbol is NOT in the global registry, so the
    // forged guess must miss.
    expect(v[guessedBrand]).toBeUndefined();
  });

  it('brand is non-deletable and non-writable', () => {
    const v = { foo: 1 };
    const raw = plainReactiveAdapter.markRaw(v);
    // Find the brand symbol via own-symbol enumeration — there is exactly
    // one symbol-keyed own property after markRaw.
    const symbols = Object.getOwnPropertySymbols(raw);
    expect(symbols).toHaveLength(1);
    const brand = symbols[0]!;
    // Property descriptor must be locked.
    const desc = Object.getOwnPropertyDescriptor(raw, brand);
    expect(desc?.configurable).toBe(false);
    expect(desc?.writable).toBe(false);
    expect(desc?.enumerable).toBe(false);
    // delete must throw in strict mode (ES modules are strict).
    expect(() => {
      // @ts-expect-error — testing tamper protection
      delete raw[brand];
    }).toThrow(TypeError);
    expect(plainReactiveAdapter.isMarkedRaw(raw)).toBe(true);
  });
});
