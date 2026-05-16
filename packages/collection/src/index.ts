/**
 * @gertsai/collection - Modern TypeScript collection library
 *
 * A high-performance, TypeScript-first collection library providing:
 * - Multiple collection types (Mutable, Immutable, Persistent)
 * - Specialized collections (BiMap, MultiMap, OrderedMap, WeakCollection)
 * - Lazy evaluation with Seq
 * - Composable functional operations
 * - Mixin-based extensibility
 *
 * ## Core Collections
 *
 * - {@link MutableCollection} - Mutable key-value collection with chainable operations
 * - {@link ImmutableCollection} - Immutable collection returning new instances on modification
 * - {@link PersistentCollection} - HAMT-backed collection with structural sharing
 * - {@link PersistentMap} - Hash Array Mapped Trie implementation
 *
 * ## Specialized Collections
 *
 * - {@link BiMap} - Bidirectional map with O(1) lookups in both directions
 * - {@link MultiMap} - Map allowing multiple values per key
 * - {@link OrderedMap} - Map maintaining insertion order with reordering
 * - {@link WeakCollection} - Collection with weak references to keys
 *
 * ## Lazy Evaluation
 *
 * - {@link Seq} - Lazy sequence for efficient chained operations
 * - {@link seq} - Factory function to create Seq from iterables
 * - {@link cachedSeq} - Factory for cached Seq instances
 *
 * ## Operations
 *
 * Standalone functions that work with any iterable:
 * - Search: {@link find}, {@link filter}, {@link some}, {@link every}
 * - Transform: {@link map}, {@link mapValues}, {@link flatMap}, {@link sort}
 * - Aggregate: {@link reduce}, {@link groupBy}, {@link sum}, {@link count}
 * - Set: {@link union}, {@link intersection}, {@link difference}, {@link merge}
 *
 * ## Mixins
 *
 * - {@link withExtendedOps} - Adds sweep, ensure, tap, concat
 * - {@link withBatchOps} - Adds batch mutations and mutability conversion
 * - {@link withDeepOps} - Adds deep get/set/merge operations
 * - {@link withPositionalAccess} - Adds index-based access methods
 *
 * @packageDocumentation
 * @module @gertsai/collection
 * @version 0.1.0
 *
 * @example Basic Usage
 * ```typescript
 * import {
 *   MutableCollection,
 *   ImmutableCollection,
 *   seq,
 *   filter,
 *   map,
 * } from '@gertsai/collection';
 *
 * // Create a mutable collection
 * const users = new MutableCollection([['u1', { name: 'Alice', age: 30 }]]);
 *
 * // Use immutable operations
 * const immutable = new ImmutableCollection([['a', 1], ['b', 2]]);
 * const updated = immutable.set('c', 3); // Returns new instance
 *
 * // Lazy evaluation for large datasets
 * const result = seq(users.entries())
 *   .filter(([, user]) => user.age >= 18)
 *   .map(([, user]) => user.name)
 *   .take(10)
 *   .toArray();
 * ```
 *
 * @example Specialized Collections
 * ```typescript
 * import { BiMap, MultiMap, OrderedMap } from '@gertsai/collection';
 *
 * // BiMap for bidirectional lookups
 * const bimap = new BiMap<string, number>();
 * bimap.set('one', 1);
 * bimap.getKey(1); // 'one'
 *
 * // MultiMap for one-to-many relationships
 * const mm = new MultiMap<string, string>();
 * mm.add('user', 'role1');
 * mm.add('user', 'role2');
 * mm.getAll('user'); // ['role1', 'role2']
 *
 * // OrderedMap for insertion order
 * const ordered = new OrderedMap<string, number>();
 * ordered.set('first', 1).set('second', 2);
 * ordered.moveToFront('second');
 * ```
 */

// Core types and interfaces
import { ImmutableCollection as ImmutableCol } from './core/ImmutableCollection';
import { MutableCollection as MutableCol } from './core/MutableCollection';
export * from './types/interfaces';

// Core collection classes
export { BaseCollection } from './core/BaseCollection';
export { MutableCollection } from './core/MutableCollection';
export { ImmutableCollection, IS_IMMUTABLE } from './core/ImmutableCollection';
export type { ReadonlyImmutableCollection } from './core/ImmutableCollection';

