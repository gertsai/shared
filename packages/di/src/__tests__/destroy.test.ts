// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Tests for safe-destroy helpers added in Sprint 3.4 (W-4A-4).
 */

import { describe, expect, it, vi } from 'vitest';

import { safeDestroy, safeDestroyAll } from '../destroy';
import type { IDestroyable } from '../types';

const makeDestroyable = (impl?: () => void): IDestroyable & { calls: number } => {
  const obj = {
    calls: 0,
    $destroy() {
      this.calls += 1;
      if (impl) impl();
    },
  };
  return obj;
};

describe('safeDestroy', () => {
  it('invokes $destroy on a destroyable target and returns undefined', () => {
    const target = makeDestroyable();
    const result = safeDestroy(target);
    expect(result).toBeUndefined();
    expect(target.calls).toBe(1);
  });

  it('returns the caught error when $destroy throws, without re-throwing', () => {
    const boom = new Error('explode');
    const target = makeDestroyable(() => {
      throw boom;
    });
    const result = safeDestroy(target);
    expect(result).toBe(boom);
    expect(target.calls).toBe(1);
  });

  it('returns undefined for non-destroyable values without throwing', () => {
    expect(safeDestroy(null)).toBeUndefined();
    expect(safeDestroy(undefined)).toBeUndefined();
    expect(safeDestroy(42)).toBeUndefined();
    expect(safeDestroy({})).toBeUndefined();
    expect(safeDestroy('string')).toBeUndefined();
  });
});

describe('safeDestroyAll', () => {
  it('destroys every destroyable target in order', () => {
    const a = makeDestroyable();
    const b = makeDestroyable();
    const c = makeDestroyable();
    const summary = safeDestroyAll([a, b, c]);
    expect(summary).toEqual({ destroyed: 3, skipped: 0, errors: [] });
    expect(a.calls).toBe(1);
    expect(b.calls).toBe(1);
    expect(c.calls).toBe(1);
  });

  it('skips non-destroyable entries and counts them', () => {
    const a = makeDestroyable();
    const summary = safeDestroyAll([a, null, {}, 'oops', a]);
    expect(summary.destroyed).toBe(2);
    expect(summary.skipped).toBe(3);
    expect(summary.errors).toEqual([]);
    expect(a.calls).toBe(2);
  });

  it('isolates failures and continues the cascade', () => {
    const a = makeDestroyable();
    const failure = new Error('mid-failure');
    const b = makeDestroyable(() => {
      throw failure;
    });
    const c = makeDestroyable();

    const summary = safeDestroyAll([a, b, c]);

    expect(a.calls).toBe(1);
    expect(b.calls).toBe(1);
    expect(c.calls).toBe(1);
    expect(summary.destroyed).toBe(2);
    expect(summary.skipped).toBe(0);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toEqual({ index: 1, error: failure });
  });

  it('reports correct indices for errors when mixed with skips', () => {
    const failure = new Error('boom');
    const ok = makeDestroyable();
    const bad = makeDestroyable(() => {
      throw failure;
    });
    const summary = safeDestroyAll([null, ok, undefined, bad, 7]);
    expect(summary.destroyed).toBe(1);
    expect(summary.skipped).toBe(3);
    expect(summary.errors).toEqual([{ index: 3, error: failure }]);
  });

  it('accepts arbitrary iterables (not just arrays)', () => {
    const a = makeDestroyable();
    const b = makeDestroyable();
    const set = new Set<IDestroyable>([a, b]);
    const summary = safeDestroyAll(set);
    expect(summary.destroyed).toBe(2);
    expect(a.calls).toBe(1);
    expect(b.calls).toBe(1);
  });

  it('handles empty input', () => {
    const summary = safeDestroyAll([]);
    expect(summary).toEqual({ destroyed: 0, skipped: 0, errors: [] });
  });

  it('does not call $destroy more than once per target', () => {
    const target = makeDestroyable();
    const spy = vi.spyOn(target, '$destroy');
    safeDestroyAll([target]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
