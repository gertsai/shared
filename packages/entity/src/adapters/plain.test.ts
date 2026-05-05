// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { plainReactiveAdapter, RAW_MARKER_SYMBOL } from './plain';

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

  it('markRaw() sets the well-known symbol on objects', () => {
    const obj: Record<string | symbol, unknown> = { a: 1 };
    plainReactiveAdapter.markRaw(obj);
    expect(obj[RAW_MARKER_SYMBOL]).toBe(true);
  });

  it('markRaw() leaves primitives unchanged', () => {
    expect(plainReactiveAdapter.markRaw(7)).toBe(7);
    expect(plainReactiveAdapter.markRaw('x')).toBe('x');
  });
});
