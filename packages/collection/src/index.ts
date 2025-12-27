/**
 * @orchlab/collection - Modern TypeScript collection library
 * Version 0.1.0 - Modular Architecture
 */

// Core types and interfaces
import { ImmutableCollection as ImmutableCol } from './core/ImmutableCollection';
import { MutableCollection as MutableCol } from './core/MutableCollection';
import { PersistentCollection as PersistentCol } from './core/PersistentCollection';
export type * from './types/interfaces';

// Core collection classes
export { BaseCollection } from './core/BaseCollection';
export { MutableCollection } from './core/MutableCollection';
export {
  ImmutableCollection,
  IS_IMMUTABLE,
  ReadonlyImmutableCollection,
} from './core/ImmutableCollection';

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
export {
  withPositionalAccess,
  type PositionalAccessOps,
} from './mixins/PositionalAccess';

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

// Re-export specific frequently used functions
export {
  find,
  filter,
  some,
  every,
  findKey,
  findLast,
  take,
  skip,
} from './operations/search';

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
export const mutable = <K, V>(entries?: Iterable<[K, V]>) =>
  new MutableCol<K, V>(entries);

export const immutable = <K, V>(entries?: Iterable<[K, V]>) =>
  new ImmutableCol<K, V>(entries);

// Alias for backward compatibility - Collection is now MutableCollection
export const Collection = MutableCol;
export type ReadonlyCollection<K, V> = Readonly<ImmutableCol<K, V>>;

// Version
export const VERSION = '0.1.0';

/**
 * @deprecated Prefer named exports for better tree-shaking and clarity.
 */
// Default export
export default {
  MutableCollection: MutableCol,
  ImmutableCollection: ImmutableCol,
  PersistentCollection: PersistentCol,
  mutable,
  immutable,
  VERSION,
};