// Factory functions for creating collections
export {
  createCollection,
  createMutableCollection,
  createImmutableCollection,
  createLightweightCollection,
  createLightweightImmutableCollection,
  type CollectionOptions,
} from './core/createCollection';

// Mixins for extending functionality
export { withExtendedOps, type ExtendedOps } from './mixins/ExtendedOps';
export { withBatchOps, type BatchOps } from './mixins/BatchOps';
export { withDeepOps, type DeepOps } from './mixins/DeepOps';
export { withPositionalAccess, type PositionalAccessOps } from './mixins/PositionalAccess';

// Error classes
export {
  CollectionError,
  InvalidArgumentError,
  KeyNotFoundError,
  UnsupportedOperationError,
  InvalidPathError,
  IndexOutOfBoundsError,
} from './errors';

// Operations - can be imported separately for tree-shaking
export * as search from './operations/search';
export * as transform from './operations/transform';
export * as aggregate from './operations/aggregate';
export * as set from './operations/set';

// Memoized operations for performance
export * as memoized from './operations/memoized';
export {
  memoize,
  memoizeCollectionOp,
  memoizeReducer,
  memoizeMethod,
  LRUCache,
} from './utils/memoize';

// Structural comparison utilities
export * from './utils/structural';

// Type guards and assertion functions
export {
  // Type guards (is*)
  isReadableCollection,
  isIterable,
  isMap,
  isSet,
  isArray,
  isPlainObject,
  isFunction,
  isGeneratorFunction,
  isAsyncIterable,
  isDefined,
  isEntry,
  // Assertion functions (assert*)
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
} from './utils/type-guards';

// Utility types
export type {
  KeyOf,
  ValueOf,
  EntryOf,
  DeepPartial,
  DeepReadonly,
  CollectionMethodReturn,
  // Template literal types
  OperationNamespace,
  OperationName,
  SearchOperationName,
  TransformOperationName,
  AggregateOperationName,
  SetOperationName,
  CollectionOperationName,
  ExtractNamespace,
  ExtractOperation,
  // Additional utility types
  RequireFields,
  OptionalFields,
  UnwrapPromise,
  ArrayElement,
} from './types/interfaces';

// Branded types
export type { CacheKey, CollectionId, SeqOperationIndex, HashCode } from './types/branded';
export {
  BrandValidationError,
  createCacheKey,
  createCollectionId,
  createSeqOperationIndex,
  createHashCode,
  isValidCacheKeyFormat,
  isValidCollectionIdFormat,
} from './types/branded';

// HAMT constants (for advanced usage)
export { HAMTConstants } from './core/PersistentMap';

// Re-export specific frequently used functions
export { find, filter, some, every, findKey, findLast, take, skip } from './operations/search';

export {
  map,
  mapValues,
  mapKeys,
  flatMap,
  reverse,
  sort,
  sortByKey,
  sortByValue,
  chunk,
  zip,
  zipWithIndex,
} from './operations/transform';

export {
  reduce,
  groupBy,
  sum,
  average,
  min,
  max,
  first,
  last,
  isEmpty,
  count,
  partition,
  frequencies,
} from './operations/aggregate';

export {
  union,
  intersection,
  difference,
  symmetricDifference,
  merge,
  mergeWith,
  mergeDeep,
  isSubset,
  isSuperset,
  isDisjoint,
  unique,
  duplicates,
} from './operations/set';

export {
  Seq,
  seq,
  cachedSeq,
  type SeqCacheOptions,
  type SeqOperation,
  type SeqPredicate,
} from './Seq';

// Persistent data structures
export { PersistentMap } from './core/PersistentMap';
export { PersistentCollection } from './core/PersistentCollection';

// Specialized collections
export {
  BiMap,
  MultiMap,
  OrderedMap,
  WeakCollection,
  WeakBiMap,
  WeakValueMap,
  type MultiMapOptions,
  type IWeakCollection,
} from './specialized';

// (imports moved to top)

// Factory functions for convenience
export const mutable = <K, V>(entries?: Iterable<[K, V]>) => new MutableCol<K, V>(entries);

export const immutable = <K, V>(entries?: Iterable<[K, V]>) => new ImmutableCol<K, V>(entries);

// Alias for backward compatibility - Collection is now MutableCollection
export const Collection = MutableCol;
export type ReadonlyCollection<K, V> = Readonly<ImmutableCol<K, V>>;

// Version
export const VERSION = '0.1.0';
