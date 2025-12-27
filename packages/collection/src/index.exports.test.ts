import { describe, expect, it } from 'vitest';
import * as pkg from './index';

describe('index exports smoke', () => {
  it('exposes key classes and functions', () => {
    expect(typeof pkg.VERSION).toBe('string');
    expect(pkg.MutableCollection).toBeTruthy();
    expect(pkg.ImmutableCollection).toBeTruthy();
    expect(pkg.PersistentCollection).toBeTruthy();
    expect(pkg.aggregate).toBeTruthy();
    expect(pkg.search).toBeTruthy();
    expect(pkg.transform).toBeTruthy();
    expect(pkg.set).toBeTruthy();
    expect(pkg.memoized).toBeTruthy();
    // factory helpers
    expect(typeof pkg.mutable).toBe('function');
    expect(typeof pkg.immutable).toBe('function');
  });
});
