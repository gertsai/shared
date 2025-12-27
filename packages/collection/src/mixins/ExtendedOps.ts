/**
 * Extended collection operations mixin
 * Provides additional utility methods for collections
 * Following SOLID principle - Single Responsibility
 *
 * Note: Common operations like random(), hasAll(), hasAny(), partition()
 * are now provided by CommonOperations mixin to avoid duplication
 */

import type { ReadableCollection } from '../types/interfaces';
import type { HasInternalData } from '../types/internal';
import { INTERNAL_DATA } from '../types/internal';

/**
 * Interface for extended collection operations
 * Contains only operations unique to this mixin
 */
export interface ExtendedOps<K, V> {
  // Mutation operations
  sweep(fn: (value: V, key: K) => boolean): number;
  ensure(key: K, defaultValueGenerator: (key: K) => V): V;

  // Utility operations
  tap(fn: (collection: ReadableCollection<K, V>) => void): this;
  concat(...collections: ReadableCollection<K, V>[]): this;
}

/**
 * Implementation of extended collection operations
 * Focuses on unique operations not covered by CommonOperations
 */
export class ExtendedOpsMixin<K, V> {
  constructor(
    private readonly data: Map<K, V>,
    private readonly createNew: (
      entries: Iterable<[K, V]>,
    ) => ReadableCollection<K, V>,
  ) {}

  /**
   * Remove items that match the provided filter function
   * @param fn - Predicate function to test each value
   * @returns The number of removed entries
   * @example
   * ```typescript
   * const col = new Collection([['a', 1], ['b', 2], ['c', 3]]);
   * const removed = col.sweep(v => v > 1); // Removes 'b' and 'c'
   * console.log(removed); // 2
   * ```
   */
  sweep(fn: (value: V, key: K) => boolean): number {
    const previousSize = this.data.size;
    for (const [key, value] of this.data) {
      if (fn(value, key)) {
        this.data.delete(key);
      }
    }
    return previousSize - this.data.size;
  }

  /**
   * Tap into the collection for side effects
   * @param fn - Function that receives the collection for side effects
   * @returns The original collection for chaining
   * @example
   * ```typescript
   * const col = new Collection([['a', 1], ['b', 2]])
   *   .tap(col => console.log('Size:', col.size))
   *   .tap(col => console.log('Keys:', Array.from(col.keys())));
   * ```
   */
  tap(
    fn: (collection: ReadableCollection<K, V>) => void,
  ): ReadableCollection<K, V> {
    // This mixin does not itself implement ReadableCollection, so tap is assigned on target below.
    // Provide a minimal read-only view without any 'any' usage.
    const data = this.data;
    const view: ReadableCollection<K, V> = {
      get: (key: K) => data.get(key),
      has: (key: K) => data.has(key),
      get size() {
        return data.size;
      },
      entries: () => data.entries(),
      keys: () => data.keys(),
      values: () => data.values(),
      forEach: (
        callbackfn: (
          value: V,
          key: K,
          collection: ReadableCollection<K, V>,
        ) => void,
        thisArg?: any,
      ) => {
        for (const [k, v] of data) {
          callbackfn.call(thisArg, v, k, view);
        }
      },
      [Symbol.iterator]: () => data[Symbol.iterator](),
      equals: (other: ReadableCollection<K, V>) => {
        if (view.size !== other.size) {
          return false;
        }
        for (const [key, value] of view) {
          if (!other.has(key) || !Object.is(other.get(key), value)) {
            return false;
          }
        }
        return true;
      },
    };
    fn(view);
    return view;
  }

  /**
   * Ensure a value exists, or set it using the default generator
   * @param key - The key to check
   * @param defaultValueGenerator - Function to generate default value if key doesn't exist
   * @returns The existing or newly created value
   * @example
   * ```typescript
   * const col = new Collection<string, number[]>();
   * const arr = col.ensure('items', () => []);
   * arr.push(1); // Safe to use immediately
   * ```
   */
  ensure(key: K, defaultValueGenerator: (key: K) => V): V {
    const existing = this.data.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const defaultValue = defaultValueGenerator(key);
    this.data.set(key, defaultValue);
    return defaultValue;
  }

  /**
   * Concatenate multiple collections
   * @param collections - Collections to merge with this one
   * @returns New collection containing all entries
   * @example
   * ```typescript
   * const col1 = new Collection([['a', 1]]);
   * const col2 = new Collection([['b', 2]]);
   * const col3 = new Collection([['c', 3]]);
   * const merged = col1.concat(col2, col3); // {a: 1, b: 2, c: 3}
   * ```
   */
  concat(...collections: ReadableCollection<K, V>[]): ReadableCollection<K, V> {
    const entries = new Map(this.data);
    for (const collection of collections) {
      for (const [key, value] of collection.entries()) {
        entries.set(key, value);
      }
    }
    return this.createNew(entries);
  }
}

/**
 * Apply extended operations mixin to a collection
 * Note: This mixin should be applied AFTER CommonOperations mixin
 * which provides the basic operations (random, hasAll, hasAny, partition)
 */
export function withExtendedOps<
  K,
  V,
  T extends ReadableCollection<K, V> &
    (Partial<{ data: Map<K, V> }> | HasInternalData<K, V>),
>(
  target: T,
  createNew: (entries: Iterable<[K, V]>) => T,
): T & ExtendedOps<K, V> {
  const mapAccessor = ((): Map<K, V> => {
    const anyTarget = target as unknown as {
      data?: Map<K, V>;
    } & HasInternalData<K, V>;
    if (
      typeof (anyTarget as HasInternalData<K, V>)[INTERNAL_DATA] === 'function'
    ) {
      return (anyTarget as HasInternalData<K, V>)[INTERNAL_DATA]();
    }
    if (anyTarget.data instanceof Map) {
      return anyTarget.data as Map<K, V>;
    }
    return new Map<K, V>(target.entries());
  })();

  const mixin = new ExtendedOpsMixin<K, V>(mapAccessor, createNew);

  // Bind unique methods to the target collection
  Object.defineProperty(target, 'sweep', {
    value: mixin.sweep.bind(mixin),
    enumerable: false,
    configurable: true,
  });

  Object.defineProperty(target, 'ensure', {
    value: mixin.ensure.bind(mixin),
    enumerable: false,
    configurable: true,
  });

  Object.defineProperty(target, 'concat', {
    value: mixin.concat.bind(mixin),
    enumerable: false,
    configurable: true,
  });

  Object.defineProperty(target, 'tap', {
    value: (fn: (collection: ReadableCollection<K, V>) => void) => {
      fn(target);
      return target;
    },
    enumerable: false,
    configurable: true,
  });

  return target as T & ExtendedOps<K, V>;
}
