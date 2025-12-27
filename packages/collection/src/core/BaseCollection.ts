/**
 * Base abstract class for all collection types
 * Provides core functionality using composition with operations
 *
 * @template K - The type of keys in the collection
 * @template V - The type of values in the collection
 *
 * @remarks
 * This class serves as the foundation for both MutableCollection and ImmutableCollection.
 * It implements read-only operations and delegates to operation modules for actual logic.
 *
 * @example
 * ```typescript
 * // Don't instantiate directly, use MutableCollection or ImmutableCollection
 * const collection = new MutableCollection([['key1', 'value1'], ['key2', 'value2']]);
 * ```
 */

import {
  count as countOp,
  first as firstOp,
  groupBy as groupByOp,
  last as lastOp,
  reduce as reduceOp,
} from '../operations/aggregate';
import {
  every as everyOp,
  filterIter as filterIterOp,
  filter as filterOp,
  findKey as findKeyOp,
  find as findOp,
  skip as skipOp,
  some as someOp,
  take as takeOp,
} from '../operations/search';
import {
  flatMap as flatMapOp,
  mapEntries as mapEntriesOp,
  mapKeys as mapKeysOp,
  map as mapOp,
  mapValues as mapValuesOp,
} from '../operations/transform';
import type {
  AggregateOps,
  ConversionOps,
  ReadableCollection,
  SearchOps,
  TransformOps,
} from '../types/interfaces';
import type { HasInternalData } from '../types/internal';
import { INTERNAL_DATA } from '../types/internal';
import { equalsByObjectIs } from '../utils/equality';

/**
 * Base class that provides read-only operations
 */
