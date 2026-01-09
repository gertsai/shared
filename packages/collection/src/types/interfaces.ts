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
  /**
   * Executes a callback for each entry in the collection.
   * @param callbackfn - Function to execute for each entry
   * @param thisArg - Value to use as `this` when executing the callback
   */
  forEach<T = void>(
    callbackfn: (this: T, value: V, key: K, collection: ReadableCollection<K, V>) => void,
    thisArg?: T,
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
  findKey(predicate: (value: V, key: K, index: number) => boolean): K | undefined;
  filter(predicate: (value: V, key: K, index: number) => boolean): ReadableCollection<K, V>;
  /** Lazy filter over entries */
  filterIter(predicate: (value: V, key: K, index: number) => boolean): IterableIterator<[K, V]>;
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
  reduce<R>(reducer: (accumulator: R, value: V, key: K, index: number) => R, initialValue: R): R;
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
  symmetricDifference(other: ReadableCollection<K, V>): ReadableCollection<K, V>;
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
 * Utility type for merge operations.
 * The key parameter is typed for type safety.
 * @template K - Key type
 * @template V - Value type
 */
export type MergeStrategy<K, V> = (existing: V, incoming: V, key: K) => V | undefined;

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

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract key type from a collection
 * @example
 * type K = KeyOf<ReadableCollection<string, number>>; // string
 */
export type KeyOf<C> = C extends ReadableCollection<infer K, unknown> ? K : never;

/**
 * Extract value type from a collection
 * @example
 * type V = ValueOf<ReadableCollection<string, number>>; // number
 */
export type ValueOf<C> = C extends ReadableCollection<unknown, infer V> ? V : never;

/**
 * Extract entry type from a collection
 * @example
 * type E = EntryOf<ReadableCollection<string, number>>; // [string, number]
 */
export type EntryOf<C> = C extends ReadableCollection<infer K, infer V> ? [K, V] : never;

/**
 * Make all properties of a collection's value type optional (deep)
 */
export type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

/**
 * Make all properties of a collection's value type readonly (deep)
 */
export type DeepReadonly<T> = T extends object
  ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
  : T;

/**
 * Extract the return type of a collection method
 */
export type CollectionMethodReturn<
  C extends ReadableCollection<unknown, unknown>,
  M extends keyof C,
> = C[M] extends (...args: unknown[]) => infer R ? R : never;

// ============================================================================
// Template Literal Types
// ============================================================================

/**
 * Operation namespace prefixes for categorizing collection operations.
 */
export type OperationNamespace = 'search' | 'transform' | 'aggregate' | 'set';

/**
 * Template literal type for namespaced operation names.
 * Ensures consistent naming: `{namespace}:{operation}`
 *
 * @example
 * type SearchOp = OperationName<'search', 'find'>; // 'search:find'
 */
export type OperationName<N extends OperationNamespace, Op extends string> = `${N}:${Op}`;

/**
 * All search operation names.
 */
export type SearchOperationName =
  | OperationName<'search', 'find'>
  | OperationName<'search', 'findKey'>
  | OperationName<'search', 'filter'>
  | OperationName<'search', 'some'>
  | OperationName<'search', 'every'>
  | OperationName<'search', 'take'>
  | OperationName<'search', 'skip'>;

/**
 * All transform operation names.
 */
export type TransformOperationName =
  | OperationName<'transform', 'map'>
  | OperationName<'transform', 'mapValues'>
  | OperationName<'transform', 'mapKeys'>
  | OperationName<'transform', 'flatMap'>
  | OperationName<'transform', 'sort'>
  | OperationName<'transform', 'reverse'>
  | OperationName<'transform', 'chunk'>;

/**
 * All aggregate operation names.
 */
export type AggregateOperationName =
  | OperationName<'aggregate', 'reduce'>
  | OperationName<'aggregate', 'groupBy'>
  | OperationName<'aggregate', 'count'>
  | OperationName<'aggregate', 'sum'>
  | OperationName<'aggregate', 'min'>
  | OperationName<'aggregate', 'max'>;

/**
 * All set operation names.
 */
export type SetOperationName =
  | OperationName<'set', 'union'>
  | OperationName<'set', 'intersection'>
  | OperationName<'set', 'difference'>
  | OperationName<'set', 'merge'>;

/**
 * All collection operation names combined.
 */
export type CollectionOperationName =
  | SearchOperationName
  | TransformOperationName
  | AggregateOperationName
  | SetOperationName;

/**
 * Extract namespace from an operation name.
 *
 * @example
 * type NS = ExtractNamespace<'search:find'>; // 'search'
 */
export type ExtractNamespace<T extends string> = T extends `${infer N}:${string}` ? N : never;

/**
 * Extract operation from an operation name.
 *
 * @example
 * type Op = ExtractOperation<'search:find'>; // 'find'
 */
export type ExtractOperation<T extends string> = T extends `${string}:${infer Op}` ? Op : never;

// ============================================================================
// Additional Utility Types
// ============================================================================

/**
 * Make specific properties required in a type.
 * More precise than Required<T>.
 *
 * @example
 * type User = { name?: string; email?: string; age?: number };
 * type RequiredUser = RequireFields<User, 'name' | 'email'>;
 * // { name: string; email: string; age?: number }
 */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make specific properties optional in a type.
 * More precise than Partial<T>.
 *
 * @example
 * type User = { name: string; email: string; age: number };
 * type OptionalUser = OptionalFields<User, 'age'>;
 * // { name: string; email: string; age?: number }
 */
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Extract promise type for async operations.
 *
 * @example
 * type Result = UnwrapPromise<Promise<string>>; // string
 */
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

/**
 * Extract array element type.
 *
 * @example
 * type Item = ArrayElement<string[]>; // string
 */
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;
