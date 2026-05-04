import { describe, expect, it } from 'vitest';
import {
  collectionsEqual,
  iterablesEqual,
  mapHashCode,
  mapsEqual,
  optimizedSetOp,
  structuralCompare,
  wouldAnyChange,
  wouldFilterChange,
  wouldKeyTransformChange,
  wouldTransformChange,
} from './structural';

describe('mapsEqual', () => {
  it('should return true for identical maps', () => {
    const map1 = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const map2 = new Map([
      ['a', 1],
      ['b', 2],
    ]);

    expect(mapsEqual(map1, map2)).toBe(true);
  });

  it('should return false for different sizes', () => {
    const map1 = new Map([['a', 1]]);
    const map2 = new Map([
      ['a', 1],
      ['b', 2],
    ]);

    expect(mapsEqual(map1, map2)).toBe(false);
  });

  it('should return false for different keys', () => {
    const map1 = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const map2 = new Map([
      ['c', 1],
      ['d', 2],
    ]);

    expect(mapsEqual(map1, map2)).toBe(false);
  });

  it('should return false for different values', () => {
    const map1 = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const map2 = new Map([
      ['a', 1],
      ['b', 3],
    ]);

    expect(mapsEqual(map1, map2)).toBe(false);
  });

  it('should use Object.is for value comparison', () => {
    const map1 = new Map([
      ['a', NaN],
      ['b', -0],
    ]);
    const map2 = new Map([
      ['a', NaN],
      ['b', +0],
    ]);

    expect(mapsEqual(map1, map1)).toBe(true); // NaN === NaN with Object.is
    expect(mapsEqual(map1, map2)).toBe(false); // -0 !== +0 with Object.is
  });
});

describe('iterablesEqual', () => {
  it('should return true for identical iterables', () => {
    const iter1 = [
      ['a', 1],
      ['b', 2],
    ] as Array<[string, number]>;
    const iter2 = [
      ['a', 1],
      ['b', 2],
    ] as Array<[string, number]>;

    expect(iterablesEqual(iter1, iter2)).toBe(true);
  });

  it('should return false for different lengths', () => {
    const iter1 = [['a', 1]] as Array<[string, number]>;
    const iter2 = [
      ['a', 1],
      ['b', 2],
    ] as Array<[string, number]>;

    expect(iterablesEqual(iter1, iter2)).toBe(false);
  });

  it('should return false for different order', () => {
    const iter1 = [
      ['a', 1],
      ['b', 2],
    ] as Array<[string, number]>;
    const iter2 = [
      ['b', 2],
      ['a', 1],
    ] as Array<[string, number]>;

    expect(iterablesEqual(iter1, iter2)).toBe(false);
  });

  it('should handle empty iterables', () => {
    const iter1: Array<[string, number]> = [];
    const iter2: Array<[string, number]> = [];

    expect(iterablesEqual(iter1, iter2)).toBe(true);
  });
});

describe('wouldTransformChange', () => {
  it('should return false if transformation returns same values', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const identity = (value: number) => value;

    expect(wouldTransformChange(map, identity)).toBe(false);
  });

  it('should return true if transformation changes values', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const double = (value: number) => value * 2;

    expect(wouldTransformChange(map, double)).toBe(true);
  });

  it('should handle empty maps', () => {
    const map = new Map<string, number>();
    const fn = (value: number) => value * 2;

    expect(wouldTransformChange(map, fn)).toBe(false);
  });

  it('should use Object.is for comparison', () => {
    const map = new Map([['a', NaN]]);
    const identity = (value: number) => value;

    expect(wouldTransformChange(map, identity)).toBe(false); // NaN === NaN with Object.is
  });
});

describe('wouldFilterChange', () => {
  it('should return false if all entries pass', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const alwaysTrue = () => true;

    expect(wouldFilterChange(map, alwaysTrue)).toBe(false);
  });

  it('should return true if any entry fails', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const onlyEven = (value: number) => value % 2 === 0;

    expect(wouldFilterChange(map, onlyEven)).toBe(true); // 'a' -> 1 would be filtered
  });

  it('should handle empty maps', () => {
    const map = new Map<string, number>();
    const fn = () => false;

    expect(wouldFilterChange(map, fn)).toBe(false);
  });
});

describe('optimizedSetOp', () => {
  it('should return original map if no changes', () => {
    const original = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const result = new Map([
      ['a', 1],
      ['b', 2],
    ]);

    const optimized = optimizedSetOp(original, result);
    expect(optimized).toBe(original);
  });

  it('should return result map if changed', () => {
    const original = new Map([['a', 1]]);
    const result = new Map([
      ['a', 1],
      ['b', 2],
    ]);

    const optimized = optimizedSetOp(original, result);
    expect(optimized).toBe(result);
    expect(optimized).not.toBe(original);
  });

  it('should respect returnOriginal flag', () => {
    const original = new Map([['a', 1]]);
    const result = new Map([['a', 1]]);

    const optimized = optimizedSetOp(original, result, false);
    expect(optimized).toBe(result); // Not original even though equal
  });
});

