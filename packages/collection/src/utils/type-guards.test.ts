import { describe, expect, it } from 'vitest';
import {
  // Type guards
  isReadableCollection,
  isIterable,
  isMap,
  isSet,
  isArray,
  isPlainObject,
  isFunction,
  isDefined,
  isEntry,
  isAsyncIterable,
  // Assertion functions
  assertReadableCollection,
  assertIterable,
  assertMap,
  assertSet,
  assertArray,
  assertPlainObject,
  assertFunction,
  assertDefined,
  assertEntry,
  assertAsyncIterable,
} from './type-guards';
import { MutableCollection } from '../core/MutableCollection';
import { InvalidArgumentError } from '../errors';

describe('Type Guards', () => {
  describe('isReadableCollection', () => {
    it('should return true for MutableCollection', () => {
      const coll = new MutableCollection([['a', 1]]);
      expect(isReadableCollection(coll)).toBe(true);
    });

    it('should return false for plain objects', () => {
      expect(isReadableCollection({})).toBe(false);
      expect(isReadableCollection({ entries: 'not a function' })).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isReadableCollection(null)).toBe(false);
      expect(isReadableCollection(undefined)).toBe(false);
      expect(isReadableCollection(42)).toBe(false);
      expect(isReadableCollection('string')).toBe(false);
    });
  });

  describe('isIterable', () => {
    it('should return true for arrays', () => {
      expect(isIterable([1, 2, 3])).toBe(true);
    });

    it('should return true for strings', () => {
      expect(isIterable('hello')).toBe(true);
    });

    it('should return true for Maps', () => {
      expect(isIterable(new Map())).toBe(true);
    });

    it('should return false for non-iterables', () => {
      expect(isIterable(42)).toBe(false);
      expect(isIterable({})).toBe(false);
      expect(isIterable(null)).toBe(false);
    });
  });

  describe('isMap', () => {
    it('should return true for Map', () => {
      expect(isMap(new Map())).toBe(true);
    });

    it('should return false for non-Maps', () => {
      expect(isMap({})).toBe(false);
      expect(isMap(new WeakMap())).toBe(false);
    });
  });

  describe('isSet', () => {
    it('should return true for Set', () => {
      expect(isSet(new Set())).toBe(true);
    });

    it('should return false for non-Sets', () => {
      expect(isSet([])).toBe(false);
      expect(isSet(new WeakSet())).toBe(false);
    });
  });

  describe('isArray', () => {
    it('should return true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
    });

    it('should return false for non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('array')).toBe(false);
    });
  });

  describe('isPlainObject', () => {
    it('should return true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
      expect(isPlainObject(Object.create(null))).toBe(true);
    });

    it('should return false for class instances', () => {
      expect(isPlainObject(new Map())).toBe(false);
      expect(isPlainObject(new Date())).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isPlainObject([])).toBe(false);
    });

    it('should return false for null', () => {
      expect(isPlainObject(null)).toBe(false);
    });
  });

  describe('isFunction', () => {
    it('should return true for functions', () => {
      expect(isFunction(() => {})).toBe(true);
      expect(isFunction(function () {})).toBe(true);
      expect(isFunction(async () => {})).toBe(true);
    });

    it('should return false for non-functions', () => {
      expect(isFunction({})).toBe(false);
      expect(isFunction('function')).toBe(false);
    });
  });

  describe('isDefined', () => {
    it('should return true for defined values', () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined({})).toBe(true);
    });

    it('should return false for null and undefined', () => {
      expect(isDefined(null)).toBe(false);
      expect(isDefined(undefined)).toBe(false);
    });
  });

  describe('isEntry', () => {
    it('should return true for 2-element arrays', () => {
      expect(isEntry(['a', 1])).toBe(true);
      expect(isEntry([1, 2])).toBe(true);
    });

    it('should return false for other arrays', () => {
      expect(isEntry([1])).toBe(false);
      expect(isEntry([1, 2, 3])).toBe(false);
      expect(isEntry([])).toBe(false);
    });

    it('should return false for non-arrays', () => {
      expect(isEntry({ 0: 'a', 1: 1 })).toBe(false);
    });
  });

  describe('isAsyncIterable', () => {
    it('should return true for async iterables', () => {
      const asyncIterable = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: true, value: undefined }),
        }),
      };
      expect(isAsyncIterable(asyncIterable)).toBe(true);
    });

    it('should return false for sync iterables', () => {
      expect(isAsyncIterable([1, 2, 3])).toBe(false);
    });
  });
});

