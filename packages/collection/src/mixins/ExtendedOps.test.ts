import { describe, expect, it } from 'vitest';
import { withCommonOps } from './CommonOperations';
import { ExtendedOpsMixin, withExtendedOps } from './ExtendedOps';
import { MutableCollection } from '../core/MutableCollection';
import { createMutableCollection } from '../core/createCollection';
import { INTERNAL_DATA } from '../types/internal';

describe('ExtendedOps', () => {
  it('ensure/hasAll/hasAny/partition/concat/sweep/tap', () => {
    const c = createMutableCollection<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    const ensured = (c as any).ensure('d', () => 4);
    expect(ensured).toBe(4);
    expect(c.get('d')).toBe(4);
    // partition provided by withSharedOps/withCommonOps depending on build; fallback if not available
    const partFn = (c as any).partition as
      | ((fn: (v: number, k: string) => boolean) => [any, any])
      | undefined;
    if (partFn) {
      const parts = partFn((v: number) => v % 2 === 0);
      const even = parts[0];
      const odd = parts[1];
      expect(
        even
          .toArray()
          .map(([, v]: [string, number]) => v)
          .toSorted(),
      ).toEqual([2, 4]);
      expect(
        odd
          .toArray()
          .map(([, v]: [string, number]) => v)
          .toSorted(),
      ).toEqual([1, 3]);
    }
    const c2 = createMutableCollection<string, number>([['x', 10]]);
    const concatFn = (c as any).concat as ((...args: any[]) => any) | undefined;
    if (concatFn && typeof (c as any).clone === 'function') {
      const conc = (c as any).concat(c2);
      expect(conc.get('x')).toBe(10);
    }
    const removed = (c as any).sweep((v: number) => v > 3);
    expect(removed).toBe(1);
    let tapped = 0;
    (c as any).tap(() => {
      tapped++;
    });
    expect(tapped).toBe(1);
  });

  it('random/randomKey handle 0, negative and >size amounts; ensure does not override', () => {
    const base = new MutableCollection<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    const c = withCommonOps(base as any, (es: Iterable<[string, number]>) =>
      createMutableCollection(es),
    ) as any;

    // random value array requests
    expect(c.random(0)).toEqual([]);
    expect(c.random(-1)).toEqual([]);
    const rv = c.random(10) as number[];
    expect(Array.isArray(rv)).toBe(true);
    expect(new Set(rv).size).toBeLessThanOrEqual(3);
    expect(rv.length).toBe(3); // not greater than size

    // randomKey array requests
    expect(c.randomKey(0)).toEqual([]);
    expect(c.randomKey(-1)).toEqual([]);
    const rk = c.randomKey(10) as string[];
    expect(Array.isArray(rk)).toBe(true);
    expect(new Set(rk).size).toBeLessThanOrEqual(3);
    expect(rk.length).toBe(3);

    // ensure does not override existing value
    const existing = c.ensure('a', () => 999);
    expect(existing).toBe(1);
    expect(base.get('a')).toBe(1);
  });

  describe('ExtendedOps - comprehensive tests', () => {
    it('should handle random() with different amounts', () => {
      // random() is in CommonOperations, not ExtendedOps
      const base = new MutableCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
        ['e', 5],
      ]);
      const col = withCommonOps(
        base,
        (es: Iterable<[string, number]>) => new MutableCollection(es),
      ) as any;

      // Single random value
      const single = col.random();
      expect([1, 2, 3, 4, 5]).toContain(single);

      // Multiple random values
      const multiple = col.random(3);
      expect(Array.isArray(multiple)).toBe(true);
      expect(multiple.length).toBe(3);
      multiple.forEach((v: number) => {
        expect([1, 2, 3, 4, 5]).toContain(v);
      });

      // Empty collection
      const emptyBase = new MutableCollection<string, number>([]);
      const empty = withCommonOps(
        emptyBase,
        (es: Iterable<[string, number]>) => new MutableCollection(es),
      ) as any;
      expect(empty.random()).toBeUndefined();
      expect(empty.random(5)).toEqual([]);
    });

    it('should handle randomKey() with different amounts', () => {
      const base = new MutableCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
      const col = withCommonOps(
        base,
        (es: Iterable<[string, number]>) => new MutableCollection(es),
      ) as any;

      // Single random key
      const single = col.randomKey();
      expect(['a', 'b', 'c']).toContain(single);

      // Multiple random keys
      const multiple = col.randomKey(2);
      expect(Array.isArray(multiple)).toBe(true);
      expect(multiple.length).toBe(2);
      multiple.forEach((k: string) => {
        expect(['a', 'b', 'c']).toContain(k);
      });

      // Empty collection
      const emptyBase = new MutableCollection<string, number>([]);
      const empty = withCommonOps(
        emptyBase,
        (es: Iterable<[string, number]>) => new MutableCollection(es),
      ) as any;
      expect(empty.randomKey()).toBeUndefined();
    });

    it('should handle sweep() correctly', () => {
      const col = createMutableCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
      ]);

      // Sweep even numbers
      const removed = (col as any).sweep((v: number) => v % 2 === 0);
      expect(removed).toBe(2);
      expect(col.size).toBe(2);
      expect(col.has('b')).toBe(false);
      expect(col.has('d')).toBe(false);

      // Sweep with no matches
      const removed2 = (col as any).sweep((v: number) => v > 10);
      expect(removed2).toBe(0);
      expect(col.size).toBe(2);

      // Sweep all
      const removed3 = (col as any).sweep(() => true);
      expect(removed3).toBe(2);
      expect(col.size).toBe(0);
    });

    it('should handle tap() for side effects', () => {
      const col = createMutableCollection<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      let sideEffectCount = 0;
      let capturedSize = 0;

      const result = (col as any).tap((c: any) => {
        sideEffectCount++;
        capturedSize = c.size;
        expect(c.has('a')).toBe(true);
        expect(c.get('b')).toBe(2);
      });

      expect(sideEffectCount).toBe(1);
      expect(capturedSize).toBe(2);
      // tap should return the collection
      expect(result).toBeDefined();
    });

    it('should handle ensure() with generator function', () => {
      const col = createMutableCollection<string, number[]>([
        ['existing', [1, 2, 3]],
      ]);

      // Ensure on existing key
      const existing = (col as any).ensure('existing', () => [999]);
      expect(existing).toEqual([1, 2, 3]);

      // Ensure on new key
      const generated = (col as any).ensure('new', (k: string) => {
        expect(k).toBe('new');
        return [4, 5, 6];
      });
      expect(generated).toEqual([4, 5, 6]);
      expect(col.get('new')).toEqual([4, 5, 6]);

      // Ensure with complex generator
      let generatorCalled = false;
      const complex = (col as any).ensure('complex', () => {
        generatorCalled = true;
        return [7, 8, 9];
      });
      expect(generatorCalled).toBe(true);
      expect(complex).toEqual([7, 8, 9]);
    });

    it('should handle concat() with multiple collections', () => {
      const col1 = createMutableCollection<string, number>([
        ['a', 1],
        ['b', 2],
      ]);
      const col2 = createMutableCollection<string, number>([
        ['c', 3],
        ['d', 4],
      ]);
      const col3 = createMutableCollection<string, number>([
        ['e', 5],
        ['b', 99], // Override 'b'
      ]);

      const result = (col1 as any).concat(col2, col3);
      expect(result.size).toBe(5);
      expect(result.get('a')).toBe(1);
      expect(result.get('b')).toBe(99); // Should be overridden
      expect(result.get('c')).toBe(3);
      expect(result.get('d')).toBe(4);
      expect(result.get('e')).toBe(5);

      // Original should be unchanged
      expect(col1.get('b')).toBe(2);
    });

    it('should handle partition() correctly', () => {
      const col = createMutableCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
        ['e', 5],
      ]);

      const partFn = (col as any).partition;
      if (partFn) {
        const [evens, odds] = partFn((v: number) => v % 2 === 0);

        expect(evens.size).toBe(2);
        expect(evens.has('b')).toBe(true);
        expect(evens.has('d')).toBe(true);

        expect(odds.size).toBe(3);
        expect(odds.has('a')).toBe(true);
        expect(odds.has('c')).toBe(true);
        expect(odds.has('e')).toBe(true);
      }
    });

    it('should handle hasAll() correctly', () => {
      const col = createMutableCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const hasAllFn = (col as any).hasAll;
      if (hasAllFn) {
        expect(hasAllFn('a', 'b')).toBe(true);
        expect(hasAllFn('a', 'b', 'c')).toBe(true);
        expect(hasAllFn('a', 'd')).toBe(false);
        expect(hasAllFn('d', 'e')).toBe(false);
        expect(hasAllFn()).toBe(true); // No keys to check
      }
    });

    it('should handle hasAny() correctly', () => {
      const col = createMutableCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const hasAnyFn = (col as any).hasAny;
      if (hasAnyFn) {
        expect(hasAnyFn('a', 'd')).toBe(true);
        expect(hasAnyFn('d', 'e')).toBe(false);
        expect(hasAnyFn('b')).toBe(true);
        expect(hasAnyFn()).toBe(false); // No keys to check
      }
    });

    it('should handle clone() correctly', () => {
      const col = createMutableCollection<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      // clone is a method on MutableCollection, not from ExtendedOps
      const cloned = col.clone();
      expect(cloned.size).toBe(2);
      expect(cloned.get('a')).toBe(1);
      expect(cloned.get('b')).toBe(2);

      // Modify clone, original should be unchanged
      cloned.set('a', 999);
      expect(col.get('a')).toBe(1);
    });
  });

  describe('ExtendedOpsMixin direct tests', () => {
    it('should test sweep method directly', () => {
      const data = new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
      const createNew = (entries: Iterable<[string, number]>) =>
        ({ entries: () => entries }) as any;
      const mixin = new ExtendedOpsMixin(data, createNew);

      // Test removing multiple elements
      const removed = mixin.sweep((v) => v > 1);
      expect(removed).toBe(2);
      expect(data.size).toBe(1);
      expect(data.has('a')).toBe(true);
      expect(data.has('b')).toBe(false);
      expect(data.has('c')).toBe(false);

      // Test removing all elements
      const removedAll = mixin.sweep(() => true);
      expect(removedAll).toBe(1);
      expect(data.size).toBe(0);

      // Test when nothing is removed
      data.set('d', 4);
      const removedNone = mixin.sweep((v) => v > 10);
      expect(removedNone).toBe(0);
      expect(data.size).toBe(1);
    });

    it('should test tap method directly', () => {
      const data = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      const createNew = (entries: Iterable<[string, number]>) =>
        ({ entries: () => entries }) as any;
      const mixin = new ExtendedOpsMixin(data, createNew);

      let sideEffectCount = 0;
      let capturedSize = 0;
      let capturedKeys: string[] = [];

      const result = mixin.tap((collection) => {
        sideEffectCount++;
        capturedSize = collection.size;
        capturedKeys = Array.from(collection.keys());

        // Test access to collection methods inside tap
        expect(collection.has('a')).toBe(true);
        expect(collection.get('b')).toBe(2);
      });

      expect(sideEffectCount).toBe(1);
      expect(capturedSize).toBe(2);
      expect(capturedKeys).toEqual(['a', 'b']);
      expect(result).toBeDefined();

      // Test that tap returns the collection (without testing chaining since it returns new instance without mixin)
      const result2 = mixin.tap(() => {});
      expect(result2).toBeDefined();
    });

    it('should test ensure method directly', () => {
      const data = new Map<string, number>();
      const createNew = (entries: Iterable<[string, number]>) =>
        ({ entries: () => entries }) as any;
      const mixin = new ExtendedOpsMixin(data, createNew);

      // Test creating new value
      let generatorCalled = false;
      const value = mixin.ensure('key', (k) => {
        generatorCalled = true;
        expect(k).toBe('key');
        return 42;
      });
      expect(value).toBe(42);
      expect(data.get('key')).toBe(42);
      expect(generatorCalled).toBe(true);

      // Test returning existing value
      generatorCalled = false;
      const existing = mixin.ensure('key', () => {
        generatorCalled = true;
        return 999;
      });
      expect(existing).toBe(42);
      expect(generatorCalled).toBe(false);

      // Test with different generator types
      const arr = mixin.ensure('array', () => [1, 2, 3]);
      expect(arr).toEqual([1, 2, 3]);

      const obj = mixin.ensure('object', () => ({ foo: 'bar' }));
      expect(obj).toEqual({ foo: 'bar' });
    });

    it('should test concat method directly', () => {
      const data = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      const createNew = (entries: Iterable<[string, number]>) => {
        const map = new Map(entries);
        return {
          entries: () => map.entries(),
          size: map.size,
          get: (k: string) => map.get(k),
          has: (k: string) => map.has(k),
        } as any;
      };
      const mixin = new ExtendedOpsMixin(data, createNew);

      // Test merging multiple collections
      const other1 = {
        entries: () =>
          new Map([
            ['c', 3],
            ['d', 4],
          ]).entries(),
      } as any;

      const other2 = {
        entries: () =>
          new Map([
            ['e', 5],
            ['b', 99],
          ]).entries(),
      } as any;

      const result = mixin.concat(other1, other2);
      expect(result.size).toBe(5);
      expect(result.get('a')).toBe(1);
      expect(result.get('b')).toBe(99); // Should be overridden
      expect(result.get('c')).toBe(3);
      expect(result.get('d')).toBe(4);
      expect(result.get('e')).toBe(5);

      // Test with empty collections
      const empty = {
        entries: () => new Map().entries(),
      } as any;

      const resultWithEmpty = mixin.concat(empty);
      expect(resultWithEmpty.size).toBe(2);
      expect(resultWithEmpty.get('a')).toBe(1);
      expect(resultWithEmpty.get('b')).toBe(2);
    });

    it('should handle tap() view object correctly', () => {
      const data = new Map<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
      const mixin = new ExtendedOpsMixin(data, (entries) => {
        const result = { entries: () => entries } as any;
        // Add tap method to the result for chaining
        result.tap = mixin.tap.bind(mixin);
        return result;
      });

      let viewSize = 0;
      let viewKeys: string[] = [];
      let viewValues: number[] = [];
      let forEachCount = 0;

      // Call tap and get the returned collection
      const result = mixin.tap((view: any) => {
        // Test size property
        viewSize = view.size;

        // Test keys iterator
        viewKeys = Array.from(view.keys());

        // Test values iterator
        viewValues = Array.from(view.values());

        // Test forEach
        view.forEach((_value: number, _key: string) => {
          forEachCount++;
        });

        // Test get and has
        expect(view.get('a')).toBe(1);
        expect(view.has('b')).toBe(true);
        expect(view.has('z')).toBe(false);
      });

      expect(viewSize).toBe(3);
      expect(viewKeys).toEqual(['a', 'b', 'c']);
      expect(viewValues).toEqual([1, 2, 3]);
      expect(forEachCount).toBe(3);
      expect(result).toBeDefined(); // Should return a collection
    });

    it('should handle sweep() with mutation during iteration', () => {
      const data = new Map<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
      ]);
      const mixin = new ExtendedOpsMixin(data, (entries) => {
        return { entries: () => entries } as any;
      });

      // Sweep odd values
      const removed = mixin.sweep((value) => value % 2 === 1);

      expect(removed).toBe(2);
      expect(data.size).toBe(2);
      expect(data.has('a')).toBe(false);
      expect(data.has('c')).toBe(false);
      expect(data.has('b')).toBe(true);
      expect(data.has('d')).toBe(true);
    });

    it('should handle ensure() when key exists with falsy values', () => {
      const data = new Map<string, any>([
        ['zero', 0],
        ['false', false],
        ['null', null],
        ['empty', ''],
      ]);
      const mixin = new ExtendedOpsMixin(data, (entries) => {
        return { entries: () => entries } as any;
      });

      // All these should return existing values, not generate new ones
      expect(mixin.ensure('zero', () => 100)).toBe(0);
      expect(mixin.ensure('false', () => true)).toBe(false);
      expect(mixin.ensure('null', () => 'not null')).toBe(null);
      expect(mixin.ensure('empty', () => 'not empty')).toBe('');

      // Only missing key should generate
      expect(mixin.ensure('missing', () => 'generated')).toBe('generated');
      expect(data.get('missing')).toBe('generated');
    });
  });

  describe('withExtendedOps function', () => {
    it('should add ExtendedOps methods to a collection with INTERNAL_DATA', () => {
      // Mock collection with INTERNAL_DATA
      const data = new Map<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      const mockCollection = {
        [INTERNAL_DATA]: () => data,
        entries: () => data.entries(),
        keys: () => data.keys(),
        values: () => data.values(),
        get: (k: string) => data.get(k),
        has: (k: string) => data.has(k),
        size: data.size,
      } as any;

      const createNew = (entries: Iterable<[string, number]>) => {
        const newData = new Map(entries);
        return {
          [INTERNAL_DATA]: () => newData,
          entries: () => newData.entries(),
          size: newData.size,
        } as any;
      };

      const extended = withExtendedOps(mockCollection, createNew);

      // Check that methods are added
      expect(typeof extended.sweep).toBe('function');
      expect(typeof extended.ensure).toBe('function');
      expect(typeof extended.concat).toBe('function');
      expect(typeof extended.tap).toBe('function');

      // Test sweep
      const removed = extended.sweep((v: number) => v > 2);
      expect(removed).toBe(1);
      expect(data.has('c')).toBe(false);

      // Test ensure
      const ensured = extended.ensure('d', () => 4);
      expect(ensured).toBe(4);
      expect(data.get('d')).toBe(4);

      // Test tap
      let tapped = false;
      const result = extended.tap(() => {
        tapped = true;
      });
      expect(tapped).toBe(true);
      expect(result).toBe(extended);
    });

    it('should add ExtendedOps methods to a collection with data property', () => {
      const data = new Map<string, number>([
        ['a', 1],
        ['b', 2],
      ]);

      const mockCollection = {
        data: data,
        entries: () => data.entries(),
        keys: () => data.keys(),
        values: () => data.values(),
        get: (k: string) => data.get(k),
        has: (k: string) => data.has(k),
        size: data.size,
      } as any;

      const createNew = (entries: Iterable<[string, number]>) => {
        const newData = new Map(entries);
        return {
          data: newData,
          entries: () => newData.entries(),
          size: newData.size,
        } as any;
      };

      const extended = withExtendedOps(mockCollection, createNew);

      // Check that methods are added
      expect(typeof extended.sweep).toBe('function');
      expect(typeof extended.ensure).toBe('function');
      expect(typeof extended.concat).toBe('function');
      expect(typeof extended.tap).toBe('function');

      // Test concat
      const other = {
        entries: () =>
          new Map([
            ['c', 3],
            ['d', 4],
          ]).entries(),
      } as any;

      const concatenated = extended.concat(other);
      expect(concatenated.size).toBe(4);
    });

    it('should add ExtendedOps methods to a collection without data or INTERNAL_DATA', () => {
      const data = new Map<string, string>([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ]);

      const mockCollection = {
        entries: () => data.entries(),
        keys: () => data.keys(),
        values: () => data.values(),
        get: (k: string) => data.get(k),
        has: (k: string) => data.has(k),
        size: data.size,
        forEach: (fn: any) => data.forEach((v, k) => fn(v, k, mockCollection)),
      } as any;

      const createNew = (entries: Iterable<[string, string]>) => {
        const newData = new Map(entries);
        return {
          entries: () => newData.entries(),
          size: newData.size,
        } as any;
      };

      const extended = withExtendedOps(mockCollection, createNew);

      // Check that methods are added
      expect(typeof extended.sweep).toBe('function');
      expect(typeof extended.ensure).toBe('function');
      expect(typeof extended.concat).toBe('function');
      expect(typeof extended.tap).toBe('function');

      // Methods should work even without direct data access
      // They will create a new Map from entries()
      let tapCalled = false;
      extended.tap(() => {
        tapCalled = true;
      });
      expect(tapCalled).toBe(true);
    });

    it('should make added methods non-enumerable', () => {
      const data = new Map([['a', 1]]);

      const mockCollection = {
        data: data,
        entries: () => data.entries(),
        size: data.size,
      } as any;

      const createNew = (entries: any) =>
        ({
          entries: () => entries,
          size: 0,
        }) as any;

      const extended = withExtendedOps(mockCollection, createNew);

      // Methods should not be enumerable
      const keys = Object.keys(extended);
      expect(keys).not.toContain('sweep');
      expect(keys).not.toContain('ensure');
      expect(keys).not.toContain('concat');
      expect(keys).not.toContain('tap');

      // But they should be accessible
      expect(extended.sweep).toBeDefined();
      expect(extended.ensure).toBeDefined();
      expect(extended.concat).toBeDefined();
      expect(extended.tap).toBeDefined();
    });

    it('should make added methods configurable', () => {
      const data = new Map([['a', 1]]);

      const mockCollection = {
        data: data,
        entries: () => data.entries(),
        size: data.size,
      } as any;

      const createNew = (entries: any) =>
        ({
          entries: () => entries,
          size: 0,
        }) as any;

      const extended = withExtendedOps(mockCollection, createNew);

      // Should be able to delete methods
      const originalSweep = extended.sweep;
      expect(originalSweep).toBeDefined();

      delete (extended as any).sweep;
      expect(extended.sweep).toBeUndefined();

      // Should be able to redefine methods
      (extended as any).sweep = 'replaced';
      expect(extended.sweep).toBe('replaced');
    });
  });
});