describe('collectionsEqual', () => {
  class TestCollection {
    constructor(private data: Map<string, number>) {}

    get size() {
      return this.data.size;
    }
    has(key: string) {
      return this.data.has(key);
    }
    get(key: string) {
      return this.data.get(key);
    }
    entries() {
      return this.data.entries();
    }
  }

  it('should compare collections with same content', () => {
    const coll1 = new TestCollection(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    const coll2 = new TestCollection(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );

    expect(collectionsEqual(coll1, coll2)).toBe(true);
  });

  it('should return false for different sizes', () => {
    const coll1 = new TestCollection(new Map([['a', 1]]));
    const coll2 = new TestCollection(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );

    expect(collectionsEqual(coll1, coll2)).toBe(false);
  });

  it('should return false for different content', () => {
    const coll1 = new TestCollection(new Map([['a', 1]]));
    const coll2 = new TestCollection(new Map([['a', 2]]));

    expect(collectionsEqual(coll1, coll2)).toBe(false);
  });
});

describe('mapHashCode', () => {
  it('should generate same hash for same content', () => {
    const map1 = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const map2 = new Map([
      ['a', 1],
      ['b', 2],
    ]);

    expect(mapHashCode(map1)).toBe(mapHashCode(map2));
  });

  it('should generate different hashes for different content', () => {
    const map1 = new Map([['a', 1]]);
    const map2 = new Map([['b', 2]]);

    expect(mapHashCode(map1)).not.toBe(mapHashCode(map2));
  });

  it('should handle empty maps', () => {
    const map = new Map<string, number>();

    expect(typeof mapHashCode(map)).toBe('number');
  });

  it('should handle different value types', () => {
    const map1 = new Map([['a', 'string']]);
    const map2 = new Map([['a', true]]);
    const map3 = new Map([['a', null]]);

    expect(mapHashCode(map1)).not.toBe(mapHashCode(map2));
    expect(mapHashCode(map2)).not.toBe(mapHashCode(map3));
  });
});

describe('wouldKeyTransformChange', () => {
  it('should return false if keys unchanged', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const identity = (key: string) => key;

    expect(wouldKeyTransformChange(map, identity)).toBe(false);
  });

  it('should return true if keys change', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const prefix = (key: string) => `prefix_${key}`;

    expect(wouldKeyTransformChange(map, prefix)).toBe(true);
  });

  it('should detect key collisions', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const constant = () => 'same';

    expect(wouldKeyTransformChange(map, constant)).toBe(true);
  });

  it('should handle empty maps', () => {
    const map = new Map<string, number>();
    const fn = (key: string) => `prefix_${key}`;

    expect(wouldKeyTransformChange(map, fn)).toBe(false);
  });
});

describe('wouldAnyChange', () => {
  it('should return true if any check returns true', () => {
    const checks = [() => false, () => true, () => false];

    expect(wouldAnyChange(...checks)).toBe(true);
  });

  it('should return false if all checks return false', () => {
    const checks = [() => false, () => false, () => false];

    expect(wouldAnyChange(...checks)).toBe(false);
  });

  it('should short-circuit on first true', () => {
    let called = false;
    const checks = [
      () => true,
      () => {
        called = true;
        return false;
      },
    ];

    expect(wouldAnyChange(...checks)).toBe(true);
    expect(called).toBe(false);
  });
});

describe('structuralCompare', () => {
  it('should compare maps with default options', () => {
    const map1 = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const map2 = new Map([
      ['a', 1],
      ['b', 2],
    ]);

    expect(structuralCompare(map1, map2)).toBe(true);
  });

  it('should use custom equality function', () => {
    const map1 = new Map([['a', 1]]);
    const map2 = new Map([['a', 2]]);

    const customEquals = () => true; // Always equal

    expect(structuralCompare(map1, map2, { equals: customEquals })).toBe(true);
  });

  it('should skip specified keys', () => {
    const map1 = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const map2 = new Map([
      ['a', 1],
      ['b', 3],
      ['c', 4],
    ]);

    const skip = new Set(['b', 'c']);

    expect(structuralCompare(map1, map2, { skip })).toBe(true);
  });

  it('should support deep comparison', () => {
    const map1 = new Map([['a', { x: 1, y: 2 }]]);
    const map2 = new Map([['a', { x: 1, y: 2 }]]);

    expect(structuralCompare(map1, map2, { deep: false })).toBe(false); // Different objects
    expect(structuralCompare(map1, map2, { deep: true })).toBe(true); // Same content
  });

  it('should handle nested objects in deep comparison', () => {
    const map1 = new Map([['a', { x: { y: { z: 1 } } }]]);
    const map2 = new Map([['a', { x: { y: { z: 1 } } }]]);
    const map3 = new Map([['a', { x: { y: { z: 2 } } }]]);

    expect(structuralCompare(map1, map2, { deep: true })).toBe(true);
    expect(structuralCompare(map1, map3, { deep: true })).toBe(false);
  });
});