describe('Assertion Functions', () => {
  describe('assertReadableCollection', () => {
    it('should not throw for valid collections', () => {
      const coll = new MutableCollection([['a', 1]]);
      expect(() => assertReadableCollection(coll)).not.toThrow();
    });

    it('should throw InvalidArgumentError for invalid values', () => {
      expect(() => assertReadableCollection({})).toThrow(InvalidArgumentError);
      expect(() => assertReadableCollection(null)).toThrow(InvalidArgumentError);
    });

    it('should use custom message', () => {
      expect(() => assertReadableCollection({}, 'Custom message')).toThrow('Custom message');
    });
  });

  describe('assertIterable', () => {
    it('should not throw for iterables', () => {
      expect(() => assertIterable([1, 2, 3])).not.toThrow();
      expect(() => assertIterable('hello')).not.toThrow();
    });

    it('should throw for non-iterables', () => {
      expect(() => assertIterable(42)).toThrow(InvalidArgumentError);
    });
  });

  describe('assertMap', () => {
    it('should not throw for Maps', () => {
      expect(() => assertMap(new Map())).not.toThrow();
    });

    it('should throw for non-Maps', () => {
      expect(() => assertMap({})).toThrow(InvalidArgumentError);
    });
  });

  describe('assertSet', () => {
    it('should not throw for Sets', () => {
      expect(() => assertSet(new Set())).not.toThrow();
    });

    it('should throw for non-Sets', () => {
      expect(() => assertSet([])).toThrow(InvalidArgumentError);
    });
  });

  describe('assertArray', () => {
    it('should not throw for arrays', () => {
      expect(() => assertArray([])).not.toThrow();
    });

    it('should throw for non-arrays', () => {
      expect(() => assertArray({})).toThrow(InvalidArgumentError);
    });
  });

  describe('assertPlainObject', () => {
    it('should not throw for plain objects', () => {
      expect(() => assertPlainObject({})).not.toThrow();
    });

    it('should throw for non-plain objects', () => {
      expect(() => assertPlainObject([])).toThrow(InvalidArgumentError);
      expect(() => assertPlainObject(new Map())).toThrow(InvalidArgumentError);
    });
  });

  describe('assertFunction', () => {
    it('should not throw for functions', () => {
      expect(() => assertFunction(() => {})).not.toThrow();
    });

    it('should throw for non-functions', () => {
      expect(() => assertFunction({})).toThrow(InvalidArgumentError);
    });
  });

  describe('assertDefined', () => {
    it('should not throw for defined values', () => {
      expect(() => assertDefined(0)).not.toThrow();
      expect(() => assertDefined('')).not.toThrow();
      expect(() => assertDefined(false)).not.toThrow();
    });

    it('should throw for null and undefined', () => {
      expect(() => assertDefined(null)).toThrow(InvalidArgumentError);
      expect(() => assertDefined(undefined)).toThrow(InvalidArgumentError);
    });
  });

  describe('assertEntry', () => {
    it('should not throw for valid entries', () => {
      expect(() => assertEntry(['a', 1])).not.toThrow();
    });

    it('should throw for invalid entries', () => {
      expect(() => assertEntry([1])).toThrow(InvalidArgumentError);
      expect(() => assertEntry([1, 2, 3])).toThrow(InvalidArgumentError);
    });
  });

  describe('assertAsyncIterable', () => {
    it('should not throw for async iterables', () => {
      const asyncIterable = {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ done: true, value: undefined }),
        }),
      };
      expect(() => assertAsyncIterable(asyncIterable)).not.toThrow();
    });

    it('should throw for non-async-iterables', () => {
      expect(() => assertAsyncIterable([1, 2, 3])).toThrow(InvalidArgumentError);
    });
  });

  describe('type narrowing', () => {
    it('should narrow types after assertion', () => {
      const data: unknown = new MutableCollection([['a', 1]]);
      assertReadableCollection(data);
      // TypeScript should know data is ReadableCollection now
      expect(data.size).toBe(1);
    });

    it('should narrow array types', () => {
      const data: unknown = [1, 2, 3];
      assertArray(data);
      // TypeScript should know data is array now
      expect(data.length).toBe(3);
    });
  });
});
