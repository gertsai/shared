/**
 * Core interfaces for the collection library
 */

/**
 * Read-only operations for collections
 */
export interface ReadableCollection<K, V> extends Iterable<[K, V]> {
  get(key: K): V | undefined;
  has(key: K): boolean;
  readonly size: number;
  entries(): IterableIterator<[K, V]>;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
  forEach(
    callbackfn: (
      value: V,
      key: K,
      collection: ReadableCollection<K, V>,
    ) => void,
    thisArg?: any,
  ): void;
  [Symbol.iterator](): IterableIterator<[K, V]>;
  /**
   * Checks structural equality by keys and values using Object.is for values
   */
  equals(other: ReadableCollection<K, V>): boolean;
}

/**
 * Write operations for mutable collections
 */
export interface WritableCollection<K, V> {
  set(key: K, value: V): this;
  delete(key: K): boolean;
  clear(): void;
}

/**
 * Immutable operations that return new instances
 */
export interface ImmutableOps<K, V> {
  set(key: K, value: V): ImmutableOps<K, V>;
  delete(key: K): ImmutableOps<K, V>;
  clear(): ImmutableOps<K, V>;
  merge(...collections: ReadableCollection<K, V>[]): ImmutableOps<K, V>;
  update(key: K, updater: (value: V | undefined) => V): ImmutableOps<K, V>;
}

/**
 * Search operations
 */
export interface SearchOps<K, V> {
  find(predicate: (value: V, key: K, index: number) => boolean): V | undefined;
  findKey(
    predicate: (value: V, key: K, index: number) => boolean,
  ): K | undefined;
  filter(
    predicate: (value: V, key: K, index: number) => boolean,
  ): ReadableCollection<K, V>;
  /** Lazy filter over entries */
  filterIter(
    predicate: (value: V, key: K, index: number) => boolean,
  ): IterableIterator<[K, V]>;
  some(predicate: (value: V, key: K, index: number) => boolean): boolean;
  every(predicate: (value: V, key: K, index: number) => boolean): boolean;
  /** Lazy iterators: do not allocate arrays */
  takeIter(n: number): IterableIterator<[K, V]>;
  skipIter(n: number): IterableIterator<[K, V]>;
}

/**
 * Transform operations
 */
export interface TransformOps<K, V> {
  map<R>(fn: (value: V, key: K, index: number) => R): R[];
  /**
   * Explicit array-mapping counterpart to mapValues/mapKeys. Always returns an array.
   */
  mapArray<R>(fn: (value: V, key: K, index: number) => R): R[];
  mapValues<R>(fn: (value: V, key: K) => R): ReadableCollection<K, R>;
  mapKeys<NK>(fn: (key: K, value: V) => NK): ReadableCollection<NK, V>;
  flatMap<R>(fn: (value: V, key: K) => R[]): R[];
  /**
   * Explicit array-returning flatMap alias, always returns an array.
   */
  flatMapArray<R>(fn: (value: V, key: K, index: number) => R[]): R[];
}

/**
 * Aggregate operations
 */
export interface AggregateOps<K, V> {
  reduce<R>(
    reducer: (accumulator: R, value: V, key: K, index: number) => R,
    initialValue: R,
  ): R;
  groupBy<G>(keySelector: (value: V, key: K) => G): Map<G, Array<[K, V]>>;
  count(predicate?: (value: V, key: K, index: number) => boolean): number;
}

/**
 * Set operations
 */
export interface SetOps<K, V> {
  union(other: ReadableCollection<K, V>): ReadableCollection<K, V>;
  intersection(other: ReadableCollection<K, V>): ReadableCollection<K, V>;
  difference(other: ReadableCollection<K, V>): ReadableCollection<K, V>;
  symmetricDifference(
    other: ReadableCollection<K, V>,
  ): ReadableCollection<K, V>;
  mergeWithKeep<OV, RV>(
    other: ReadableCollection<K, OV>,
    whenInSelf: (value: V, key: K) => Keep<RV>,
    whenInOther: (valueOther: OV, key: K) => Keep<RV>,
    whenInBoth: (value: V, valueOther: OV, key: K) => Keep<RV>,
  ): ReadableCollection<K, RV>;
}

/**
 * Sort operations
 */
export interface SortOps<K, V> {
  sort(compareFn?: (a: [K, V], b: [K, V]) => number): ReadableCollection<K, V>;
  reverse(): ReadableCollection<K, V>;
}

/**
 * Conversion operations
 */
export interface ConversionOps<K, V> {
  toArray(): Array<[K, V]>;
  toObject(): Record<string, V>;
  toJSON(): Array<[K, V]>;
  toMap(): Map<K, V>;
  toSet(): Set<V>;
}

/**
 * Utility type for merge operations
 */
export type MergeStrategy<V> = (
  existing: V,
  incoming: V,
  key: any,
) => V | undefined;

/**
 * Comparator function type
 */
export type Comparator<T> = (a: T, b: T) => number;

/**
 * Predicate function type
 */
export type Predicate<T> = (value: T) => boolean;

/**
 * Mapper function type
 */
export type Mapper<T, R> = (value: T) => R;

/**
 * Reducer function type
 */
export type Reducer<T, R> = (accumulator: R, value: T) => R;

/**
 * Keep type for filtering operations
 */
export type Keep<V> = { keep: false } | { keep: true; value: V };
