/**
 * Immutable collection class that uses composition instead of inheritance
 * All modification operations return new instances
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
  difference as differenceOp,
  intersection as intersectionOp,
  symmetricDifference as symmetricDifferenceOp,
  union as unionOp,
} from '../operations/set';
import {
  flatMap as flatMapOp,
  mapEntries as mapEntriesOp,
  mapKeys as mapKeysOp,
  map as mapOp,
  mapValues as mapValuesOp,
  reverse as reverseEntries,
  sort as sortEntries,
} from '../operations/transform';
import type {
  AggregateOps,
  ConversionOps,
  ImmutableOps,
  ReadableCollection,
  SearchOps,
  SetOps,
  SortOps,
  TransformOps,
} from '../types/interfaces';
import type { HasInternalData } from '../types/internal';
import { INTERNAL_DATA } from '../types/internal';
import { equalsByObjectIs } from '../utils/equality';
import {
  wouldKeyTransformChange,
  wouldTransformChange,
} from '../utils/structural';

//

/**
 * Symbol to mark collections as immutable
 */
export const IS_IMMUTABLE = Symbol('@@__IMMUTABLE__@@');

/**
 * Readonly type for ImmutableCollection
 */
export type ReadonlyImmutableCollection<K, V> = Readonly<
  ImmutableCollectionBase<K, V>
>;

/**
 * Base immutable collection class
 * @internal
 */
