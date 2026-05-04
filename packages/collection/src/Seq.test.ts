import { beforeEach, describe, expect, it } from 'vitest';
import { MutableCollection } from './core/MutableCollection';
import { Seq, cachedSeq, seq } from './seq';

describe('Seq', () => {
  let data: Array<[string, number]>;
  let sequence: Seq<string, number>;

  beforeEach(() => {
    data = [
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
      ['e', 5],
    ];
    sequence = new Seq(data);
  });

  describe('Creation', () => {
    it('should create from iterable', () => {
      const entries = Array.from(sequence);
      expect(entries).toEqual(data);
    });

    it('should create from collection', () => {
      const collection = new MutableCollection(data);
      const seqFromCollection = Seq.fromCollection(collection);

      const entries = Array.from(seqFromCollection);
      expect(entries).toEqual(data);
    });

    it('should create using seq function', () => {
      const s1 = seq(data);
      const s2 = seq(new MutableCollection(data));

      expect(Array.from(s1)).toEqual(data);
      expect(Array.from(s2)).toEqual(data);
    });
  });

  describe('Lazy evaluation', () => {
    it('should not execute operations until terminal operation', () => {
      let filterCalled = 0;
      let mapCalled = 0;

      const result = sequence
        .filter((value) => {
          filterCalled++;
          return value > 2;
        })
        .map((value) => {
          mapCalled++;
          return value * 2;
        });

      // No operations should be called yet
      expect(filterCalled).toBe(0);
      expect(mapCalled).toBe(0);

      // Now trigger execution
      const array = result.toArray();

      expect(filterCalled).toBe(5); // Called for all elements
      expect(mapCalled).toBe(3); // Called only for filtered elements
      expect(array).toEqual([6, 8, 10]);
    });
  });

  describe('Filter operation', () => {
    it('should filter values', () => {
      const result = sequence.filter((value) => value % 2 === 0).toArray();

      expect(result).toEqual([2, 4]);
    });

    it('should provide key to filter predicate', () => {
      const result = sequence.filter((value, key) => key > 'b').toArray();

      expect(result).toEqual([3, 4, 5]);
    });
  });

  describe('Map operation', () => {
    it('should transform values', () => {
      const result = sequence.map((value) => value * 2).toArray();

      expect(result).toEqual([2, 4, 6, 8, 10]);
    });

    it('should provide key to map function', () => {
      const result = sequence.map((value, key) => `${key}:${value}`).toArray();

      expect(result).toEqual(['a:1', 'b:2', 'c:3', 'd:4', 'e:5']);
    });
  });

  describe('Take operation', () => {
    it('should take first n elements', () => {
      const result = sequence.take(3).toArray();

      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle take more than size', () => {
      const result = sequence.take(10).toArray();

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle take 0', () => {
      const result = sequence.take(0).toArray();

      expect(result).toEqual([]);
    });
  });

  describe('Skip operation', () => {
    it('should skip first n elements', () => {
      const result = sequence.skip(2).toArray();

      expect(result).toEqual([3, 4, 5]);
    });

    it('should handle skip more than size', () => {
      const result = sequence.skip(10).toArray();

      expect(result).toEqual([]);
    });

    it('should handle skip 0', () => {
      const result = sequence.skip(0).toArray();

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('Chaining operations', () => {
    it('should chain multiple operations', () => {
      const result = sequence
        .filter((value) => value > 1)
        .map((value) => value * 2)
        .skip(1)
        .take(2)
        .toArray();

      expect(result).toEqual([6, 8]);
    });
  });

  describe('Terminal operations', () => {
    it('should convert to collection', () => {
      const result = sequence.filter((value) => value > 2).toCollection();

      expect(result).toBeInstanceOf(MutableCollection);
      expect(result.size).toBe(3);
      expect(result.get('c')).toBe(3);
      expect(result.get('d')).toBe(4);
      expect(result.get('e')).toBe(5);
    });

    it('should convert to array', () => {
      const result = sequence.toArray();

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should get first element', () => {
      expect(sequence.first()).toBe(1);

      const empty = new Seq([]);
      expect(empty.first()).toBeUndefined();
    });

    it('should count elements', () => {
      expect(sequence.count()).toBe(5);

      const filtered = sequence.filter((value) => value > 3);
      expect(filtered.count()).toBe(2);
    });

    it('should reduce to single value', () => {
      const sum = sequence.reduce((acc, value) => acc + value, 0);

      expect(sum).toBe(15);
    });

    it('should check if any element matches', () => {
      expect(sequence.some((value) => value > 3)).toBe(true);
      expect(sequence.some((value) => value > 10)).toBe(false);
    });

    it('should check if all elements match', () => {
      expect(sequence.every((value) => value > 0)).toBe(true);
      expect(sequence.every((value) => value > 3)).toBe(false);
    });

    it('should find element', () => {
      expect(sequence.find((value) => value > 3)).toBe(4);
      expect(sequence.find((value) => value > 10)).toBeUndefined();
    });
  });

  describe('Caching', () => {
    it('should cache results when enabled', () => {
      let callCount = 0;
      const source = new Seq(data, { cacheResults: true }).filter(() => {
        callCount++;
        return true;
      });

      // First iteration
      Array.from(source);
      expect(callCount).toBe(5);

      // Second iteration should use cache
      Array.from(source);
      expect(callCount).toBe(5); // Not called again
    });

    it('should not cache by default', () => {
      let callCount = 0;
      const source = new Seq(data).filter(() => {
        callCount++;
        return true;
      });

      Array.from(source);
      expect(callCount).toBe(5);

      Array.from(source);
      expect(callCount).toBe(10); // Called again
    });

    it('should cache with withCache method', () => {
      let callCount = 0;
      const source = sequence
        .filter(() => {
          callCount++;
          return true;
        })
        .withCache();

      Array.from(source);
      expect(callCount).toBe(5);

      Array.from(source);
      expect(callCount).toBe(5); // Cached
    });

    it('should invalidate cache', () => {
      let callCount = 0;
      const source = new Seq(data, { cacheResults: true }).filter(() => {
        callCount++;
        return true;
      });

      Array.from(source);
      expect(callCount).toBe(5);

      source.invalidateCache();

      Array.from(source);
      expect(callCount).toBe(10); // Called again after invalidation
    });

    it('should force cache with cacheResult', () => {
      let callCount = 0;
      const source = sequence
        .filter(() => {
          callCount++;
          return true;
        })
        .cacheResult();

      // cacheResult forces evaluation and caching
      expect(callCount).toBe(5);

      Array.from(source);
      expect(callCount).toBe(5); // No additional calls
    });
  });

  describe('cachedSeq', () => {
    it('should create cached sequence', () => {
      let callCount = 0;
      const source = cachedSeq(data).filter(() => {
        callCount++;
        return true;
      });

      Array.from(source);
      Array.from(source);

      expect(callCount).toBe(5); // Only called once due to caching
    });

    it('should respect max cache size', () => {
      const source = cachedSeq(data, 2);

      // This should work but with limited cache
      const result = Array.from(source);
      expect(result).toEqual(data);
    });
  });

  describe('Static cached factory', () => {
    it('should create cached Seq from static method', () => {
      let callCount = 0;
      const source = Seq.cached(data).filter(() => {
        callCount++;
        return true;
      });

      Array.from(source);
      Array.from(source);

      expect(callCount).toBe(5); // Cached
    });
  });

  describe('Iteration', () => {
    it('should be iterable multiple times', () => {
      const filtered = sequence.filter((value) => value > 2);

      const result1 = Array.from(filtered);
      const result2 = Array.from(filtered);

      // Seq returns entries [key, value] when iterated
      expect(result1).toEqual([
        ['c', 3],
        ['d', 4],
        ['e', 5],
      ]);
      expect(result2).toEqual([
        ['c', 3],
        ['d', 4],
        ['e', 5],
      ]);
    });

    it('should support for-of loops', () => {
      const results: number[] = [];

      for (const [, value] of sequence.filter((v) => v > 3)) {
        results.push(value);
      }

      expect(results).toEqual([4, 5]);
    });
  });

  describe('toString', () => {
    it('should return string representation', () => {
      const str = sequence.toString();

      expect(str).toContain('Seq');
      expect(str).toContain('operations: 0');

      const filtered = sequence.filter(() => true).map((v) => v);
      expect(filtered.toString()).toContain('operations: 2');
    });
  });
});
