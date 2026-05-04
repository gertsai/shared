/**
 * Tests for @gertsai/flux utility functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isPromise,
  generateId,
  safeAsync,
  createDeferred,
  debounce,
  throttle,
  deepClone,
} from '../utils';

describe('Utils', () => {
  // --- isPromise ---
  describe('isPromise()', () => {
    it('should return true for native Promise', () => {
      const promise = Promise.resolve('test');
      expect(isPromise(promise)).toBe(true);
    });

    it('should return true for thenable objects', () => {
      const thenable = { then: () => {} };
      expect(isPromise(thenable)).toBe(true);
    });

    it('should return false for non-promises', () => {
      expect(isPromise(null)).toBe(false);
      expect(isPromise(undefined)).toBe(false);
      expect(isPromise(42)).toBe(false);
      expect(isPromise('string')).toBe(false);
      expect(isPromise({ foo: 'bar' })).toBe(false);
      expect(isPromise([])).toBe(false);
      expect(isPromise(() => {})).toBe(false);
    });

    it('should return false for objects with non-function then property', () => {
      const notThenable = { then: 'not a function' };
      expect(isPromise(notThenable)).toBe(false);
    });
  });

  // --- generateId ---
  describe('generateId()', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should include prefix when provided', () => {
      const id = generateId('user-');
      expect(id.startsWith('user-')).toBe(true);
    });

    it('should have expected format', () => {
      const id = generateId();
      // Format: {timestamp_base36}_{random_base36}
      expect(id).toMatch(/^[a-z0-9]+_[a-z0-9]+$/);
    });

    it('should work with empty prefix', () => {
      const id = generateId('');
      expect(id).toMatch(/^[a-z0-9]+_[a-z0-9]+$/);
    });
  });

  // --- safeAsync ---
  describe('safeAsync()', () => {
    it('should return data on success', async () => {
      const result = await safeAsync(() => Promise.resolve('success'));
      expect(result.data).toBe('success');
      expect(result.error).toBeNull();
    });

    it('should return error on rejection', async () => {
      const result = await safeAsync(() => Promise.reject(new Error('failed')));
      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('failed');
    });

    it('should convert non-Error rejections to Error', async () => {
      const result = await safeAsync(() => Promise.reject('string error'));
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('string error');
    });

    it('should call errorHandler on error', async () => {
      const errorHandler = vi.fn();
      await safeAsync(() => Promise.reject(new Error('test')), errorHandler);
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it('should not call errorHandler on success', async () => {
      const errorHandler = vi.fn();
      await safeAsync(() => Promise.resolve('ok'), errorHandler);
      expect(errorHandler).not.toHaveBeenCalled();
    });
  });

  // --- createDeferred ---
  describe('createDeferred()', () => {
    it('should create a resolvable deferred', async () => {
      const deferred = createDeferred<string>();
      setTimeout(() => deferred.resolve('resolved'), 10);
      const result = await deferred.promise;
      expect(result).toBe('resolved');
    });

    it('should create a rejectable deferred', async () => {
      const deferred = createDeferred<string>();
      setTimeout(() => deferred.reject(new Error('rejected')), 10);
      await expect(deferred.promise).rejects.toThrow('rejected');
    });

    it('should return a proper Promise', () => {
      const deferred = createDeferred();
      expect(deferred.promise).toBeInstanceOf(Promise);
      expect(typeof deferred.resolve).toBe('function');
      expect(typeof deferred.reject).toBe('function');
    });
  });

  // --- debounce ---
  describe('debounce()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should delay function execution', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('arg1');
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(99);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('arg1');
    });

    it('should reset timer on subsequent calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('first');
      vi.advanceTimersByTime(50);

      debounced('second');
      vi.advanceTimersByTime(50);

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('second');
    });

    it('should preserve this context', () => {
      const results: number[] = [];
      const obj = {
        value: 42,
        fn: function (this: { value: number }) {
          results.push(this.value);
        },
      };
      const debouncedFn = debounce(obj.fn.bind(obj), 100);

      debouncedFn();
      vi.advanceTimersByTime(100);

      expect(results).toContain(42);
    });
  });

  // --- throttle ---
  describe('throttle()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should execute immediately on first call', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('arg1');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('arg1');
    });

    it('should not execute again within the limit', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('first');
      throttled('second');
      throttled('third');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('first');
    });

    it('should execute after limit expires', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('first');
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      throttled('second');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith('second');
    });

    it('should queue last call and execute after limit', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('first');
      throttled('queued');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('first');

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith('queued');
    });
  });

  // --- deepClone ---
  describe('deepClone()', () => {
    it('should clone primitive values', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('string')).toBe('string');
      expect(deepClone(true)).toBe(true);
      expect(deepClone(null)).toBeNull();
      expect(deepClone(undefined)).toBeUndefined();
    });

    it('should deep clone objects', () => {
      const original = {
        name: 'Alice',
        profile: { age: 30, city: 'NYC' },
      };

      const copy = deepClone(original);

      expect(copy).toEqual(original);
      expect(copy).not.toBe(original);
      expect(copy.profile).not.toBe(original.profile);

      // Modify copy should not affect original
      copy.profile.age = 31;
      expect(original.profile.age).toBe(30);
    });

    it('should deep clone arrays', () => {
      const original = [{ id: 1 }, { id: 2 }];
      const copy = deepClone(original);

      expect(copy).toEqual(original);
      expect(copy).not.toBe(original);
      expect(copy[0]).not.toBe(original[0]);

      copy[0].id = 100;
      expect(original[0].id).toBe(1);
    });

    it('should clone Date objects', () => {
      const original = { created: new Date('2024-01-01') };
      const copy = deepClone(original);

      expect(copy.created.getTime()).toBe(original.created.getTime());
      expect(copy.created).not.toBe(original.created);

      copy.created.setFullYear(2025);
      expect(original.created.getFullYear()).toBe(2024);
    });

    it('should clone Map objects', () => {
      const original = new Map<string, { value: number }>([
        ['a', { value: 1 }],
        ['b', { value: 2 }],
      ]);

      const copy = deepClone(original);

      expect(copy).toBeInstanceOf(Map);
      expect(copy.size).toBe(2);
      expect(copy.get('a')).toEqual({ value: 1 });
      expect(copy.get('a')).not.toBe(original.get('a'));
    });

    it('should clone Set objects', () => {
      const obj1 = { id: 1 };
      const obj2 = { id: 2 };
      const original = new Set([obj1, obj2]);

      const copy = deepClone(original);

      expect(copy).toBeInstanceOf(Set);
      expect(copy.size).toBe(2);

      const copyArray = Array.from(copy);
      expect(copyArray[0]).toEqual(obj1);
      expect(copyArray[0]).not.toBe(obj1);
    });

    it('should handle circular references', () => {
      const original: Record<string, unknown> = { name: 'test' };
      original.self = original;

      const copy = deepClone(original);

      expect(copy.name).toBe('test');
      expect(copy.self).toBe(copy);
      expect(copy.self).not.toBe(original);
    });

    it('should handle deep circular references', () => {
      const original: Record<string, unknown> = {
        level1: {
          level2: {
            value: 'deep',
          },
        },
      };
      (original.level1 as Record<string, unknown>).root = original;

      const copy = deepClone(original);

      expect((copy.level1 as Record<string, unknown>).root).toBe(copy);
      expect(
        ((copy.level1 as Record<string, unknown>).level2 as Record<string, unknown>).value,
      ).toBe('deep');
    });

    it('should handle nested structures with multiple types', () => {
      const original = {
        array: [1, 2, { nested: true }],
        map: new Map([['key', 'value']]),
        set: new Set([1, 2, 3]),
        date: new Date(),
        deep: {
          deeper: {
            deepest: 'value',
          },
        },
      };

      const copy = deepClone(original);

      expect(copy).toEqual(original);
      expect(copy.array).not.toBe(original.array);
      expect(copy.map).not.toBe(original.map);
      expect(copy.set).not.toBe(original.set);
      expect(copy.date).not.toBe(original.date);
      expect(copy.deep.deeper).not.toBe(original.deep.deeper);
    });
  });

  // --- Stress Tests ---
  describe('Stress Tests', () => {
    it('generateId should produce 10000 unique IDs', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 10000; i++) {
        ids.add(generateId());
      }

      // All 10000 IDs should be unique
      expect(ids.size).toBe(10000);
    });

    it('generateId should produce unique IDs with same prefix', () => {
      const ids = new Set<string>();
      const prefix = 'user-';

      for (let i = 0; i < 1000; i++) {
        const id = generateId(prefix);
        expect(id.startsWith(prefix)).toBe(true);
        ids.add(id);
      }

      expect(ids.size).toBe(1000);
    });

    it('deepClone should handle large objects (10000 keys)', () => {
      const original: Record<string, { value: number }> = {};

      for (let i = 0; i < 10000; i++) {
        original[`key${i}`] = { value: i };
      }

      const copy = deepClone(original);

      expect(Object.keys(copy).length).toBe(10000);
      expect(copy).toEqual(original);
      expect(copy).not.toBe(original);
      expect(copy['key9999']).toEqual({ value: 9999 });
      expect(copy['key9999']).not.toBe(original['key9999']);
    });

    it('deepClone should handle deeply nested objects (100 levels)', () => {
      // Create 100-level deep nested object
      let original: Record<string, unknown> = { value: 'deepest' };
      for (let i = 0; i < 100; i++) {
        original = { nested: original };
      }

      const copy = deepClone(original);

      // Traverse to deepest level
      let current: Record<string, unknown> = copy;
      for (let i = 0; i < 100; i++) {
        expect(current.nested).toBeDefined();
        current = current.nested as Record<string, unknown>;
      }
      expect(current.value).toBe('deepest');
    });

    it('deepClone should handle large arrays (10000 items)', () => {
      const original = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `item-${i}`,
      }));

      const copy = deepClone(original);

      expect(copy.length).toBe(10000);
      expect(copy).toEqual(original);
      expect(copy).not.toBe(original);
      expect(copy[9999]).toEqual({ id: 9999, name: 'item-9999' });
      expect(copy[9999]).not.toBe(original[9999]);
    });

    it('deepClone should handle complex circular structures', () => {
      const a: Record<string, unknown> = { name: 'a' };
      const b: Record<string, unknown> = { name: 'b' };
      const c: Record<string, unknown> = { name: 'c' };

      // Create circular references: a -> b -> c -> a
      a.ref = b;
      b.ref = c;
      c.ref = a;

      const copyA = deepClone(a);

      expect(copyA.name).toBe('a');
      expect((copyA.ref as Record<string, unknown>).name).toBe('b');
      expect(((copyA.ref as Record<string, unknown>).ref as Record<string, unknown>).name).toBe(
        'c',
      );
      expect(
        (
          ((copyA.ref as Record<string, unknown>).ref as Record<string, unknown>).ref as Record<
            string,
            unknown
          >
        ).name,
      ).toBe('a');

      // Verify circular reference is preserved
      expect(((copyA.ref as Record<string, unknown>).ref as Record<string, unknown>).ref).toBe(
        copyA,
      );
    });

    it('safeAsync should handle many concurrent operations', async () => {
      const operations = Array.from({ length: 100 }, (_, i) =>
        safeAsync(async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 10));
          return i * 2;
        }),
      );

      const results = await Promise.all(operations);

      expect(results.length).toBe(100);
      results.forEach((result, i) => {
        expect(result.data).toBe(i * 2);
        expect(result.error).toBeNull();
      });
    });

    it('createDeferred should handle many concurrent promises', async () => {
      const deferreds = Array.from({ length: 100 }, () => createDeferred<number>());

      // Resolve all with random delays
      deferreds.forEach((d, i) => {
        setTimeout(() => d.resolve(i), Math.random() * 50);
      });

      const results = await Promise.all(deferreds.map((d) => d.promise));

      expect(results.length).toBe(100);
      results.forEach((result, i) => {
        expect(result).toBe(i);
      });
    });
  });
});