class ImmutableCollectionBase<K, V>
  implements
    ReadableCollection<K, V>,
    ImmutableOps<K, V>,
    SearchOps<K, V>,
    TransformOps<K, V>,
    AggregateOps<K, V>,
    SetOps<K, V>,
    SortOps<K, V>,
    ConversionOps<K, V>,
    HasInternalData<K, V>
{
  protected readonly data: Map<K, V>;
  private readonly [IS_IMMUTABLE] = true;
  public readonly isImmutable = true;

  constructor(entries?: Iterable<[K, V]>) {
    this.data = new Map(entries);
  }

  [INTERNAL_DATA](): Map<K, V> {
    return this.data;
  }

  // ReadableCollection implementation
  get(key: K): V | undefined {
    return this.data.get(key);
  }

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

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries();
  }

  // ImmutableOps implementation
  /**
   * Returns a new collection with the key-value pair set
   * Returns the same instance if the value hasn't changed
   *
   * @param key - The key to set
   * @param value - The value to associate with the key
   * @returns A new collection with the update, or this if unchanged
   *
   * @example
   * ```typescript
   * const updated = collection.set('name', 'John');
   * ```
   */
  set(key: K, value: V): ImmutableCollectionBase<K, V> {
    // If same value, return same instance
    if (this.has(key) && Object.is(this.get(key), value)) {
      return this;
    }

    // Create new instance with the change
    const newData = new Map(this.data);
    newData.set(key, value);
    return new ImmutableCollectionBase(newData);
  }

  /**
   * Returns a new collection without the specified key
   * Returns the same instance if the key doesn't exist
   *
   * @param key - The key to remove
   * @returns A new collection without the key, or this if key not found
   *
   * @example
   * ```typescript
   * const without = collection.delete('obsoleteKey');
   * ```
   */
  delete(key: K): ImmutableCollectionBase<K, V> {
    // If key doesn't exist, return same instance
    if (!this.has(key)) {
      return this;
    }

    // Create new instance without the key
    const newData = new Map(this.data);
    newData.delete(key);
    return new ImmutableCollectionBase(newData);
  }

  /**
   * Returns an empty collection of the same type
   * Returns the same instance if already empty
   *
   * @returns An empty collection, or this if already empty
   *
   * @example
   * ```typescript
   * const empty = collection.clear();
   * ```
   */
  clear(): ImmutableCollectionBase<K, V> {
    // If already empty, return same instance
    if (this.size === 0) {
      return this;
    }

    // Return new empty collection
    return new ImmutableCollectionBase<K, V>();
  }

  /**
   * Returns a new collection merged with other collections
   * Later collections override earlier ones for duplicate keys
   *
   * @param collections - Collections to merge with this one
   * @returns A new merged collection
   *
   * @example
   * ```typescript
   * const merged = collection.merge(defaults, overrides);
   * ```
   */
  merge(
    ...collections: ReadableCollection<K, V>[]
  ): ImmutableCollectionBase<K, V> {
    const result = new Map<K, V>();
    for (const [k, v] of this.data) {
      result.set(k, v);
    }
    for (const coll of collections) {
      for (const [k, v] of coll.entries()) {
        result.set(k, v);
      }
    }

    if (result.size === this.size && this.equalsMerged(result)) {
      return this;
    }

    return new ImmutableCollectionBase(result);
  }

  /**
   * Returns a new collection with the value updated by a function
   * Returns the same instance if the computed value hasn't changed
   *
   * @param key - The key to update
   * @param updater - Function that computes the new value
   * @returns A new collection with the update, or this if unchanged
   *
   * @example
   * ```typescript
   * const incremented = collection.update('count', (v) => (v ?? 0) + 1);
   * ```
   */
  update(
    key: K,
    updater: (value: V | undefined) => V,
  ): ImmutableCollectionBase<K, V> {
    const currentValue = this.get(key);
    const newValue = updater(currentValue);

    // If same value, return same instance
    if (Object.is(currentValue, newValue)) {
      return this;
    }

    return this.set(key, newValue);
  }

  // SearchOps implementation
  find(predicate: (value: V, key: K, index: number) => boolean): V | undefined {
    return findOp(this.data, predicate);
  }

  findKey(
    predicate: (value: V, key: K, index: number) => boolean,
  ): K | undefined {
    return findKeyOp(this.data, predicate);
  }

  /**
   * Returns a new collection with only entries that pass the test
   * Returns the same instance if no entries are filtered out
   *
   * @param predicate - Function to test each entry
   * @returns A new filtered collection, or this if nothing filtered
   *
   * @example
   * ```typescript
   * const positive = collection.filter((v) => v > 0);
   * ```
   */
  filter(
    predicate: (value: V, key: K, index: number) => boolean,
  ): ImmutableCollectionBase<K, V> {
    const filtered = filterOp(this.data, predicate);

    // If no items filtered out, return same instance
    if (filtered.length === this.size) {
      return this;
    }

    return new ImmutableCollectionBase(filtered);
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

  // TransformOps implementation
  map<R>(fn: (value: V, key: K, index: number) => R): R[] {
    return mapOp(this.data, fn);
  }

  mapArray<R>(fn: (value: V, key: K, index: number) => R): R[] {
    return mapOp(this.data, fn);
  }

  /**
   * Returns a new collection with transformed values
   * Returns the same instance if transformation doesn't change values
   *
   * @param fn - Function to transform each value
   * @returns A new collection with mapped values, or this if unchanged
   *
   * @example
   * ```typescript
   * const doubled = collection.mapValues(v => v * 2);
   * ```
   */
  mapValues<R>(fn: (value: V, key: K) => R): ImmutableCollectionBase<K, R>;
  mapValues(fn: (value: V, key: K) => V): ImmutableCollectionBase<K, V>;
  mapValues<R>(
    fn: (value: V, key: K) => R,
  ): ImmutableCollectionBase<K, R> | ImmutableCollectionBase<K, V> {
    if (!wouldTransformChange(this.data, fn as (value: V, key: K) => unknown)) {
      return this as unknown as ImmutableCollectionBase<K, R>;
    }
    const mapped = mapValuesOp(this.data, fn as (value: V, key: K) => R);
    return new ImmutableCollectionBase(mapped);
  }

  /**
   * Returns a new collection with transformed keys
   * Returns the same instance if transformation doesn't change keys
   *
   * @param fn - Function to transform each key
   * @returns A new collection with mapped keys, or this if unchanged
   *
   * @example
   * ```typescript
   * const prefixed = collection.mapKeys(k => `prefix_${k}`);
   * ```
   */
  mapKeys<NK>(fn: (key: K, value: V) => NK): ImmutableCollectionBase<NK, V>;
  mapKeys(fn: (key: K, value: V) => K): ImmutableCollectionBase<K, V>;
  mapKeys<NK>(
    fn: ((key: K, value: V) => NK) | ((key: K, value: V) => K),
  ): ImmutableCollectionBase<NK, V> | ImmutableCollectionBase<K, V> {
    if (
      !wouldKeyTransformChange(this.data, fn as (key: K, value: V) => unknown)
    ) {
      return this as unknown as ImmutableCollectionBase<NK, V>;
    }
    const mapped = mapKeysOp(this.data, fn as (key: K, value: V) => NK);
    return new ImmutableCollectionBase(mapped);
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
  ): ImmutableCollectionBase<K, NV> {
    // If collection is empty, return empty collection
    if (this.size === 0) {
      return new ImmutableCollectionBase<K, NV>();
    }

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
    return new ImmutableCollectionBase(out);
  }

  // Map entries to a new immutable collection (both key and value)
  mapEntriesCollection<NK, NV>(
    fn: (key: K, value: V, index: number) => [NK, NV],
  ): ImmutableCollectionBase<NK, NV> {
    const mapped = mapEntriesOp(this.data, (k, v, i) => fn(k, v, i));
    return new ImmutableCollectionBase(mapped);
  }

  // AggregateOps implementation
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

  // SetOps implementation
  /**
   * Returns a new collection with all unique entries from both collections
   * Returns the same instance if the other collection adds nothing new
   *
   * @param other - The other collection to union with
   * @returns A new collection with combined entries, or this if unchanged
   *
   * @example
   * ```typescript
   * const combined = collection1.union(collection2);
   * ```
   */
  union(other: ReadableCollection<K, V>): ImmutableCollectionBase<K, V> {
    // If other is empty, return this
    if (other.size === 0) {
      return this;
    }

    const result = unionOp(this.data, other.entries());

    // If no new elements were added, return this
    if (result.size === this.size) {
      return this;
    }

    return new ImmutableCollectionBase(result);
  }

  /**
   * Returns a new collection with only entries present in both collections
   * Returns the same instance if all entries are common
   *
   * @param other - The other collection to intersect with
   * @returns A new collection with common entries, or this if unchanged
   *
   * @example
   * ```typescript
   * const common = collection1.intersection(collection2);
   * ```
   */
  intersection(other: ReadableCollection<K, V>): ImmutableCollectionBase<K, V> {
    const result = intersectionOp(this.data, other.entries());

    // If result has same size, might be same collection
    if (result.size === this.size) {
      return this;
    }

    return new ImmutableCollectionBase(result);
  }

  /**
   * Returns a new collection with entries not in the other collection
   * Returns the same instance if nothing was removed
   *
   * @param other - The other collection to diff against
   * @returns A new collection with unique entries, or this if unchanged
   *
   * @example
   * ```typescript
   * const unique = collection1.difference(collection2);
   * ```
   */
  difference(other: ReadableCollection<K, V>): ImmutableCollectionBase<K, V> {
    const result = differenceOp(this.data, other.entries());

    // If result has same size, nothing was removed
    if (result.size === this.size) {
      return this;
    }

    return new ImmutableCollectionBase(result);
  }

  /**
   * Returns a new collection with entries in either collection but not both
   * Returns the same instance if both collections are empty
   *
   * @param other - The other collection to compare with
   * @returns A new collection with symmetric difference, or this if empty
   *
   * @example
   * ```typescript
   * const xor = collection1.symmetricDifference(collection2);
   * ```
   */
  symmetricDifference(
    other: ReadableCollection<K, V>,
  ): ImmutableCollectionBase<K, V> {
    // If both are empty, return this
    if (this.size === 0 && other.size === 0) {
      return this;
    }

    const result = symmetricDifferenceOp(this.data, other.entries());

    // If result is empty and so is this, return this
    if (result.size === 0 && this.size === 0) {
      return this;
    }

    return new ImmutableCollectionBase(result);
  }

  mergeWithKeep<OV, RV>(
    other: ReadableCollection<K, OV>,
    whenInSelf: (
      value: V,
      key: K,
    ) => { keep: false } | { keep: true; value: RV },
    whenInOther: (
      valueOther: OV,
      key: K,
    ) => { keep: false } | { keep: true; value: RV },
    whenInBoth: (
      value: V,
      valueOther: OV,
      key: K,
    ) => { keep: false } | { keep: true; value: RV },
  ): ImmutableCollectionBase<K, RV> {
    const result = new Map<K, RV>();
    const keys = new Set<K>([...this.keys(), ...other.keys()]);
    for (const key of keys) {
      const selfVal = this.get(key);
      const otherVal = other.get(key);
      const inSelf = selfVal !== undefined;
      const inOther = otherVal !== undefined;
      if (inSelf && inOther) {
        const res = whenInBoth(selfVal as V, otherVal as OV, key);
        if (res.keep) {
          result.set(key, res.value);
        }
      } else if (inSelf) {
        const res = whenInSelf(selfVal as V, key);
        if (res.keep) {
          result.set(key, res.value);
        }
      } else if (inOther) {
        const res = whenInOther(otherVal as OV, key);
        if (res.keep) {
          result.set(key, res.value);
        }
      }
    }
    return new ImmutableCollectionBase(result);
  }

  // SortOps implementation
  /**
   * Returns a new sorted collection
   * Returns the same instance if already sorted or has 0-1 elements
   *
   * @param compareFn - Optional comparison function for entries
   * @returns A new sorted collection, or this if already sorted
   *
   * @example
   * ```typescript
   * const sorted = collection.sort((a, b) => a[1] - b[1]);
   * ```
   */
  sort(
    compareFn?: (a: [K, V], b: [K, V]) => number,
  ): ImmutableCollectionBase<K, V> {
    // If collection has 0 or 1 element, already sorted
    if (this.size <= 1) {
      return this;
    }

    const sorted = sortEntries(this.data, compareFn);

    // Check if order changed by comparing first and last elements
    const sortedArray = Array.from(sorted);
    const thisArray = Array.from(this.data);

    // Quick check: if first and last elements are in the same position, likely no change
    if (sortedArray.length === thisArray.length) {
      const sameOrder = sortedArray.every((entry, i) => {
        const thisEntry = thisArray[i];
        return (
          Object.is(entry[0], thisEntry[0]) && Object.is(entry[1], thisEntry[1])
        );
      });

      if (sameOrder) {
        return this;
      }
    }

    return new ImmutableCollectionBase(sorted);
  }

  /**
   * Returns a new collection with entries in reverse order
   * Returns the same instance if has 0-1 elements
   *
   * @returns A new reversed collection, or this if too small to reverse
   *
   * @example
   * ```typescript
   * const reversed = collection.reverse();
   * ```
   */
  reverse(): ImmutableCollectionBase<K, V> {
    // If collection has 0 or 1 element, reversing doesn't change it
    if (this.size <= 1) {
      return this;
    }

    const reversed = reverseEntries(this.data);
    return new ImmutableCollectionBase(reversed);
  }

  // ConversionOps implementation
  /**
   * Converts the collection to an array of entries
   *
   * @returns Array of [key, value] pairs
   *
   * @example
   * ```typescript
   * const entries = collection.toArray();
   * ```
   */
  toArray(): Array<[K, V]> {
    return Array.from(this.data);
  }

  /**
   * Converts the collection to a plain object
   * Keys are converted to strings
   *
   * @returns Plain object with string keys
   *
   * @example
   * ```typescript
   * const obj = collection.toObject();
   * ```
   */
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

  /**
   * Returns a new mutable Map with the same entries
   *
   * @returns A new Map instance
   *
   * @example
   * ```typescript
   * const map = collection.toMap();
   * ```
   */
  toMap(): Map<K, V> {
    return new Map(this.data);
  }

  /**
   * Returns a Set of all values in the collection
   *
   * @returns A new Set of values
   *
   * @example
   * ```typescript
   * const values = collection.toSet();
   * ```
   */
  toSet(): Set<V> {
    return new Set(this.data.values());
  }

  /**
   * Performs batch mutations efficiently using a mutable copy
   * Useful for multiple updates that would create many intermediate collections
   *
   * @param fn - Function that mutates a mutable Map copy
   * @returns A new collection with all mutations applied
   *
   * @example
   * ```typescript
   * const updated = collection.withMutations(mutable => {
   *   mutable.set('a', 1);
   *   mutable.set('b', 2);
   *   mutable.delete('old');
   * });
   * ```
   */
  withMutations(
    fn: (mutable: Map<K, V>) => void,
  ): ImmutableCollectionBase<K, V> {
    const mutableCopy = new Map(this.data);
    fn(mutableCopy);

    // Check if any changes were made
    if (this.equalsMap(mutableCopy)) {
      return this;
    }

    return new ImmutableCollectionBase(mutableCopy);
  }

  // Utility methods
  // isEmpty() provided by CommonOperations

  first(): V | undefined {
    const first = firstOp(this.data);
    return first ? first[1] : undefined;
  }

  last(): V | undefined {
    const last = lastOp(this.data);
    return last ? last[1] : undefined;
  }

  take(n: number): ImmutableCollectionBase<K, V> {
    if (n >= this.size) {
      return this;
    }
    return new ImmutableCollectionBase(takeOp(this.data, n));
  }

  skip(n: number): ImmutableCollectionBase<K, V> {
    if (n <= 0) {
      return this;
    }
    if (n >= this.size) {
      return new ImmutableCollectionBase<K, V>();
    }
    return new ImmutableCollectionBase(skipOp(this.data, n));
  }

  takeIter(n: number): IterableIterator<[K, V]> {
    return takeOp(this.data, n);
  }

  skipIter(n: number): IterableIterator<[K, V]> {
    return skipOp(this.data, n);
  }

  // Equality checks
  // Provide equals for API parity with other collections
  equals(other: ReadableCollection<K, V>): boolean {
    return equalsByObjectIs(this, other);
  }

  private equalsMap(other: Map<K, V>): boolean {
    if (this.size !== other.size) {
      return false;
    }

    for (const [key, value] of this.data) {
      if (!other.has(key) || !Object.is(other.get(key), value)) {
        return false;
      }
    }

    return true;
  }

  private equalsMerged(merged: Map<K, V>): boolean {
    return this.equalsMap(merged);
  }

  // Clone
  clone(): ImmutableCollectionBase<K, V> {
    // Immutable collections can return themselves as clones
    return this;
  }

  // String representation
  // toString() provided by CommonOperations

  // Static factory methods
  /**
   * Creates an immutable collection from an iterable of entries
   *
   * @param entries - Iterable of key-value pairs
   * @returns A new immutable collection
   *
   * @example
   * ```typescript
   * const coll = ImmutableCollection.from(map.entries());
   * ```
   */
  static from<K, V>(entries: Iterable<[K, V]>): ImmutableCollectionBase<K, V> {
    return new ImmutableCollectionBase(entries);
  }

  /**
   * Creates an immutable collection from individual entries
   *
   * @param entries - Individual key-value pairs
   * @returns A new immutable collection
   *
   * @example
   * ```typescript
   * const coll = ImmutableCollection.of(['a', 1], ['b', 2]);
   * ```
   */
  static of<K, V>(...entries: Array<[K, V]>): ImmutableCollectionBase<K, V> {
    return new ImmutableCollectionBase(entries);
  }

  /**
   * Creates an empty immutable collection
   *
   * @returns A new empty immutable collection
   *
   * @example
   * ```typescript
   * const empty = ImmutableCollection.empty<string, number>();
   * ```
   */
  static empty<K, V>(): ImmutableCollectionBase<K, V> {
    return new ImmutableCollectionBase<K, V>();
  }

  /**
   * Checks if a value is an ImmutableCollection instance
   *
   * @param value - The value to check
   * @returns True if the value is an ImmutableCollection
   *
   * @example
   * ```typescript
   * if (ImmutableCollection.isImmutable(value)) {
   *   // value is ImmutableCollection
   * }
   * ```
   */
  static isImmutable(
    value: unknown,
  ): value is ImmutableCollectionBase<unknown, unknown> {
    return Boolean(
      value &&
        typeof value === 'object' &&
        value !== null &&
        IS_IMMUTABLE in value &&
        value[IS_IMMUTABLE] === true,
    );
  }
}

/**
 * Immutable collection that returns new instances on modifications
 * Export as ImmutableCollection for public API
 */
export { ImmutableCollectionBase as ImmutableCollection };
