/**
 * Memoized versions of collection operations
 * These functions cache results for performance with repeated calls
 *
 * @module operations/memoized
 *
 * @example
 * ```typescript
 * import { memoizedFilter, memoizedMap } from '@gerts/collection/operations/memoized';
 *
 * // Results will be cached
 * const filtered1 = memoizedFilter(collection, x => x > 10);
 * const filtered2 = memoizedFilter(collection, x => x > 10); // Returns cached result
 * ```
 */

import { memoize } from '../utils/memoize';

import { groupBy, partition, reduce } from './aggregate';
import { filter, find } from './search';
import { chunk, map, mapKeys, mapValues, sort } from './transform';

// Memoize configuration
const CACHE_OPTIONS = {
  maxSize: 100,
  ttl: 60000, // 1 minute
};

/**
 * Memoized version of map operation
 * Caches results based on iterable and mapping function
 */
export const memoizedMap = memoize(map, CACHE_OPTIONS) as typeof map;

/**
 * Memoized version of mapValues operation
 * Creates new Map with transformed values
 */
export const memoizedMapValues = memoize(mapValues, CACHE_OPTIONS) as typeof mapValues;

/**
 * Memoized version of mapKeys operation
 * Creates new Map with transformed keys
 */
export const memoizedMapKeys = memoize(mapKeys, CACHE_OPTIONS) as typeof mapKeys;

/**
 * Memoized version of filter operation
 * Returns filtered entries based on predicate
 */
export const memoizedFilter = memoize(filter, CACHE_OPTIONS) as typeof filter;

/**
 * Memoized version of find operation
 * Returns first matching value
 */
export const memoizedFind = memoize(find, CACHE_OPTIONS) as typeof find;

/**
 * Memoized version of reduce operation
 * Reduces collection to single value
 */
export const memoizedReduce = memoize(reduce, CACHE_OPTIONS) as typeof reduce;

/**
 * Memoized version of groupBy operation
 * Groups entries by key selector
 * Note: Already has internal memoization in aggregate.ts
 */
export const memoizedGroupBy = groupBy;

/**
 * Memoized version of sort operation
 * Sorts entries based on comparator
 */
export const memoizedSort = memoize(sort, CACHE_OPTIONS) as typeof sort;

/**
 * Memoized version of chunk operation
 * Splits collection into chunks of specified size
 */
export const memoizedChunk = memoize(chunk, CACHE_OPTIONS) as typeof chunk;

/**
 * Memoized version of partition operation
 * Splits collection based on predicate
 */
export const memoizedPartition = memoize(partition, CACHE_OPTIONS) as typeof partition;

/**
 * Collection operation wrapper that automatically memoizes
 * Use for expensive operations that may be repeated
 *
 * @example
 * ```typescript
 * const expensiveOp = withMemoization((iterable, threshold) => {
 *   // Expensive computation
 *   return Array.from(iterable).filter(([k, v]) => v > threshold);
 * });
 * ```
 */
export function withMemoization<T extends (...args: any[]) => any>(
  operation: T,
  options = CACHE_OPTIONS,
): T {
  return memoize(operation, options);
}

/**
 * Create a batch of memoized operations
 * Shares cache between operations for efficiency
 *
 * @example
 * ```typescript
 * const ops = createMemoizedBatch({
 *   filter: search.filter,
 *   map: transform.map,
 *   reduce: aggregate.reduce
 * });
 *
 * // All operations share cache
 * const filtered = ops.filter(data, predicate);
 * const mapped = ops.map(filtered, mapper);
 * ```
 */
export function createMemoizedBatch<T extends Record<string, (...args: any[]) => any>>(
  operations: T,
  options = CACHE_OPTIONS,
): T & { clearCache: () => void } {
  const memoized: Record<string, any> = {};

  for (const [name, op] of Object.entries(operations)) {
    memoized[name] = memoize(op, options);
  }

  // Add cache clear function
  memoized.clearCache = () => {
    for (const op of Object.values(memoized)) {
      if (typeof op === 'function' && 'clearCache' in op) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        (op as any).clearCache();
      }
    }
  };

  return memoized as T & { clearCache: () => void };
}

// Export all memoized operations as a namespace
export const memoized = {
  map: memoizedMap,
  mapValues: memoizedMapValues,
  mapKeys: memoizedMapKeys,
  filter: memoizedFilter,
  find: memoizedFind,
  reduce: memoizedReduce,
  groupBy: memoizedGroupBy,
  sort: memoizedSort,
  chunk: memoizedChunk,
  partition: memoizedPartition,
} as const;
