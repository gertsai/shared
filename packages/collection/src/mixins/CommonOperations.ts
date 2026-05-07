/**
 * Common collection operations mixin
 * Provides common logic for both MutableCollection and ImmutableCollection
 * Eliminates code duplication between collection types
 *
 * @module mixins/CommonOperations
 */

import type { ReadableCollection } from '../types/interfaces';
import type { HasInternalData } from '../types/internal';
import { INTERNAL_DATA } from '../types/internal';

/**
 * Interface for common collection operations
 * These operations have identical logic for all collection types
 */
export interface CommonOps<K, V> {
  // Equality operations
  equals(other: ReadableCollection<K, V>): boolean;

  // Random access operations
  random(): V | undefined;
  random(amount: number): V[];
  randomKey(): K | undefined;
  randomKey(amount: number): K[];

  // Positional operations
  at(index: number): V | undefined;
  keyAt(index: number): K | undefined;

  // Search operations
  findLast(predicate: (value: V, key: K) => boolean): V | undefined;
  findLastKey(predicate: (value: V, key: K) => boolean): K | undefined;

  // Utility operations
  isEmpty(): boolean;
  compact(): ReadableCollection<K, V>;
  hasAll(...keys: K[]): boolean;
  hasAny(...keys: K[]): boolean;

  // Conversion operations
  toString(): string;
  toJSON(): Array<[K, V]>;
}

/**
 * Mixin class that provides common collection operations
 * Uses composition to add common functionality to collections
 *
 * @template K - The key type
 * @template V - The value type
 * @template T - The collection type (Mutable or Immutable)
 */
export class CommonOpsMixin<K, V, T extends ReadableCollection<K, V>> {
  constructor(
    private readonly collection: T,
    private readonly data: Map<K, V>,
    private readonly createNew: (entries: Iterable<[K, V]>) => T,
  ) {}