export class BaseCollection<K, V>
  implements
    ReadableCollection<K, V>,
    SearchOps<K, V>,
    TransformOps<K, V>,
    AggregateOps<K, V>,
    ConversionOps<K, V>,
    HasInternalData<K, V>
{
  protected readonly data: Map<K, V>;

  constructor(entries?: Iterable<[K, V]>) {
    this.data = new Map(entries);
  }

  // Internal storage accessor for mixins and core modules
  [INTERNAL_DATA](): Map<K, V> {
    return this.data;
  }

  /**
   * Protected method to create a new instance of the same type
   */
  protected createNewInstance<NK = K, NV = V>(
    entries: Iterable<[NK, NV]>,
  ): BaseCollection<NK, NV> {
    type CollectionConstructor = new (
      entries?: Iterable<[NK, NV]>,
    ) => BaseCollection<NK, NV>;

    const Constructor = this.constructor as CollectionConstructor;
    return new Constructor(entries);
  }

  // ReadableCollection implementation
  /**
   * Gets the value associated with the specified key
   *
   * @param key - The key to look up
   * @returns The value associated with the key, or undefined if not found
   *
   * @example
   * ```typescript
   * const value = collection.get('myKey');
   * if (value !== undefined) {
   *   console.log(value);
   * }
   * ```
   */
  get(key: K): V | undefined {
    return this.data.get(key);
  }

  /**
   * Checks if the collection contains the specified key
   *
   * @param key - The key to check
   * @returns true if the key exists, false otherwise
   *
   * @example
   * ```typescript
   * if (collection.has('myKey')) {
   *   const value = collection.get('myKey');
   * }
   * ```
   */
  has(key: K): boolean {
    return this.data.has(key);
  }

  get size(): number {
    return this.data.size;
  }

  entries(): IterableIterator<[K, V]> {
    return this.data.entries();
  }

  keys(): IterableIterator<K> {
    return this.data.keys();
  }

  values(): IterableIterator<V> {
    return this.data.values();
  }

  forEach<T = undefined>(
    callbackfn: (
      this: T,
      value: V,
      key: K,
      collection: ReadableCollection<K, V>,
    ) => void,
    thisArg?: T,
  ): void {
    const boundFn =
      thisArg !== undefined ? callbackfn.bind(thisArg) : callbackfn;
    for (const [key, value] of this.data) {
      (
        boundFn as (
          value: V,
          key: K,
          collection: ReadableCollection<K, V>,
        ) => void
      )(value, key, this);
    }
  }

  // Make collection iterable
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries();
  }

  // SearchOps implementation using composition
  /**
   * Finds the first value that satisfies the provided predicate
   *
   * @param predicate - Function to test each value
   * @returns The first matching value, or undefined if none found
   *
   * @example
   * ```typescript
   * const evenValue = collection.find(value => value % 2 === 0);
   * const largeValue = collection.find((value, key) => value > 100);
   * ```
   */
  find(predicate: (value: V, key: K, index: number) => boolean): V | undefined {
    return findOp(this.data, predicate);
  }

  findKey(
    predicate: (value: V, key: K, index: number) => boolean,
  ): K | undefined {
    return findKeyOp(this.data, predicate);
  }

  /**
   * Creates a new collection with only the entries that pass the test
   *
   * @param predicate - Function to test each entry
   * @returns New collection containing only matching entries
   *
   * @example
   * ```typescript
   * const filtered = collection.filter(value => value > 10);
   * const activeItems = collection.filter((value, key) => value.active === true);
   * ```
   */
  filter(
    predicate: (value: V, key: K, index: number) => boolean,
  ): BaseCollection<K, V> {
    const filtered = filterOp(this.data, predicate);
    return this.createNewInstance(filtered);
  }

  filterIter(
    predicate: (value: V, key: K, index: number) => boolean,
  ): IterableIterator<[K, V]> {
    return filterIterOp(this.data, predicate);
  }

  some(predicate: (value: V, key: K, index: number) => boolean): boolean {
    return someOp(this.data, predicate);
  }

  every(predicate: (value: V, key: K, index: number) => boolean): boolean {
    return everyOp(this.data, predicate);
  }

  // TransformOps implementation using composition
  /**
   * Maps each value in the collection to a new value
   *
   * @param fn - Transformation function
   * @returns Array of transformed values
   *
   * @example
   * ```typescript
   * const doubled = collection.map(value => value * 2);
   * const labels = collection.map((value, key) => `${key}: ${value}`);
   * ```
   */
  map<R>(fn: (value: V, key: K, index: number) => R): R[] {
    return mapOp(this.data, fn);
  }

  // Explicit array mapping alias for clarity in pipelines
  mapArray<R>(fn: (value: V, key: K, index: number) => R): R[] {
    return mapOp(this.data, fn);
  }

  mapValues<R>(fn: (value: V, key: K) => R): BaseCollection<K, R> {
    const mapped = mapValuesOp(this.data, fn);
    return this.createNewInstance(mapped);
  }

  mapKeys<NK>(fn: (key: K, value: V) => NK): BaseCollection<NK, V> {
    const mapped = mapKeysOp(this.data, fn);
    return this.createNewInstance(mapped);
  }

  flatMap<R>(fn: (value: V, key: K, index: number) => R[]): R[] {
    return flatMapOp(this.data, fn);
  }

  flatMapArray<R>(fn: (value: V, key: K, index: number) => R[]): R[] {
    return flatMapOp(this.data, fn);
  }

  // Flat map that returns a collection
  flatMapCollection<NV>(
    fn: (
      value: V,
      key: K,
      index: number,
    ) => Iterable<[K, NV]> | ReadableCollection<K, NV>,
  ): BaseCollection<K, NV> {
    const out = new Map<K, NV>();
    let index = 0;
    for (const [key, val] of this) {
      const res = fn(val, key, index++);
      const isReadableCollection = (
        obj: unknown,
      ): obj is ReadableCollection<K, NV> =>
        typeof obj === 'object' &&
        obj !== null &&
        'entries' in obj &&
        typeof (obj as { entries: unknown }).entries === 'function';
      const entries: Iterable<[K, NV]> = isReadableCollection(res)
        ? res.entries()
        : (res as Iterable<[K, NV]>);
      for (const [rk, rv] of entries) {
        out.set(rk, rv);
      }
    }
    return this.createNewInstance(out);
  }

  // Map entries to a new collection (both key and value)
  mapEntriesCollection<NK, NV>(
    fn: (key: K, value: V, index: number) => [NK, NV],
  ): BaseCollection<NK, NV> {
    const mapped = mapEntriesOp(this.data, (k, v, i) => fn(k, v, i));
    return this.createNewInstance(mapped);
  }

  // AggregateOps implementation using composition
  /**
   * Reduces the collection to a single value
   *
   * @param reducer - Function to combine values
   * @param initialValue - Starting value for the reduction
   * @returns The final reduced value
   *
   * @example
   * ```typescript
   * const sum = collection.reduce((acc, value) => acc + value, 0);
   * const concatenated = collection.reduce((acc, value, key) => {
   *   return acc + `${key}:${value},`;
   * }, '');
   * ```
   */
  reduce<R>(
    reducer: (accumulator: R, value: V, key: K, index: number) => R,
    initialValue: R,
  ): R {
    return reduceOp(this.data, reducer, initialValue);
  }

  groupBy<G>(keySelector: (value: V, key: K) => G): Map<G, Array<[K, V]>> {
    return groupByOp(this.data, keySelector);
  }

  count(predicate?: (value: V, key: K, index: number) => boolean): number {
    return countOp(this.data, predicate);
  }

  // ConversionOps implementation
  toArray(): Array<[K, V]> {
    return Array.from(this.data);
  }

  toObject(): Record<string, V> {
    const obj: Record<string, V> = {};
    for (const [key, value] of this.data) {
      obj[String(key)] = value;
    }
    return obj;
  }

  // Type-safe variant with explicit key mapping
  toObjectWithKey<NK extends string | number | symbol>(
    mapKey: (key: K) => NK,
  ): Record<NK, V> {
    const obj = {} as Record<NK, V>;
    for (const [key, value] of this.data) {
      obj[mapKey(key)] = value;
    }
    return obj;
  }

  toJSON(): Array<[K, V]> {
    return this.toArray();
  }

  toMap(): Map<K, V> {
    return new Map(this.data);
  }

  toSet(): Set<V> {
    return new Set(this.data.values());
  }

  // Additional utility methods
  isEmpty(): boolean {
    return this.size === 0;
  }

  first(): V | undefined {
    const first = firstOp(this.data);
    return first ? first[1] : undefined;
  }

  last(): V | undefined {
    const last = lastOp(this.data);
    return last ? last[1] : undefined;
  }

  take(n: number): Array<[K, V]> {
    return Array.from(takeOp(this.data, n));
  }

  skip(n: number): Array<[K, V]> {
    return Array.from(skipOp(this.data, n));
  }

  takeIter(n: number): IterableIterator<[K, V]> {
    return takeOp(this.data, n);
  }

  skipIter(n: number): IterableIterator<[K, V]> {
    return skipOp(this.data, n);
  }

  /**
   * Checks if this collection is equal to another collection
   *
   * @param other - The collection to compare with
   * @returns true if collections have the same key-value pairs
   *
   * @remarks
   * Uses Object.is for value comparison, so NaN === NaN and -0 !== +0
   *
   * @example
   * ```typescript
   * const col1 = new MutableCollection([['a', 1], ['b', 2]]);
   * const col2 = new MutableCollection([['a', 1], ['b', 2]]);
   * console.log(col1.equals(col2)); // true
   * ```
   */
  equals(other: ReadableCollection<K, V>): boolean {
    return equalsByObjectIs(this, other);
  }

  // String representation
  toString(): string {
    const entries = Array.from(this.data)
      .map(([k, v]) => `${String(k)} => ${String(v)}`)
      .join(', ');
    return `${this.constructor.name}(${this.size}) { ${entries} }`;
  }

  // Clone method - creates a new instance of the same type
  clone(): BaseCollection<K, V> {
    return this.createNewInstance(this.data);
  }
}
