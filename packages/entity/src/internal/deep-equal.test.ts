// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { deepEqual } from './deep-equal';

describe('deepEqual', () => {
  it('handles primitives', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('a', 'b')).toBe(false);
    expect(deepEqual(1, '1')).toBe(false);
  });

  it('handles null/undefined', () => {
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual({}, null)).toBe(false);
  });

  it('handles flat objects', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
  });

  it('handles nested objects', () => {
    expect(
      deepEqual(
        { a: { b: { c: [1, 2] } } },
        { a: { b: { c: [1, 2] } } },
      ),
    ).toBe(true);
    expect(
      deepEqual(
        { a: { b: { c: [1, 2] } } },
        { a: { b: { c: [1, 3] } } },
      ),
    ).toBe(false);
  });

  it('handles arrays', () => {
    expect(deepEqual([], [])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 2])).toBe(false);
    expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false);
  });

  it('distinguishes array vs object', () => {
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual({ 0: 'a' }, ['a'])).toBe(false);
  });

  // ---------------- EVID-080 M1: Object.is short-circuit ----------------

  it('treats NaN === NaN as equal (Object.is semantics, EVID-080 M1)', () => {
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual({ x: NaN }, { x: NaN })).toBe(true);
    expect(deepEqual([NaN, 1], [NaN, 1])).toBe(true);
  });

  it('treats +0 and -0 as NOT equal (Object.is semantics, EVID-080 M1)', () => {
    expect(deepEqual(+0, -0)).toBe(false);
    expect(deepEqual(-0, +0)).toBe(false);
    expect(deepEqual({ x: +0 }, { x: -0 })).toBe(false);
  });

  it('still treats 0 === 0 as equal (no regression on plain zero)', () => {
    expect(deepEqual(0, 0)).toBe(true);
    expect(deepEqual(+0, +0)).toBe(true);
    expect(deepEqual(-0, -0)).toBe(true);
  });

  // ---------------- EVID-080 M2: disjoint-key-set guard ----------------

  it('rejects objects with disjoint undefined-only keys (EVID-080 M2)', () => {
    // Both objects have 2 keys, all values undefined, but keys are disjoint.
    // Without the hasOwnProperty guard on `b`, `a[k]` and `b[k]` would both
    // read as `undefined` for every `k` and the loop would falsely return true.
    expect(
      deepEqual(
        { a: undefined, b: undefined },
        { c: undefined, d: undefined },
      ),
    ).toBe(false);
  });

  it('rejects objects with partially overlapping keys (EVID-080 M2)', () => {
    expect(
      deepEqual(
        { a: 1, b: undefined },
        { a: 1, c: undefined },
      ),
    ).toBe(false);
  });

  it('still equates objects where both share the same undefined-valued keys', () => {
    expect(
      deepEqual(
        { a: undefined, b: undefined },
        { a: undefined, b: undefined },
      ),
    ).toBe(true);
  });
});
