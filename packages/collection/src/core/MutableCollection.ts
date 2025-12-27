/**
 * Mutable collection class that extends BaseCollection
 * Provides write operations and mutable transformations
 */

import { reduce as reduceOp } from '../operations/aggregate';
import { filter as filterOp } from '../operations/search';
import {
  difference,
  intersection,
  symmetricDifference,
  union,
} from '../operations/set';
import {
  mapKeys as mapKeysOp,
  mapValues as mapValuesOp,
  reverse as reverseEntries,
  sort as sortEntries,
} from '../operations/transform';
import type {
  ReadableCollection,
  SetOps,
  SortOps,
  WritableCollection,
} from '../types/interfaces';

import { BaseCollection } from './BaseCollection';

/**
 * Base mutable collection class
 * @internal
 */
class MutableCollectionBase<K, V>
  extends BaseCollection<K, V>
  implements WritableCollection<K, V>, SetOps<K, V>, SortOps<K, V>
{
  // WritableCollection implementation
  /**
   * Sets a key-value pair in the collection
   *
   * @param key - The key to set
   * @param value - The value to associate with the key
   * @returns This collection for chaining
   *
   * @example
   * ```typescript
   * collection.set('name', 'John').set('age', 30);
   * ```
   */
  set(key: K, value: V): this {
    this.data.set(key, value);
    return this;
  }

  /**
   * Deletes a key and its associated value from the collection
   *
   * @param key - The key to delete
   * @returns True if the key existed and was deleted, false otherwise
   *
   * @example
   * ```typescript
   * const wasDeleted = collection.delete('obsoleteKey');
   * ```
   */
  delete(key: K): boolean {
    return this.data.delete(key);
  }

  /**
   * Removes all key-value pairs from the collection
   *
   * @example
   * ```typescript
   * collection.clear();
   * console.log(collection.size); // 0
   * ```
   */
  clear(): void {
    this.data.clear();
  }

  // Override abstract methods from BaseCollection
  /**
   * Returns a new collection with entries that pass the test
   *
   * @param predicate - Function to test each entry
   * @returns A new filtered collection
   *
   * @example
   * ```typescript
   * const filtered = collection.filter((v, k) => v > 10);
   * ```
   */
  override filter(
    predicate: (value: V, key: K, index: number) => boolean,
  ): MutableCollectionBase<K, V> {
    const entries = filterOp(this.data, predicate);
    return new MutableCollectionBase(entries);
  }

  /**
   * Returns a new collection with transformed values
   *
   * @param fn - Function to transform each value
   * @returns A new collection with mapped values
   *
   * @example
   * ```typescript
   * const doubled = collection.mapValues(v => v * 2);
   * ```
   */
  override mapValues<R>(
    fn: (value: V, key: K) => R,
  ): MutableCollectionBase<K, R> {
    const mapped = mapValuesOp(this.data, fn);
    return new MutableCollectionBase(mapped);
  }

  /**
   * Returns a new collection with transformed keys
   *
   * @param fn - Function to transform each key
   * @returns A new collection with mapped keys
   *
   * @example
   * ```typescript
   * const prefixed = collection.mapKeys(k => `prefix_${k}`);
   * ```
   */
  override mapKeys<NK>(
    fn: (key: K, value: V) => NK,
  ): MutableCollectionBase<NK, V> {
    const mapped = mapKeysOp(this.data, fn);
    return new MutableCollectionBase(mapped);
  }

  // SetOps implementation
  /**
   * Returns a new collection containing all unique entries from both collections
   *
   * @param other - The other collection to union with
   * @returns A new collection with combined entries
   *
   * @example
   * ```typescript
   * const combined = collection1.union(collection2);
   * ```
   */
  union(other: ReadableCollection<K, V>): MutableCollectionBase<K, V> {
    const result = union(this.data, other.entries());
    return new MutableCollectionBase(result);
  }

  /**
   * Returns a new collection containing only entries present in both collections
   *
   * @param other - The other collection to intersect with
   * @returns A new collection with common entries
   *
   * @example
   * ```typescript
   * const common = collection1.intersection(collection2);
   * ```
   */
  intersection(other: ReadableCollection<K, V>): MutableCollectionBase<K, V> {
    const result = intersection(this.data, other.entries());
    return new MutableCollectionBase(result);
  }

  /**
   * Returns a new collection containing entries in this collection but not in the other
   *
   * @param other - The other collection to diff against
   * @returns A new collection with unique entries from this collection
   *
   * @example
   * ```typescript
   * const unique = collection1.difference(collection2);
   * ```
   */
  difference(other: ReadableCollection<K, V>): MutableCollectionBase<K, V> {
    const result = difference(this.data, other.entries());
    return new MutableCollectionBase(result);
  }

  /**
   * Returns a new collection with entries that exist in either collection but not both
   *
   * @param other - The other collection to compare with
   * @returns A new collection with symmetric difference
   *
   * @example
   * ```typescript
   * const xor = collection1.symmetricDifference(collection2);
   * ```
   */
  symmetricDifference(
    other: ReadableCollection<K, V>,
  ): MutableCollectionBase<K, V> {
    const result = symmetricDifference(this.data, other.entries());
    return new MutableCollectionBase(result);
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
  ): MutableCollectionBase<K, RV> {
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
    return new MutableCollectionBase(result);
  }

  // SortOps implementation - sorts in place and returns this
  /**
   * Sorts the collection in place by entries
   *
   * @param compareFn - Optional comparison function for entries
   * @returns This collection after sorting
   *
   * @example
   * ```typescript
   * collection.sort((a, b) => a[1] - b[1]); // Sort by values
   * ```
   */
  sort(
    compareFn?: (a: [K, V], b: [K, V]) => number,
  ): MutableCollectionBase<K, V> {
    const entries = [...this.entries()];
    if (compareFn) {
      entries.sort(compareFn);
    } else {
      entries.sort();
    }

    // For in-place sorting
    this.data.clear();
    for (const [key, value] of entries) {
      this.data.set(key, value);
    }

    return this;
  }

  // Additional sort helper for values only (not part of SortOps interface)
  /**
   * Sorts the collection in place by values
   *
   * @param compareFn - Optional comparison function for values
   * @returns This collection after sorting
   *
   * @example
   * ```typescript
   * collection.sortByValue((a, b) => a.localeCompare(b));
   * ```
   */
  sortByValue(compareFn?: (a: V, b: V) => number): MutableCollectionBase<K, V> {
    const entries = [...this.entries()];
    if (compareFn) {
      entries.sort((a, b) => compareFn(a[1], b[1]));
    } else {
      entries.sort((a, b) => {
        if (a[1] < b[1]) {
          return -1;
        }
        if (a[1] > b[1]) {
          return 1;
        }
        return 0;
      });
    }

    this.data.clear();
    for (const [key, value] of entries) {
      this.data.set(key, value);
    }

    return this;
  }

  /**
   * Reverses the order of entries in place
   *
   * @returns This collection after reversing
   *
   * @example
   * ```typescript
   * collection.reverse();
   * ```
   */
  reverse(): MutableCollectionBase<K, V> {
    const entries = [...this.entries()].reverse();
    this.data.clear();
    for (const [key, value] of entries) {
      this.data.set(key, value);
    }
    return this;
  }

  // Mutable sort operations (modify in place)
  sortInPlace(compareFn?: (a: [K, V], b: [K, V]) => number): this {
    const sorted = sortEntries(this.data, compareFn);
    this.data.clear();
    for (const [key, value] of sorted) {
      this.data.set(key, value);
    }
    return this;
  }

  reverseInPlace(): this {
    const reversed = reverseEntries(this.data);
    this.data.clear();
    for (const [key, value] of reversed) {
      this.data.set(key, value);
    }
    return this;
  }

  /**
   * Creates a new collection by merging this with other collections
   * Later collections override earlier ones for duplicate keys
   *
   * @param others - Collections to merge with this one
   * @returns A new merged collection
   *
   * @example
   * ```typescript
   * const merged = collection.merge(defaults, overrides);
   * ```
   */
  merge(...others: MutableCollectionBase<K, V>[]): MutableCollectionBase<K, V> {
    const result = new Map<K, V>(this.data);
    for (const other of others) {
      for (const [key, value] of other.data) {
        result.set(key, value);
      }
    }
    return new MutableCollectionBase(result);
  }

  /**
   * Merges other collections into this one, modifying in place
   * Later collections override earlier ones for duplicate keys
   *
   * @param others - Collections to merge into this one
   * @returns This collection for chaining
   *
   * @example
   * ```typescript
   * collection.mergeInPlace(defaults, userSettings, overrides);
   * ```
   */
  mergeInPlace(...others: MutableCollectionBase<K, V>[]): this {
    for (const other of others) {
      for (const [key, value] of other.data) {
        this.data.set(key, value);
      }
    }
    return this;
  }

  /**
   * Updates a value using an updater function
   * Creates the key if it doesn't exist
   *
   * @param key - The key to update
   * @param updater - Function that receives current value (or undefined) and returns new value
   * @returns This collection for chaining
   *
   * @example
   * ```typescript
   * collection.update('counter', (val) => (val ?? 0) + 1);
   * ```
   */
  update(key: K, updater: (value: V | undefined) => V): this {
    const currentValue = this.data.get(key);
    const newValue = updater(currentValue);
    this.data.set(key, newValue);
    return this;
  }

  // Batch operations
  setMany(entries: Iterable<[K, V]>): this {
    for (const [key, value] of entries) {
      this.data.set(key, value);
    }
    return this;
  }

  deleteMany(keys: Iterable<K>): this {
    for (const key of keys) {
      this.data.delete(key);
    }
    return this;
  }

  // Clone implementation
  /**
   * Creates a shallow copy of this collection
   *
   * @returns A new collection with the same entries
   *
   * @example
   * ```typescript
   * const copy = collection.clone();
   * ```
   */
  override clone(): MutableCollectionBase<K, V> {
    return new MutableCollectionBase(this.data);
  }

  // Additional utility methods
  retain(predicate: (value: V, key: K) => boolean): this {
    const toDelete: K[] = [];
    for (const [key, value] of this.data) {
      if (!predicate(value, key)) {
        toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      this.data.delete(key);
    }
    return this;
  }

  /**
   * Removes null and undefined values from the collection
   * Modifies the collection in place
   *
   * @returns This collection for chaining
   *
   * @example
   * ```typescript
   * collection.compact(); // Removes null/undefined values
   * ```
   */
  compact(): this {
    const toDelete: K[] = [];
    for (const [key, value] of this.data) {
      if (value == null) {
        toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      this.data.delete(key);
    }
    return this;
  }

  // Discord.js-inspired additional methods
  ensure(key: K, defaultValueGenerator: (key: K, collection: this) => V): V {
    if (this.has(key)) {
      const existing = this.get(key);
      if (existing !== undefined) {
        return existing;
      }
    }
    const defaultValue = defaultValueGenerator(key, this);
    this.set(key, defaultValue);
    return defaultValue;
  }

  // Removed hasAll and hasAny - will be provided by CommonOperations mixin

  override first(): V | undefined;
  override first(amount: number): V[];
  override first(amount?: number): V | V[] | undefined {
    if (amount === undefined) {
      const first = this.values().next();
      return first.done ? undefined : first.value;
    }

    if (amount < 0) {
      return this.last(amount * -1);
    }

    amount = Math.min(this.size, amount);
    const iter = this.values();
    const results: V[] = [];
    for (let i = 0; i < amount; i++) {
      const next = iter.next();
      if (!next.done) {
        results.push(next.value);
      }
    }
    return results;
  }

  override last(): V | undefined;
  override last(amount: number): V[];
  override last(amount?: number): V | V[] | undefined {
    if (amount === undefined) {
      let lastValue: V | undefined = undefined;
      for (const value of this.values()) {
        lastValue = value;
      }
      return lastValue;
    }
    const arr = [...this.values()];
    if (amount < 0) {
      return this.first(amount * -1);
    }
    if (!amount) {
      return [];
    }
    return arr.slice(-amount);
  }

  firstKey(): K | undefined;
  firstKey(amount: number): K[];
  firstKey(amount?: number): K | K[] | undefined {
    if (amount === undefined) {
      const first = this.keys().next();
      return first.done ? undefined : first.value;
    }

    if (amount < 0) {
      return this.lastKey(amount * -1);
    }

    amount = Math.min(this.size, amount);
    const iter = this.keys();
    const results: K[] = [];
    for (let i = 0; i < amount; i++) {
      const next = iter.next();
      if (!next.done) {
        results.push(next.value);
      }
    }
    return results;
  }

  lastKey(): K | undefined;
  lastKey(amount: number): K[];
  lastKey(amount?: number): K | K[] | undefined {
    if (amount === undefined) {
      let lastKeyVal: K | undefined = undefined;
      for (const key of this.keys()) {
        lastKeyVal = key;
      }
      return lastKeyVal;
    }
    const arr = [...this.keys()];
    if (amount < 0) {
      return this.firstKey(amount * -1);
    }
    if (!amount) {
      return [];
    }
    return arr.slice(-amount);
  }

  // Removed at and keyAt - will be provided by CommonOperations mixin

  // Removed random and randomKey - will be provided by CommonOperations mixin

  // Removed findLast and findLastKey - will be provided by CommonOperations mixin

  sweep(fn: (value: V, key: K) => boolean): number {
    const previousSize = this.size;
    for (const [key, val] of this) {
      if (fn(val, key)) {
        this.delete(key);
      }
    }
    return previousSize - this.size;
  }

  // Removed partition - will be provided by CommonOperations mixin

  override flatMap<T>(fn: (value: V, key: K, index: number) => T[]): T[] {
    const flattened: T[] = [];
    let index = 0;
    for (const [key, val] of this) {
      flattened.push(...fn(val, key, index++));
    }
    return flattened;
  }

  override flatMapCollection<NV>(
    fn: (
      value: V,
      key: K,
      index: number,
    ) => Iterable<[K, NV]> | ReadableCollection<K, NV>,
  ): MutableCollectionBase<K, NV> {
    const out = new MutableCollectionBase<K, NV>();
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
    return out;
  }

  // Map entries to a new mutable collection (both key and value)
  override mapEntriesCollection<NK, NV>(
    fn: (key: K, value: V, index: number) => [NK, NV],
  ): MutableCollectionBase<NK, NV> {
    const result = new MutableCollectionBase<NK, NV>();
    let index = 0;
    for (const [k, v] of this) {
      const [nk, nv] = fn(k, v, index++);
      result.set(nk, nv);
    }
    return result;
  }

  override reduce<T>(
    fn: (accumulator: T, value: V, key: K, index: number) => T,
    initialValue: T,
  ): T {
    return reduceOp(this.data, fn, initialValue);
  }

  reduceRight<T>(
    fn: (accumulator: T, value: V, key: K) => T,
    initialValue: T,
  ): T {
    const entries = [...this.entries()];
    let acc = initialValue;
    for (let i = entries.length - 1; i >= 0; i--) {
      const [key, val] = entries[i];
      acc = fn(acc, val, key);
    }
    return acc;
  }

  each(fn: (value: V, key: K) => void): this {
    for (const [key, val] of this) {
      fn(val, key);
    }
    return this;
  }

  tap(fn: (collection: this) => void): this {
    fn(this);
    return this;
  }

  concat(
    ...collections: MutableCollectionBase<K, V>[]
  ): MutableCollectionBase<K, V> {
    const newColl = this.clone();
    for (const coll of collections) {
      for (const [key, val] of coll) {
        newColl.set(key, val);
      }
    }
    return newColl;
  }

  // Removed equals - will be provided by CommonOperations mixin

  toSorted(
    compareFunction?: (a: V, b: V) => number,
  ): MutableCollectionBase<K, V> {
    if (compareFunction) {
      const compareFn = (a: [K, V], b: [K, V]) => compareFunction(a[1], b[1]);
      return this.clone().sort(compareFn);
    }
    return this.clone().sort();
  }

  toReversed(): MutableCollectionBase<K, V> {
    const entries = [...this.entries()].reverse();
    return new MutableCollectionBase(entries);
  }

  override toJSON(): Array<[K, V]> {
    return this.toArray();
  }

  override toString(): string {
    const entries = Array.from(this.data)
      .map(([k, v]) => `${String(k)} => ${String(v)}`)
      .join(', ');
    return `MutableCollection(${this.size}) { ${entries} }`;
  }

  // Static factory methods
  /**
   * Creates a collection from an iterable of entries
   *
   * @param entries - Iterable of key-value pairs
   * @returns A new collection
   *
   * @example
   * ```typescript
   * const coll = MutableCollection.from(map.entries());
   * ```
   */
  static from<K, V>(entries: Iterable<[K, V]>): MutableCollectionBase<K, V> {
    return new MutableCollectionBase(entries);
  }

  /**
   * Creates a collection from individual entries
   *
   * @param entries - Individual key-value pairs
   * @returns A new collection
   *
   * @example
   * ```typescript
   * const coll = MutableCollection.of(['a', 1], ['b', 2]);
   * ```
   */
  static of<K, V>(...entries: Array<[K, V]>): MutableCollectionBase<K, V> {
    return new MutableCollectionBase(entries);
  }

  /**
   * Creates an empty collection
   *
   * @returns A new empty collection
   *
   * @example
   * ```typescript
   * const coll = MutableCollection.empty<string, number>();
   * ```
   */
  static empty<K, V>(): MutableCollectionBase<K, V> {
    return new MutableCollectionBase<K, V>();
  }

  /**
   * Groups values by a key selector function
   *
   * @param collection - Values to group
   * @param fn - Function to compute group key
   * @returns Collection of grouped values
   *
   * @example
   * ```typescript
   * const grouped = MutableCollection.groupBy(
   *   users,
   *   user => user.department
   * );
   * ```
   */
  static groupBy<V, R>(
    collection: Iterable<V>,
    fn: (value: V) => R,
  ): MutableCollectionBase<R, V[]> {
    const result = new MutableCollectionBase<R, V[]>();
    for (const item of collection) {
      const key = fn(item);
      const arr = result.get(key);
      if (arr) {
        arr.push(item);
      } else {
        result.set(key, [item]);
      }
    }
    return result;
  }

  /**
   * Combines entries with duplicate keys using a combine function
   *
   * @param entries - Entries that may have duplicate keys
   * @param combine - Function to combine values for duplicate keys
   * @returns Collection with combined values
   *
   * @example
   * ```typescript
   * const combined = MutableCollection.combineEntries(
   *   entries,
   *   (a, b) => a + b
   * );
   * ```
   */
  static combineEntries<K, V>(
    entries: Iterable<[K, V]>,
    combine: (firstValue: V, secondValue: V, key: K) => V,
  ): MutableCollectionBase<K, V> {
    const coll = new MutableCollectionBase<K, V>();
    for (const [key, value] of entries) {
      const current = coll.get(key);
      coll.set(
        key,
        current !== undefined ? combine(current, value, key) : value,
      );
    }
    return coll;
  }
}

/**
 * Mutable collection that allows modifications
 * Renamed from MutableCollection to MutableCollectionBase for internal use
 * The public MutableCollection is exported with CommonOperations mixed in via createCollection
 */
export { MutableCollectionBase as MutableCollection };
