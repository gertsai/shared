import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FluxilisCollection } from '../collection/FluxilisCollection';
import {
  FixtureBuilder,
  SimpleObject,
  simpleObjectBuilder,
  createDog,
  createCat,
  isDog,
  createNumberedEntries,
  createObjectEntries,
  type Animal,
  type Dog,
  type Cat,
} from './fixtures';

describe('FluxilisCollection', () => {
  let collection: FluxilisCollection<string, number>;
  let collectionWithObjects: FluxilisCollection<string, { id: number; value: string }>;

  beforeEach(() => {
    // Create new collection before each test
    collection = new FluxilisCollection<string, number>();
    collectionWithObjects = new FluxilisCollection<string, { id: number; value: string }>();
  });

  // --- Constructor ---
  describe('constructor', () => {
    it('should create an empty collection without arguments', () => {
      expect(collection.size).toBe(0);
    });

    it('should initialize with an array of entries', () => {
      const initialEntries: [string, number][] = [
        ['a', 1],
        ['b', 2],
      ];
      const col = new FluxilisCollection(initialEntries);
      expect(col.size).toBe(2);
      expect(col.get('a')).toBe(1);
      expect(col.get('b')).toBe(2);
    });

    it('should initialize with another FluxilisCollection', () => {
      collection.set('a', 1).set('b', 2);
      const col = new FluxilisCollection(collection);
      expect(col.size).toBe(2);
      expect(col.get('a')).toBe(1);
      expect(col.get('b')).toBe(2);
      // Ensure it's a copy, not the same object
      col.set('c', 3);
      expect(collection.size).toBe(2);
      expect(collection.has('c')).toBe(false);
    });

    it('should initialize with null or undefined as empty', () => {
      const colNull = new FluxilisCollection(null);
      const colUndefined = new FluxilisCollection(undefined);
      expect(colNull.size).toBe(0);
      expect(colUndefined.size).toBe(0);
    });
  });

  // --- Basic CRUD ---
  describe('Basic CRUD', () => {
    it('set() should add a new element and return the collection', () => {
      const result = collection.set('a', 100);
      expect(collection.size).toBe(1);
      expect(collection.has('a')).toBe(true);
      expect(result).toBe(collection); // Check for chaining
    });

    it('set() should update an existing element', () => {
      collection.set('a', 100);
      collection.set('a', 200);
      expect(collection.size).toBe(1);
      expect(collection.get('a')).toBe(200);
    });

    it('get() should retrieve an existing element', () => {
      collection.set('a', 100);
      expect(collection.get('a')).toBe(100);
    });

    it('get() should return undefined for a non-existent element', () => {
      expect(collection.get('nonExistent')).toBeUndefined();
    });

    // NOTE: get(key, defaultValue) overload not available in MutableCollection
    // Use ensure() for get-or-create pattern instead

    it('has() should return true for an existing element', () => {
      collection.set('a', 100);
      expect(collection.has('a')).toBe(true);
    });

    it('has() should return false for a non-existent element', () => {
      expect(collection.has('nonExistent')).toBe(false);
    });

    it('delete() should remove an element and return true', () => {
      collection.set('a', 100);
      const result = collection.delete('a');
      expect(result).toBe(true);
      expect(collection.size).toBe(0);
      expect(collection.has('a')).toBe(false);
    });

    it('delete() should return false for a non-existent element', () => {
      const result = collection.delete('nonExistent');
      expect(result).toBe(false);
      expect(collection.size).toBe(0);
    });

    it('deleteMany() should remove multiple elements and return this for chaining', () => {
      collection.set('a', 1).set('b', 2).set('c', 3).set('d', 4);
      const result = collection.deleteMany(['a', 'c', 'nonExistent']);
      expect(result).toBe(collection); // Returns this for chaining
      expect(collection.size).toBe(2);
      expect(collection.has('a')).toBe(false);
      expect(collection.has('b')).toBe(true);
      expect(collection.has('c')).toBe(false);
      expect(collection.has('d')).toBe(true);
    });

    it('deleteManyCount() should remove multiple elements and return the count', () => {
      collection.set('a', 1).set('b', 2).set('c', 3).set('d', 4);
      const result = collection.deleteManyCount(['a', 'c', 'nonExistent']);
      expect(result).toBe(2);
      expect(collection.size).toBe(2);
    });

    it('deleteManyCount() should return 0 if no elements were removed', () => {
      collection.set('b', 2).set('d', 4);
      const result = collection.deleteManyCount(['a', 'c']);
      expect(result).toBe(0);
      expect(collection.size).toBe(2);
    });

    it('size getter should return the number of elements', () => {
      expect(collection.size).toBe(0);
      collection.set('a', 1);
      expect(collection.size).toBe(1);
      collection.set('b', 2);
      expect(collection.size).toBe(2);
      collection.delete('a');
      expect(collection.size).toBe(1);
    });

    it('clear() should remove all elements', () => {
      collection.set('a', 1).set('b', 2);
      collection.clear();
      expect(collection.size).toBe(0);
      expect(collection.has('a')).toBe(false);
      expect(collection.has('b')).toBe(false);
    });
  });

  // --- Iterators & Array Conversion ---
  describe('Iterators & Array Conversion', () => {
    beforeEach(() => {
      collection.set('a', 1).set('b', 2).set('c', 3);
    });

    it('keys() should return an iterator for keys', () => {
      const keys = Array.from(collection.keys());
      expect(keys).toEqual(['a', 'b', 'c']);
    });

    it('values() should return an iterator for values', () => {
      const values = Array.from(collection.values());
      expect(values).toEqual([1, 2, 3]);
    });

    it('entries() should return an iterator for [key, value] pairs', () => {
      const entries = Array.from(collection.entries());
      expect(entries).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
    });

    it('[Symbol.iterator]() should behave like entries()', () => {
      const entries = Array.from(collection);
      expect(entries).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
    });

    it('forEach() should iterate over each element', () => {
      const results: Array<[number, string]> = [];
      collection.forEach((value, key) => {
        results.push([value, key]);
      });

      expect(results.length).toBe(3);
      expect(results).toEqual([
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
      ]);
    });

    it('forEach() should use thisArg correctly', () => {
      const mockContext = { count: 0 };
      collection.forEach(function (this: { count: number }, value) {
        this.count += value;
      }, mockContext);
      expect(mockContext.count).toBe(6); // 1 + 2 + 3
    });

    it('toArray() should return an array of [key, value] entries', () => {
      const arr = collection.toArray();
      expect(arr).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
    });

    it('keysArray() should return an array of keys', () => {
      const arr = collection.keysArray();
      expect(arr).toEqual(['a', 'b', 'c']);
    });

    it('entriesArray() should return an array of [key, value] pairs', () => {
      const arr = collection.entriesArray();
      expect(arr).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
    });
  });

  // --- Access by Index (at, keyAt) ---
  describe('Access by Index', () => {
    beforeEach(() => {
      collection.set('a', 10).set('b', 20).set('c', 30);
    });

    it('at() should return the value at the specified positive index', () => {
      expect(collection.at(0)).toBe(10);
      expect(collection.at(1)).toBe(20);
      expect(collection.at(2)).toBe(30);
    });

    it('at() should return the value at the specified negative index', () => {
      expect(collection.at(-1)).toBe(30);
      expect(collection.at(-2)).toBe(20);
      expect(collection.at(-3)).toBe(10);
    });

    it('at() should return undefined for out-of-bounds index', () => {
      expect(collection.at(3)).toBeUndefined();
      expect(collection.at(-4)).toBeUndefined();
    });

    it('keyAt() should return the key at the specified positive index', () => {
      expect(collection.keyAt(0)).toBe('a');
      expect(collection.keyAt(1)).toBe('b');
      expect(collection.keyAt(2)).toBe('c');
    });

    it('keyAt() should return the key at the specified negative index', () => {
      expect(collection.keyAt(-1)).toBe('c');
      expect(collection.keyAt(-2)).toBe('b');
      expect(collection.keyAt(-3)).toBe('a');
    });

    it('keyAt() should return undefined for out-of-bounds index', () => {
      expect(collection.keyAt(3)).toBeUndefined();
      expect(collection.keyAt(-4)).toBeUndefined();
    });
  });

  // --- Set Operations ---
  describe('Set Operations', () => {
    let otherCollection: FluxilisCollection<string, number>;

    beforeEach(() => {
      collection.set('a', 1).set('b', 2).set('c', 3);
      otherCollection = new FluxilisCollection<string, number>([
        ['b', 20],
        ['c', 30],
        ['d', 40],
      ]);
    });

    it('merge() should merge another collection into the current one', () => {
      collection.merge(otherCollection);
      expect(collection.size).toBe(4);
      expect(collection.get('a')).toBe(1);
      expect(collection.get('b')).toBe(20); // Overwritten
      expect(collection.get('c')).toBe(30); // Overwritten
      expect(collection.get('d')).toBe(40); // Added
    });

    it('difference() should return elements present only in the first collection', () => {
      const diff = collection.difference(otherCollection);
      expect(diff.size).toBe(1);
      expect(diff.has('a')).toBe(true);
      expect(diff.has('b')).toBe(false);
      expect(diff.has('c')).toBe(false);
      expect(diff.has('d')).toBe(false);
    });

    it('sweep() should remove elements matching the predicate', () => {
      collection.set('e', 5);
      const removedCount = collection.sweep((value) => value % 2 === 0); // Remove even numbers
      expect(removedCount).toBe(1);
      expect(collection.size).toBe(3);
      expect(collection.has('a')).toBe(true);
      expect(collection.has('b')).toBe(false); // Removed
      expect(collection.has('c')).toBe(true);
      expect(collection.has('e')).toBe(true);
    });

    it('sweep() should work with closure for context', () => {
      const threshold = 2;
      const removedCount = collection.sweep((val) => val > threshold);
      expect(removedCount).toBe(1);
      expect(collection.has('c')).toBe(false);
      expect(collection.size).toBe(2);
    });
  });

  // --- Search & Filter Operations ---
  describe('Search & Filter Operations', () => {
    beforeEach(() => {
      collection.set('a', 1).set('b', 2).set('c', 3).set('d', 4);
    });

    it('find() should return the first value matching the predicate', () => {
      const found = collection.find((value) => value > 2);
      expect(found).toBe(3);
    });

    it('find() should return undefined if no value matches', () => {
      const found = collection.find((value) => value > 5);
      expect(found).toBeUndefined();
    });

    it('find() should work with closure for context', () => {
      const threshold = 2;
      const found = collection.find((value) => value > threshold);
      expect(found).toBe(3);
    });

    it('findKey() should return the key of the first value matching the predicate', () => {
      const foundKey = collection.findKey((value) => value > 2);
      expect(foundKey).toBe('c');
    });

    it('findKey() should return undefined if no value matches', () => {
      const foundKey = collection.findKey((value) => value > 5);
      expect(foundKey).toBeUndefined();
    });

    it('findKey() should work with closure for context', () => {
      const threshold = 2;
      const foundKey = collection.findKey((value) => value > threshold);
      expect(foundKey).toBe('c');
    });

    it('filter() should return a new collection with matching elements', () => {
      const filtered = collection.filter((value) => value % 2 === 0); // Even numbers
      expect(filtered.size).toBe(2);
      expect(filtered.has('b')).toBe(true);
      expect(filtered.has('d')).toBe(true);
      expect(filtered.has('a')).toBe(false);
      expect(collection.size).toBe(4); // Original unchanged
    });

    it('filter() should return an empty collection if no elements match', () => {
      const filtered = collection.filter((value) => value > 5);
      expect(filtered.size).toBe(0);
    });

    it('filter() should work with closure for context', () => {
      const isEven = (val: number) => val % 2 === 0;
      const filtered = collection.filter((value) => isEven(value));
      expect(filtered.size).toBe(2);
      expect(filtered.has('b')).toBe(true);
      expect(filtered.has('d')).toBe(true);
    });

    it('some() should return true if at least one element matches', () => {
      expect(collection.some((value) => value > 3)).toBe(true);
    });

    it('some() should return false if no elements match', () => {
      expect(collection.some((value) => value > 5)).toBe(false);
    });

    it('some() should work with closure for context', () => {
      const limit = 3;
      const result = collection.some((value) => value > limit);
      expect(result).toBe(true);
    });

    it('every() should return true if all elements match', () => {
      expect(collection.every((value) => value > 0)).toBe(true);
    });

    it('every() should return false if at least one element does not match', () => {
      expect(collection.every((value) => value < 4)).toBe(false);
    });

    it('every() should return true for an empty collection', () => {
      const emptyCollection = new FluxilisCollection<string, number>();
      expect(emptyCollection.every(() => false)).toBe(true);
    });

    it('every() should work with closure for context', () => {
      const check = (val: number) => val > 0;
      const result = collection.every((value) => check(value));
      expect(result).toBe(true);
    });

    describe('filter() with Type Guard', () => {
      let animalCollection: FluxilisCollection<string, Animal>;
      let dog1: Dog;
      let cat1: Cat;
      let dog2: Dog;

      beforeEach(() => {
        dog1 = { ...createDog({ name: 'Rex' }), bark: vi.fn() };
        cat1 = { ...createCat({ name: 'Whiskers' }), meow: vi.fn() };
        dog2 = { ...createDog({ name: 'Buddy', breed: 'Labrador' }), bark: vi.fn() };

        animalCollection = new FluxilisCollection<string, Animal>([
          ['d1', dog1],
          ['c1', cat1],
          ['d2', dog2],
        ]);
      });

      it('should return a collection with the narrowed type', () => {
        const dogsCollection = animalCollection.filter(isDog);
        expect(dogsCollection.size).toBe(2);
        expect(dogsCollection.has('d1')).toBe(true);
        expect(dogsCollection.has('d2')).toBe(true);
        expect(dogsCollection.has('c1')).toBe(false);

        // Check that type is narrowed and Dog methods can be called
        const firstDog = dogsCollection.get('d1') as Dog;
        expect(firstDog?.type).toBe('dog');
        firstDog?.bark();
        expect(firstDog?.bark).toHaveBeenCalledTimes(1);
      });
    });
  });

  // --- Transformation Methods ---
  describe('Transformation Methods', () => {
    beforeEach(() => {
      collectionWithObjects.set('user1', { id: 1, value: 'A' });
      collectionWithObjects.set('user2', { id: 2, value: 'B' });
      collectionWithObjects.set('user3', { id: 3, value: 'A' });
      collectionWithObjects.set('user4', { id: 4, value: 'C' });

      collection.set('a', 1).set('b', 2).set('c', 3);
    });

    it('map() should return an array of transformed values', () => {
      // Note: MutableCollection.map() returns R[], not a collection
      const mapped = collection.map((value, key) => `${key}:${value * 2}`);
      expect(Array.isArray(mapped)).toBe(true);
      expect(mapped).toEqual(['a:2', 'b:4', 'c:6']);
    });

    it('map() should work with closure for context', () => {
      const prefix = 'item-';
      const mapped = collection.map((value, key) => prefix + key + value);
      expect(mapped).toEqual(['item-a1', 'item-b2', 'item-c3']);
    });

    it('mapValues() should return a collection with transformed values', () => {
      const mapped = collection.mapValues((value) => value * 2);
      expect(mapped.size).toBe(3);
      expect(mapped.get('a')).toBe(2);
      expect(mapped.get('b')).toBe(4);
      expect(mapped.get('c')).toBe(6);
    });

    it('reduce() should reduce the collection to a single value', () => {
      const sum = collection.reduce((acc, value) => acc + value, 0);
      expect(sum).toBe(6); // 1 + 2 + 3
    });

    it('reduce() should work with a different initial value type', () => {
      const combined = collection.reduce((acc, value, key) => acc + key + value, '-');
      expect(combined).toBe('-a1b2c3');
    });

    it('reduce() should work with closure for context', () => {
      const factor = 10;
      const sum = collection.reduce((acc, value) => acc + value * factor, 0);
      expect(sum).toBe(60);
    });

    it('groupBy() should group elements by the result of the function', () => {
      // Note: MutableCollection.groupBy() returns Map<G, Array<[K, V]>>
      const grouped = collectionWithObjects.groupBy((user) => user.value);

      expect(grouped.size).toBe(3);
      expect(grouped.has('A')).toBe(true);
      expect(grouped.has('B')).toBe(true);
      expect(grouped.has('C')).toBe(true);

      const groupA = grouped.get('A');
      expect(Array.isArray(groupA)).toBe(true);
      expect(groupA?.length).toBe(2);
    });

    it('partition() should split the collection into two based on the predicate', () => {
      const [evenValues, oddValues] = collection.partition((value) => value % 2 === 0);

      expect(evenValues.size).toBe(1);
      expect(evenValues.has('b')).toBe(true);
      expect(evenValues.get('b')).toBe(2);

      expect(oddValues.size).toBe(2);
      expect(oddValues.has('a')).toBe(true);
      expect(oddValues.has('c')).toBe(true);
      expect(oddValues.get('a')).toBe(1);
      expect(oddValues.get('c')).toBe(3);
    });

    it('partition() should work with closure for context', () => {
      const threshold = 1;
      const [greaterThan, lessThanOrEqual] = collection.partition((value) => value > threshold);

      expect(greaterThan.size).toBe(2); // 2, 3
      expect(lessThanOrEqual.size).toBe(1); // 1
    });
  });

  // --- Utility & Helper Methods ---
  describe('Utility & Helper Methods', () => {
    beforeEach(() => {
      collection.set('a', 1).set('b', 2);
    });

    it('ensure() should return existing value if key exists', () => {
      const generator = vi.fn(() => 999);
      const value = collection.ensure('a', generator);
      expect(value).toBe(1);
      expect(generator).not.toHaveBeenCalled();
      expect(collection.get('a')).toBe(1);
    });

    it('ensure() should generate, set, and return value if key does not exist', () => {
      const generator = vi.fn(() => 3);
      const value = collection.ensure('c', generator);
      expect(value).toBe(3);
      expect(generator).toHaveBeenCalledTimes(1);
      expect(collection.get('c')).toBe(3);
      expect(collection.size).toBe(3);
    });

    it('setIfAbsent() should set value only if key is absent and return true', () => {
      const result = collection.setIfAbsent('c', 3);
      expect(result).toBe(true);
      expect(collection.has('c')).toBe(true);
      expect(collection.get('c')).toBe(3);
      expect(collection.size).toBe(3);
    });

    it('setIfAbsent() should not set value if key exists and return false', () => {
      const result = collection.setIfAbsent('a', 999);
      expect(result).toBe(false);
      expect(collection.get('a')).toBe(1);
      expect(collection.size).toBe(2);
    });

    it('updateIfPresent() should update value only if key exists and return true', () => {
      const result = collection.updateIfPresent('a', 111);
      expect(result).toBe(true);
      expect(collection.get('a')).toBe(111);
      expect(collection.size).toBe(2);
    });

    it('updateIfPresent() should not update value if key is absent and return false', () => {
      const result = collection.updateIfPresent('c', 333);
      expect(result).toBe(false);
      expect(collection.has('c')).toBe(false);
      expect(collection.size).toBe(2);
    });

    it('hasAll() should return true if all keys exist', () => {
      expect(collection.hasAll('a', 'b')).toBe(true);
    });

    it('hasAll() should return false if at least one key is missing', () => {
      expect(collection.hasAll('a', 'c')).toBe(false);
    });

    it('hasAll() should return true for an empty list of keys', () => {
      expect(collection.hasAll()).toBe(true);
    });

    it('hasAny() should return true if at least one key exists', () => {
      expect(collection.hasAny('a', 'c')).toBe(true);
    });

    it('hasAny() should return false if no keys exist', () => {
      expect(collection.hasAny('c', 'd')).toBe(false);
    });

    it('hasAny() should return false for an empty list of keys', () => {
      expect(collection.hasAny()).toBe(false);
    });

    it('each() should iterate over elements like forEach', () => {
      const mockCallback = vi.fn();
      collection.each(mockCallback);
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('each() should return the collection for chaining', () => {
      const result = collection.each(() => {});
      expect(result).toBe(collection);
    });
  });

  // --- Clone & Equals ---
  describe('Clone & Equals', () => {
    beforeEach(() => {
      collectionWithObjects.set('obj1', { id: 1, value: 'A' });
      collectionWithObjects.set('obj2', { id: 2, value: 'B' });
    });

    it('clone() should create a new collection with the same elements', () => {
      const clone = collectionWithObjects.clone();
      expect(clone).toBeInstanceOf(FluxilisCollection);
      expect(clone).not.toBe(collectionWithObjects);
      expect(clone.size).toBe(collectionWithObjects.size);
      expect(clone.get('obj1')).toEqual(collectionWithObjects.get('obj1'));
      expect(clone.get('obj2')).toEqual(collectionWithObjects.get('obj2'));
    });

    it('clone() should perform a shallow copy', () => {
      const clone = collectionWithObjects.clone();
      const originalObj1 = collectionWithObjects.get('obj1');
      const clonedObj1 = clone.get('obj1');
      expect(clonedObj1).toEqual(originalObj1);
      // Shallow copy - same object references
      expect(clonedObj1).toBe(originalObj1);

      // Change in clone should not affect original
      clone.set('obj3', { id: 3, value: 'C' });
      expect(collectionWithObjects.has('obj3')).toBe(false);
    });

    it('equals() should return true for identical collections', () => {
      const clone = collectionWithObjects.clone();
      expect(collectionWithObjects.equals(clone)).toBe(true);
    });

    it('equals() should return false for collections with different sizes', () => {
      const clone = collectionWithObjects.clone();
      clone.delete('obj1');
      expect(collectionWithObjects.equals(clone)).toBe(false);
    });

    it('equals() should return false for collections with different keys', () => {
      const clone = collectionWithObjects.clone();
      clone.delete('obj1');
      clone.set('obj3', { id: 3, value: 'C' });
      expect(collectionWithObjects.equals(clone)).toBe(false);
    });

    it('equals() should return false for collections with different values', () => {
      const clone = collectionWithObjects.clone();
      clone.set('obj1', { id: 10, value: 'A' });
      expect(collectionWithObjects.equals(clone)).toBe(false);
    });
  });

  // --- TTL Functionality ---
  describe('TTL Functionality', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('setWithTTL() should add an element that expires after the specified time', () => {
      collection.setWithTTL('temp', 123, 1000);
      expect(collection.has('temp')).toBe(true);
      expect(collection.get('temp')).toBe(123);

      vi.advanceTimersByTime(999);
      expect(collection.has('temp')).toBe(true);

      vi.advanceTimersByTime(1);
      expect(collection.has('temp')).toBe(false);
      expect(collection.get('temp')).toBeUndefined();
    });

    it('setting a new TTL for the same key should clear the old timer', () => {
      collection.setWithTTL('temp', 1, 1000);
      collection.setWithTTL('temp', 2, 3000);

      vi.advanceTimersByTime(1500);
      expect(collection.has('temp')).toBe(true);
      expect(collection.get('temp')).toBe(2);

      vi.advanceTimersByTime(1500);
      expect(collection.has('temp')).toBe(false);
    });

    it('delete() should clear the TTL timer for the key', () => {
      collection.setWithTTL('temp', 1, 1000);
      collection.delete('temp');

      vi.advanceTimersByTime(1500);
      expect(collection.has('temp')).toBe(false);
    });

    it('clear() should clear all TTL timers', () => {
      collection.setWithTTL('temp1', 1, 1000);
      collection.setWithTTL('temp2', 2, 2000);
      collection.clear();

      vi.advanceTimersByTime(2500);
      expect(collection.size).toBe(0);
    });

    it('hasTTL() should check if key has active TTL', () => {
      collection.setWithTTL('temp', 1, 1000);
      collection.set('normal', 2);

      expect(collection.hasTTL('temp')).toBe(true);
      expect(collection.hasTTL('normal')).toBe(false);
    });

    it('clearTTL() should remove TTL but keep the value', () => {
      collection.setWithTTL('temp', 1, 1000);
      const cleared = collection.clearTTL('temp');

      expect(cleared).toBe(true);
      expect(collection.hasTTL('temp')).toBe(false);
      expect(collection.has('temp')).toBe(true);

      vi.advanceTimersByTime(2000);
      expect(collection.has('temp')).toBe(true); // Still exists
    });

    it('ttlCount should return number of entries with TTL', () => {
      collection.setWithTTL('temp1', 1, 1000);
      collection.setWithTTL('temp2', 2, 2000);
      collection.set('normal', 3);

      expect(collection.ttlCount).toBe(2);
    });

    it('should emit expired event when TTL expires', () => {
      const expiredListener = vi.fn();
      collection.on('expired', expiredListener);

      collection.setWithTTL('temp', 1, 1000);
      vi.advanceTimersByTime(1000);

      expect(expiredListener).toHaveBeenCalledTimes(1);
      expect(expiredListener).toHaveBeenCalledWith('temp');
    });
  });

  // --- Event Emitter Functionality ---
  describe('Event Emitter Functionality', () => {
    let addListener: ReturnType<typeof vi.fn>;
    let updateListener: ReturnType<typeof vi.fn>;
    let deleteListener: ReturnType<typeof vi.fn>;
    let clearListener: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      addListener = vi.fn();
      updateListener = vi.fn();
      deleteListener = vi.fn();
      clearListener = vi.fn();

      collection.on('add', addListener);
      collection.on('update', updateListener);
      collection.on('delete', deleteListener);
      collection.on('clear', clearListener);
    });

    it("should emit 'add' event when a new element is set", () => {
      collection.set('a', 1);
      expect(addListener).toHaveBeenCalledTimes(1);
      expect(addListener).toHaveBeenCalledWith('a', 1);
      expect(updateListener).not.toHaveBeenCalled();
      expect(deleteListener).not.toHaveBeenCalled();
      expect(clearListener).not.toHaveBeenCalled();
    });

    it("should emit 'update' event when an existing element is set", () => {
      collection.set('a', 1);
      addListener.mockClear();

      collection.set('a', 2);
      expect(updateListener).toHaveBeenCalledTimes(1);
      expect(updateListener).toHaveBeenCalledWith('a', 2);
      expect(addListener).not.toHaveBeenCalled();
      expect(deleteListener).not.toHaveBeenCalled();
      expect(clearListener).not.toHaveBeenCalled();
    });

    it("should emit 'delete' event when an element is deleted", () => {
      collection.set('a', 1);
      addListener.mockClear();

      collection.delete('a');
      expect(deleteListener).toHaveBeenCalledTimes(1);
      expect(deleteListener).toHaveBeenCalledWith('a', 1);
      expect(addListener).not.toHaveBeenCalled();
      expect(updateListener).not.toHaveBeenCalled();
      expect(clearListener).not.toHaveBeenCalled();
    });

    it("should not emit 'delete' event if key does not exist", () => {
      collection.delete('nonExistent');
      expect(deleteListener).not.toHaveBeenCalled();
    });

    it("should emit 'clear' event when clear() is called", () => {
      collection.set('a', 1);
      addListener.mockClear();

      collection.clear();
      expect(clearListener).toHaveBeenCalledTimes(1);
      expect(clearListener).toHaveBeenCalledWith();
      expect(addListener).not.toHaveBeenCalled();
      expect(updateListener).not.toHaveBeenCalled();
      expect(deleteListener).not.toHaveBeenCalled();
    });

    it('off() should remove a specific listener', () => {
      collection.off('add', addListener);
      collection.set('a', 1);
      expect(addListener).not.toHaveBeenCalled();
    });

    it('off() should remove all listeners for an event if no listener is specified', () => {
      const anotherAddListener = vi.fn();
      collection.on('add', anotherAddListener);
      collection.off('add');
      collection.set('a', 1);
      expect(addListener).not.toHaveBeenCalled();
      expect(anotherAddListener).not.toHaveBeenCalled();
    });

    it('once() should register a listener that triggers only once', () => {
      const onceListener = vi.fn();
      collection.once('add', onceListener);

      collection.set('a', 1);
      expect(onceListener).toHaveBeenCalledTimes(1);
      expect(onceListener).toHaveBeenCalledWith('a', 1);

      collection.set('b', 2);
      expect(onceListener).toHaveBeenCalledTimes(1);
    });
  });

  // --- Utility Methods ---
  describe('Utility Methods', () => {
    let numberCollection: FluxilisCollection<string, number>;

    beforeEach(() => {
      numberCollection = new FluxilisCollection<string, number>([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
        ['e', 5],
      ]);
    });

    describe('at()', () => {
      it('should get a value by its position index', () => {
        expect(numberCollection.at(0)).toBe(1);
        expect(numberCollection.at(2)).toBe(3);
        expect(numberCollection.at(4)).toBe(5);
      });

      it('should support negative indices (counting from the end)', () => {
        expect(numberCollection.at(-1)).toBe(5);
        expect(numberCollection.at(-3)).toBe(3);
        expect(numberCollection.at(-5)).toBe(1);
      });

      it('should return undefined for out of range indices', () => {
        expect(numberCollection.at(10)).toBeUndefined();
        expect(numberCollection.at(-10)).toBeUndefined();
      });
    });

    describe('keyAt()', () => {
      it('should get a key by its position index', () => {
        expect(numberCollection.keyAt(0)).toBe('a');
        expect(numberCollection.keyAt(2)).toBe('c');
        expect(numberCollection.keyAt(4)).toBe('e');
      });

      it('should support negative indices (counting from the end)', () => {
        expect(numberCollection.keyAt(-1)).toBe('e');
        expect(numberCollection.keyAt(-3)).toBe('c');
        expect(numberCollection.keyAt(-5)).toBe('a');
      });

      it('should return undefined for out of range indices', () => {
        expect(numberCollection.keyAt(10)).toBeUndefined();
        expect(numberCollection.keyAt(-10)).toBeUndefined();
      });
    });

    describe('partition()', () => {
      it('should split the collection based on a predicate', () => {
        const [even, odd] = numberCollection.partition((value) => value % 2 === 0);

        expect(even.size).toBe(2);
        expect(odd.size).toBe(3);

        expect(even.has('b')).toBe(true);
        expect(even.has('d')).toBe(true);
        expect(even.get('b')).toBe(2);
        expect(even.get('d')).toBe(4);

        expect(odd.has('a')).toBe(true);
        expect(odd.has('c')).toBe(true);
        expect(odd.has('e')).toBe(true);
      });

      it('should handle edge cases correctly', () => {
        const [all, none] = numberCollection.partition(() => true);
        expect(all.size).toBe(5);
        expect(none.size).toBe(0);

        const [none2, all2] = numberCollection.partition(() => false);
        expect(none2.size).toBe(0);
        expect(all2.size).toBe(5);
      });
    });

    describe('each()', () => {
      it('should execute a function for each element and return this', () => {
        const result: number[] = [];
        const returnValue = numberCollection.each((value) => {
          result.push(value);
        });

        expect(result).toEqual([1, 2, 3, 4, 5]);
        expect(returnValue).toBe(numberCollection);
      });

      it('should allow method chaining', () => {
        const result: number[] = [];
        numberCollection.each((v) => result.push(v)).each((v) => result.push(v * 2));

        expect(result).toEqual([1, 2, 3, 4, 5, 2, 4, 6, 8, 10]);
      });
    });

    describe('hasAll()', () => {
      it('should return true if all keys exist', () => {
        expect(numberCollection.hasAll('a', 'c', 'e')).toBe(true);
        expect(numberCollection.hasAll('a')).toBe(true);
      });

      it('should return false if any key does not exist', () => {
        expect(numberCollection.hasAll('a', 'z')).toBe(false);
        expect(numberCollection.hasAll('x', 'y', 'z')).toBe(false);
      });

      it('should return true for empty key list', () => {
        expect(numberCollection.hasAll()).toBe(true);
      });
    });

    describe('hasAny()', () => {
      it('should return true if any key exists', () => {
        expect(numberCollection.hasAny('a', 'z')).toBe(true);
        expect(numberCollection.hasAny('a', 'b', 'c')).toBe(true);
      });

      it('should return false if no keys exist', () => {
        expect(numberCollection.hasAny('x', 'y', 'z')).toBe(false);
      });

      it('should return false for empty key list', () => {
        expect(numberCollection.hasAny()).toBe(false);
      });
    });
  });

  // --- Operations with getMany ---
  describe('Operations with getMany', () => {
    beforeEach(() => {
      collection.set('a', 1).set('b', 2).set('c', 3);
    });

    it('getMany() should retrieve elements using an array of keys', () => {
      const values = collection.getMany(['a', 'c', 'nonExistent']);
      expect(values).toEqual([1, 3, undefined]);
    });

    it('getMany() should retrieve elements using a Set of keys', () => {
      const keysToGet = new Set(['a', 'c', 'nonExistent']);
      const values = collection.getMany(keysToGet);
      expect(values).toEqual([1, 3, undefined]);
    });
  });

  // --- FixtureBuilder Pattern Tests ---
  describe('FixtureBuilder Pattern', () => {
    it('should create collection from numbered entries', () => {
      const entries = createNumberedEntries(5);
      const col = new FluxilisCollection(entries);

      expect(col.size).toBe(5);
      expect(col.get('key-0')).toBe(0);
      expect(col.get('key-4')).toBe(4);
    });

    it('should create collection from object entries using builder', () => {
      const entries = createObjectEntries(3);
      const col = new FluxilisCollection(entries);

      expect(col.size).toBe(3);
      expect(col.get('obj-0')).toEqual({ id: 0, value: 'value-0' });
      expect(col.get('obj-2')).toEqual({ id: 2, value: 'value-2' });
    });

    it('should use FixtureBuilder for complex objects', () => {
      const productBuilder = new FixtureBuilder<{
        id: number;
        name: string;
        price: number;
        category: string;
      }>({
        id: 1,
        name: 'Test Product',
        price: 99.99,
        category: 'electronics',
      });

      const col = new FluxilisCollection<string, ReturnType<typeof productBuilder.build>>();

      col.set('p1', productBuilder.build({ name: 'Laptop', price: 999.99 }));
      col.set('p2', productBuilder.build({ name: 'Phone', price: 699.99 }));
      col.set('p3', productBuilder.build({ id: 3, name: 'Tablet', price: 499.99 }));

      expect(col.size).toBe(3);
      expect(col.get('p1')?.name).toBe('Laptop');
      expect(col.get('p1')?.category).toBe('electronics');
      expect(col.get('p2')?.price).toBe(699.99);
    });

    it('should use buildMany for bulk fixture creation', () => {
      const items = simpleObjectBuilder.buildMany(10);

      const col = new FluxilisCollection<string, SimpleObject>(
        items.map((item, i) => [`item-${i}`, item]),
      );

      expect(col.size).toBe(10);
      expect(col.get('item-0')).toEqual({ id: 1, value: 'test' });
    });

    it('should use buildManyWith for unique fixtures', () => {
      const userBuilder = new FixtureBuilder<{
        id: number;
        name: string;
        email: string;
      }>({
        id: 0,
        name: 'User',
        email: 'user@test.com',
      });

      const users = userBuilder.buildManyWith(5, (i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        email: `user${i + 1}@test.com`,
      }));

      const col = new FluxilisCollection<string, (typeof users)[0]>(
        users.map((u) => [`user-${u.id}`, u]),
      );

      expect(col.size).toBe(5);
      expect(col.get('user-1')?.name).toBe('User 1');
      expect(col.get('user-5')?.email).toBe('user5@test.com');
    });

    it('should combine fixture builders with collection operations', () => {
      const productBuilder = new FixtureBuilder<{
        id: number;
        name: string;
        price: number;
        inStock: boolean;
      }>({
        id: 0,
        name: 'Product',
        price: 10,
        inStock: true,
      });

      const products = productBuilder.buildManyWith(20, (i) => ({
        id: i,
        name: `Product ${i}`,
        price: (i + 1) * 10,
        inStock: i % 3 !== 0,
      }));

      const col = new FluxilisCollection<string, (typeof products)[0]>(
        products.map((p) => [`p-${p.id}`, p]),
      );

      // Filter in-stock items
      const inStock = col.filter((p) => p.inStock);
      expect(inStock.size).toBe(13);

      // Group by price range - returns Map<G, [K, V][]> in MutableCollection
      const grouped = col.groupBy((p) => (p.price <= 100 ? 'cheap' : 'expensive'));
      expect(grouped.get('cheap')?.length).toBe(10);
      expect(grouped.get('expensive')?.length).toBe(10);

      // Partition by stock status
      const [available, unavailable] = col.partition((p) => p.inStock);
      expect(available.size).toBe(13);
      expect(unavailable.size).toBe(7);
    });
  });

  // --- Bug Fix Tests ---
  describe('Bug Fix Tests', () => {
    describe('delete() should emit event for undefined values', () => {
      it('should emit delete event when value is undefined', () => {
        const col = new FluxilisCollection<string, string | undefined>();
        const deleteListener = vi.fn();
        col.on('delete', deleteListener);

        col.set('key', undefined);
        col.delete('key');

        expect(deleteListener).toHaveBeenCalledTimes(1);
        expect(deleteListener).toHaveBeenCalledWith('key', undefined);
      });

      it('should emit delete event for explicit undefined vs missing key', () => {
        const col = new FluxilisCollection<string, number | undefined>();
        const deleteListener = vi.fn();
        col.on('delete', deleteListener);

        col.set('explicit', undefined);
        col.set('withValue', 42);

        col.delete('explicit'); // Should emit with undefined
        col.delete('withValue'); // Should emit with 42
        col.delete('nonExistent'); // Should NOT emit

        expect(deleteListener).toHaveBeenCalledTimes(2);
        expect(deleteListener).toHaveBeenNthCalledWith(1, 'explicit', undefined);
        expect(deleteListener).toHaveBeenNthCalledWith(2, 'withValue', 42);
      });
    });

    describe('TTL race condition prevention', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should not delete fresh data when setWithTTL is called again before expiration', () => {
        const col = new FluxilisCollection<string, number>();
        const expiredListener = vi.fn();
        col.on('expired', expiredListener);

        // First TTL - 100ms
        col.setWithTTL('key', 1, 100);

        // Before expiration, set new value with longer TTL
        vi.advanceTimersByTime(50);
        col.setWithTTL('key', 2, 200);

        // Original timer would fire at 100ms (50ms from now)
        vi.advanceTimersByTime(60); // Now at 110ms total

        // Key should still exist with value 2
        expect(col.has('key')).toBe(true);
        expect(col.get('key')).toBe(2);
        expect(expiredListener).not.toHaveBeenCalled();

        // Now wait for second timer (200ms from 50ms = 250ms total, 140ms from now)
        vi.advanceTimersByTime(150);

        // Now it should be expired
        expect(col.has('key')).toBe(false);
        expect(expiredListener).toHaveBeenCalledTimes(1);
        expect(expiredListener).toHaveBeenCalledWith('key');
      });

      it('should handle rapid setWithTTL calls correctly', () => {
        const col = new FluxilisCollection<string, number>();
        const expiredListener = vi.fn();
        col.on('expired', expiredListener);

        // Rapid calls
        col.setWithTTL('key', 1, 100);
        col.setWithTTL('key', 2, 100);
        col.setWithTTL('key', 3, 100);

        vi.advanceTimersByTime(150);

        // Only one expiration should happen (the last one)
        expect(col.has('key')).toBe(false);
        expect(expiredListener).toHaveBeenCalledTimes(1);
      });

      it('should emit delete event with correct value on TTL expiration for undefined', () => {
        const col = new FluxilisCollection<string, undefined>();
        const deleteListener = vi.fn();
        const expiredListener = vi.fn();

        col.on('delete', deleteListener);
        col.on('expired', expiredListener);

        col.setWithTTL('key', undefined, 100);

        vi.advanceTimersByTime(150);

        expect(deleteListener).toHaveBeenCalledWith('key', undefined);
        expect(expiredListener).toHaveBeenCalledWith('key');
      });
    });

    describe('TTL validation', () => {
      it('should throw on zero TTL', () => {
        const col = new FluxilisCollection<string, number>();
        expect(() => col.setWithTTL('key', 1, 0)).toThrow('TTL must be a positive number');
      });

      it('should throw on negative TTL', () => {
        const col = new FluxilisCollection<string, number>();
        expect(() => col.setWithTTL('key', 1, -100)).toThrow('TTL must be a positive number');
      });

      it('should throw on NaN TTL', () => {
        const col = new FluxilisCollection<string, number>();
        expect(() => col.setWithTTL('key', 1, NaN)).toThrow('TTL must be a positive number');
      });

      it('should throw on Infinity TTL', () => {
        const col = new FluxilisCollection<string, number>();
        expect(() => col.setWithTTL('key', 1, Infinity)).toThrow('TTL must be a positive number');
      });
    });
  });

  // --- random() and randomKey() Tests ---
  describe('random() and randomKey()', () => {
    let col: FluxilisCollection<string, number>;

    beforeEach(() => {
      col = new FluxilisCollection([
        ['a', 1],
        ['b', 2],
        ['c', 3],
        ['d', 4],
        ['e', 5],
      ]);
    });

    describe('random()', () => {
      it('should return undefined for empty collection', () => {
        const empty = new FluxilisCollection<string, number>();
        expect(empty.random()).toBeUndefined();
      });

      it('should return empty array for empty collection with amount', () => {
        const empty = new FluxilisCollection<string, number>();
        expect(empty.random(3)).toEqual([]);
      });

      it('should return a value from the collection', () => {
        const value = col.random();
        expect([1, 2, 3, 4, 5]).toContain(value);
      });

      it('should return array of specified length', () => {
        const values = col.random(3);
        expect(values).toHaveLength(3);
        values.forEach((v) => expect([1, 2, 3, 4, 5]).toContain(v));
      });

      it('should return all values when amount exceeds size', () => {
        const values = col.random(10);
        expect(values).toHaveLength(5);
      });

      it('should return empty array for amount <= 0', () => {
        expect(col.random(0)).toEqual([]);
        expect(col.random(-1)).toEqual([]);
      });

      it('should return unique values (no duplicates)', () => {
        const values = col.random(5);
        const unique = new Set(values);
        expect(unique.size).toBe(5);
      });

      it('should work correctly with single-item collection', () => {
        const single = new FluxilisCollection([['only', 42]]);
        expect(single.random()).toBe(42);
        expect(single.random(1)).toEqual([42]);
        expect(single.random(3)).toEqual([42]); // Can't return more than exists
      });
    });

    describe('randomKey()', () => {
      it('should return undefined for empty collection', () => {
        const empty = new FluxilisCollection<string, number>();
        expect(empty.randomKey()).toBeUndefined();
      });

      it('should return empty array for empty collection with amount', () => {
        const empty = new FluxilisCollection<string, number>();
        expect(empty.randomKey(3)).toEqual([]);
      });

      it('should return a key from the collection', () => {
        const key = col.randomKey();
        expect(['a', 'b', 'c', 'd', 'e']).toContain(key);
      });

      it('should return array of specified length', () => {
        const keys = col.randomKey(3);
        expect(keys).toHaveLength(3);
        keys.forEach((k) => expect(['a', 'b', 'c', 'd', 'e']).toContain(k));
      });

      it('should return all keys when amount exceeds size', () => {
        const keys = col.randomKey(10);
        expect(keys).toHaveLength(5);
      });

      it('should return empty array for amount <= 0', () => {
        expect(col.randomKey(0)).toEqual([]);
        expect(col.randomKey(-1)).toEqual([]);
      });

      it('should return unique keys (no duplicates)', () => {
        const keys = col.randomKey(5);
        const unique = new Set(keys);
        expect(unique.size).toBe(5);
      });

      it('should work correctly with single-item collection', () => {
        const single = new FluxilisCollection([['only', 42]]);
        expect(single.randomKey()).toBe('only');
        expect(single.randomKey(1)).toEqual(['only']);
        expect(single.randomKey(3)).toEqual(['only']); // Can't return more than exists
      });
    });
  });
});
