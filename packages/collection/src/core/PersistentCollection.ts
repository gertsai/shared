/**
 * PersistentCollection - immutable collection backed by PersistentMap (HAMT)
 * Provides structural sharing for efficient immutable operations
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

import { PersistentMap } from './PersistentMap';

export class PersistentCollection<K, V>
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
  protected readonly data: PersistentMap<K, V>;

  constructor(entries?: Iterable<[K, V]> | PersistentMap<K, V>) {
    if (entries instanceof PersistentMap) {
      this.data = entries;
    } else {
      this.data = new PersistentMap(entries);
    }
  }

  [INTERNAL_DATA](): Map<K, V> {
    // Expose as a temporary materialized Map for consumers that expect Map
    return new Map(this.data.entries());
  }

  // ReadableCollection
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
    this.data.forEach((value, key) =>
      (
        boundFn as (
          value: V,
          key: K,
          collection: ReadableCollection<K, V>,
        ) => void
      )(value, key, this),
    );
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries();
  }

  // ImmutableOps
  set(key: K, value: V): PersistentCollection<K, V> {
    const current = this.get(key);
    if (Object.is(current, value)) {
      return this;
    }
    const nextMap = this.data.set(key, value);
    if (nextMap === this.data) {
      return this;
    }
    return new PersistentCollection(nextMap);
  }

  delete(key: K): PersistentCollection<K, V> {
    if (!this.has(key)) {
      return this;
    }
    const nextMap = this.data.delete(key);
    if (nextMap === this.data) {
      return this;
    }
    return new PersistentCollection(nextMap);
  }

  clear(): PersistentCollection<K, V> {
    if (this.size === 0) {
      return this;
    }
    const nextMap = this.data.clear();
    return new PersistentCollection(nextMap);
  }

  merge(
    ...collections: ReadableCollection<K, V>[]
  ): PersistentCollection<K, V> {
    const result = new Map<K, V>(this.toMap());
    for (const coll of collections) {
      for (const [k, v] of coll.entries()) {
        result.set(k, v);
      }
    }
    return new PersistentCollection(PersistentMap.fromMap(result));
  }

  update(
    key: K,
    updater: (value: V | undefined) => V,
  ): PersistentCollection<K, V> {
    const current = this.get(key);
    const next = updater(current);
    if (Object.is(current, next)) {
      return this;
    }
    return this.set(key, next);
  }

  // SearchOps
  find(predicate: (value: V, key: K, index: number) => boolean): V | undefined {
    return findOp(this.data, predicate);
  }

  findKey(
    predicate: (value: V, key: K, index: number) => boolean,
  ): K | undefined {
    return findKeyOp(this.data, predicate);
  }

  filter(
    predicate: (value: V, key: K, index: number) => boolean,
  ): PersistentCollection<K, V> {
    const filtered = filterOp(this.data, predicate);
    if (filtered.length === this.size) {
      return this;
    }
    return new PersistentCollection(filtered);
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

  // TransformOps
  map<R>(fn: (value: V, key: K, index: number) => R): R[] {
    return mapOp(this.data, fn);
  }

  mapArray<R>(fn: (value: V, key: K, index: number) => R): R[] {
    return mapOp(this.data, fn);
  }

  mapValues<R>(fn: (value: V, key: K) => R): PersistentCollection<K, R> {
    const mapped = mapValuesOp(this.data, fn);
    return new PersistentCollection(PersistentMap.fromMap(mapped));
  }

  mapKeys<NK>(fn: (key: K, value: V) => NK): PersistentCollection<NK, V> {
    const mapped = mapKeysOp(this.data, fn);
    return new PersistentCollection(PersistentMap.fromMap(mapped));
  }

  flatMap<R>(fn: (value: V, key: K, index: number) => R[]): R[] {
    return flatMapOp(this.data, fn);
  }

  flatMapArray<R>(fn: (value: V, key: K, index: number) => R[]): R[] {
    return flatMapOp(this.data, fn);
  }

  flatMapCollection<NV>(
    fn: (
      value: V,
      key: K,
      index: number,
    ) => Iterable<[K, NV]> | ReadableCollection<K, NV>,
  ): PersistentCollection<K, NV> {
    const out = new Map<K, NV>();
    let index = 0;
    for (const [key, val] of this) {
      const res = fn(val, key, index++);
      const isReadableCollection = (
        obj: unknown,
      ): obj is ReadableCollection<K, NV> =>
        typeof obj === 'object' && obj !== null && 'entries' in obj;
      const entries: Iterable<[K, NV]> = isReadableCollection(res)
        ? res.entries()
        : (res as Iterable<[K, NV]>);
      for (const [rk, rv] of entries) {
        out.set(rk, rv);
      }
    }
    return new PersistentCollection(PersistentMap.fromMap(out));
  }

  // AggregateOps
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

  // SetOps
  union(other: ReadableCollection<K, V>): PersistentCollection<K, V> {
    const result = unionOp(this.data, other.entries());
    return new PersistentCollection(PersistentMap.fromMap(result));
  }

  intersection(other: ReadableCollection<K, V>): PersistentCollection<K, V> {
    const result = intersectionOp(this.data, other.entries());
    if (result.size === this.size) {
      return this;
    }
    return new PersistentCollection(PersistentMap.fromMap(result));
  }

  difference(other: ReadableCollection<K, V>): PersistentCollection<K, V> {
    const result = differenceOp(this.data, other.entries());
    if (result.size === this.size) {
      return this;
    }
    return new PersistentCollection(PersistentMap.fromMap(result));
  }

  symmetricDifference(
    other: ReadableCollection<K, V>,
  ): PersistentCollection<K, V> {
    const result = symmetricDifferenceOp(this.data, other.entries());
    return new PersistentCollection(PersistentMap.fromMap(result));
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
  ): PersistentCollection<K, RV> {
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
    return new PersistentCollection(PersistentMap.fromMap(result));
  }

  // SortOps
  sort(
    compareFn?: (a: [K, V], b: [K, V]) => number,
  ): PersistentCollection<K, V> {
    const sorted = sortEntries(this.data, compareFn);
    return new PersistentCollection(sorted);
  }

  reverse(): PersistentCollection<K, V> {
    const reversed = reverseEntries(this.data);
    return new PersistentCollection(reversed);
  }

  // ConversionOps
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
    return new Map(this.data.entries());
  }

  toSet(): Set<V> {
    return new Set(this.data.values());
  }

  // Utilities
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

  take(n: number): PersistentCollection<K, V> {
    if (n >= this.size) {
      return this;
    }
    return new PersistentCollection(takeOp(this.data, n));
  }

  skip(n: number): PersistentCollection<K, V> {
    if (n <= 0) {
      return this;
    }
    if (n >= this.size) {
      return new PersistentCollection<K, V>();
    }
    return new PersistentCollection(skipOp(this.data, n));
  }

  takeIter(n: number): IterableIterator<[K, V]> {
    return takeOp(this.data, n);
  }

  skipIter(n: number): IterableIterator<[K, V]> {
    return skipOp(this.data, n);
  }

  // Equality
  equals(other: ReadableCollection<K, V>): boolean {
    return equalsByObjectIs(this, other);
  }

  // Clone
  clone(): PersistentCollection<K, V> {
    return this; // structural sharing; immutable instance
  }

  toString(): string {
    const entries = Array.from(this.data)
      .map(([k, v]) => `${String(k)} => ${String(v)}`)
      .join(', ');
    return `PersistentCollection(${this.size}) { ${entries} }`;
  }

  // Static factories
  static from<K, V>(entries: Iterable<[K, V]>): PersistentCollection<K, V> {
    return new PersistentCollection(entries);
  }

  static of<K, V>(...entries: Array<[K, V]>): PersistentCollection<K, V> {
    return new PersistentCollection(entries);
  }

  static empty<K, V>(): PersistentCollection<K, V> {
    return new PersistentCollection<K, V>();
  }
}