  /**
   * Checks if this collection equals another collection
   * Uses Object.is for value comparison
   *
   * @param other - The collection to compare with
   * @returns true if collections are equal, false otherwise
   *
   * @example
   * ```typescript
   * const col1 = new Collection([['a', 1], ['b', 2]]);
   * const col2 = new Collection([['a', 1], ['b', 2]]);
   * console.log(col1.equals(col2)); // true
   * ```
   */
  equals(other: ReadableCollection<K, V>): boolean {
    // Reference equality check
    if (this.collection === other) {
      return true;
    }

    // Size check
    if (this.data.size !== other.size) {
      return false;
    }

    // Deep equality check
    for (const [key, value] of this.data) {
      if (!other.has(key) || !Object.is(other.get(key), value)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Returns a random value from the collection
   * Uses Fisher-Yates algorithm for multiple selections
   *
   * @param amount - Optional number of random values to return
   * @returns Single value or array of values
   *
   * @example
   * ```typescript
   * const col = new Collection([['a', 1], ['b', 2], ['c', 3]]);
   * const randomVal = col.random(); // 1, 2, or 3
   * const randomVals = col.random(2); // e.g., [2, 1]
   * ```
   */
  random(): V | undefined;
  random(amount: number): V[];
  random(amount?: number): V | V[] | undefined {
    const arr = Array.from(this.data.values());

    if (amount === undefined) {
      return arr[Math.floor(Math.random() * arr.length)];
    }

    if (!amount || amount < 0) {
      return [];
    }

    const n = Math.min(amount, arr.length);

    // Fisher-Yates partial shuffle for unique selection
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(Math.random() * (arr.length - i));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr.slice(0, n);
  }

  /**
   * Returns a random key from the collection
   *
   * @param amount - Optional number of random keys to return
   * @returns Single key or array of keys
   */
  randomKey(): K | undefined;
  randomKey(amount: number): K[];
  randomKey(amount?: number): K | K[] | undefined {
    const arr = Array.from(this.data.keys());

    if (amount === undefined) {
      return arr[Math.floor(Math.random() * arr.length)];
    }

    if (!amount || amount < 0) {
      return [];
    }

    const n = Math.min(amount, arr.length);

    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(Math.random() * (arr.length - i));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr.slice(0, n);
  }

  /**
   * Returns the value at the specified index
   * Supports negative indices (from end)
   *
   * @param index - The index to access
   * @returns The value at the index or undefined
   *
   * @example
   * ```typescript
   * const col = new Collection([['a', 1], ['b', 2], ['c', 3]]);
   * console.log(col.at(0)); // 1
   * console.log(col.at(-1)); // 3
   * ```
   */
  at(index: number): V | undefined {
    index = Math.floor(index);
    const arr = [...this.data.values()];
    return arr.at(index);
  }

  /**
   * Returns the key at the specified index
   *
   * @param index - The index to access
   * @returns The key at the index or undefined
   */
  keyAt(index: number): K | undefined {
    index = Math.floor(index);
    const arr = [...this.data.keys()];
    return arr.at(index);
  }

  /**
   * Finds the last value matching the predicate
   * Searches from end to beginning
   *
   * @param predicate - Function to test each value
   * @returns The last matching value or undefined
   */
  findLast(predicate: (value: V, key: K) => boolean): V | undefined {
    const entries = [...this.data.entries()].toReversed();
    for (const [key, val] of entries) {
      if (predicate(val, key)) {
        return val;
      }
    }
    return undefined;
  }

  /**
   * Finds the last key matching the predicate
   *
   * @param predicate - Function to test each value
   * @returns The last matching key or undefined
   */
  findLastKey(predicate: (value: V, key: K) => boolean): K | undefined {
    const entries = [...this.data.entries()].toReversed();
    for (const [key, val] of entries) {
      if (predicate(val, key)) {
        return key;
      }
    }
    return undefined;
  }

  /**
   * Checks if the collection is empty
   *
   * @returns true if collection has no entries
   */
  isEmpty(): boolean {
    return this.data.size === 0;
  }

  /**
   * Removes null and undefined values from the collection
   *
   * @returns New collection without null/undefined values
   *
   * @example
   * ```typescript
   * const col = new Collection([['a', 1], ['b', null], ['c', 3]]);
   * const compacted = col.compact(); // {a: 1, c: 3}
   * ```
   */
  compact(): T {
    const result = new Map<K, V>();
    for (const [key, value] of this.data) {
      if (value != null) {
        result.set(key, value);
      }
    }
    return this.createNew(result);
  }

  /**
   * Checks if the collection has all specified keys
   *
   * @param keys - Keys to check
   * @returns true if all keys exist
   */
  hasAll(...keys: K[]): boolean {
    return keys.every((key) => this.data.has(key));
  }

  /**
   * Checks if the collection has any of the specified keys
   *
   * @param keys - Keys to check
   * @returns true if any key exists
   */
  hasAny(...keys: K[]): boolean {
    return keys.some((key) => this.data.has(key));
  }

  /**
   * Returns a string representation of the collection
   * Format: "CollectionType(size) { key1 => value1, key2 => value2, ... }"
   *
   * @returns String representation
   */
  toString(): string {
    const className = this.collection.constructor.name;
    const entries = Array.from(this.data)
      .map(([k, v]) => `${String(k)} => ${String(v)}`)
      .join(', ');
    return `${className}(${this.data.size}) { ${entries} }`;
  }

  /**
   * Returns a JSON-serializable representation of the collection
   *
   * @returns Array of key-value pairs
   */
  toJSON(): Array<[K, V]> {
    return Array.from(this.data);
  }

  /**
   * Partitions the collection into two based on a predicate
   *
   * @param predicate - Function to test each value
   * @returns Tuple of [passing, failing] collections
   *
   * @example
   * ```typescript
   * const col = new Collection([['a', 1], ['b', 2], ['c', 3]]);
   * const [evens, odds] = col.partition(v => v % 2 === 0);
   * ```
   */
  partition(predicate: (value: V, key: K) => boolean): [T, T] {
    const truthy: Array<[K, V]> = [];
    const falsy: Array<[K, V]> = [];

    for (const [key, val] of this.data) {
      if (predicate(val, key)) {
        truthy.push([key, val]);
      } else {
        falsy.push([key, val]);
      }
    }

    return [this.createNew(truthy), this.createNew(falsy)];
  }

  // Note: mergeWithKeep method is implemented separately in each collection class
  // due to complex type constraints with different value types
}

/**
 * Applies the CommonOps mixin to a collection
 *
 * @param collection - The collection to enhance
 * @param createNew - Factory function to create new instances
 * @returns The collection with common operations
 */
export function withCommonOps<K, V, T extends ReadableCollection<K, V>>(
  collection: T,
  createNew: (entries: Iterable<[K, V]>) => T,
): T & CommonOps<K, V> {
  const data: Map<K, V> = (() => {
    const anyTarget = collection as unknown as {
      data?: Map<K, V>;
    } & HasInternalData<K, V>;
    if (typeof anyTarget[INTERNAL_DATA] === 'function') {
      return anyTarget[INTERNAL_DATA]();
    }
    if (anyTarget.data instanceof Map) {
      return anyTarget.data as Map<K, V>;
    }
    return new Map(collection.entries());
  })();

  const mixin = new CommonOpsMixin(collection, data, createNew);

  // Attach methods explicitly without using any casts
  Object.defineProperty(collection, 'equals', {
    value: (other: ReadableCollection<K, V>) => mixin.equals(other),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(collection, 'random', {
    value: (amount?: number) =>
      (
        mixin as unknown as {
          random: (amount?: number) => V | V[] | undefined;
        }
      ).random(amount),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(collection, 'randomKey', {
    value: (amount?: number) =>
      (
        mixin as unknown as {
          randomKey: (amount?: number) => K | K[] | undefined;
        }
      ).randomKey(amount),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(collection, 'at', {
    value: (index: number) => mixin.at(index),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(collection, 'keyAt', {
    value: (index: number) => mixin.keyAt(index),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(collection, 'findLast', {
    value: (predicate: (value: V, key: K) => boolean) =>
      mixin.findLast(predicate),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(collection, 'findLastKey', {
    value: (predicate: (value: V, key: K) => boolean) =>
      mixin.findLastKey(predicate),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(collection, 'isEmpty', {
    value: () => mixin.isEmpty(),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(collection, 'compact', {
    value: () => mixin.compact(),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(collection, 'hasAll', {
    value: (...keys: K[]) => mixin.hasAll(...keys),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(collection, 'hasAny', {
    value: (...keys: K[]) => mixin.hasAny(...keys),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(collection, 'toString', {
    value: () => mixin.toString(),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(collection, 'toJSON', {
    value: () => mixin.toJSON(),
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(collection, 'partition', {
    value: (predicate: (value: V, key: K) => boolean) =>
      mixin.partition(predicate),
    enumerable: false,
    configurable: true,
  });

  return collection as T & CommonOps<K, V>;
}
