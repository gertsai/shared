/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/**
 * Memoization utilities for expensive collection operations
 * Provides caching mechanisms to avoid redundant computations
 *
 * @module utils/memoize
 */

import type { ReadableCollection } from '../types/interfaces';

/**
 * Cache entry with value and metadata
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
}

/**
 * Options for memoization
 */
export interface MemoizeOptions {
  /** Maximum number of cached entries */
  maxSize?: number;
  /** Time-to-live in milliseconds */
  ttl?: number;
  /** Use weak references for keys */
  weak?: boolean;
  /** Custom key generator */
  keyGenerator?: (...args: any[]) => string;
}

/**
 * Default key generator for memoization
 * Converts arguments to a stable string key
 */
function defaultKeyGenerator(...args: any[]): string {
  return JSON.stringify(args, (key, value): unknown => {
    // Handle undefined explicitly
    if (value === undefined) {
      return { _type: 'undefined' };
    }
    // Handle special types
    if (value instanceof Map) {
      return { _type: 'Map', entries: Array.from(value.entries()) };
    }
    if (value instanceof Set) {
      return { _type: 'Set', values: Array.from(value) };
    }
    if (typeof value === 'function') {
      return value.toString();
    }
    return value as unknown;
  });
}

/**
 * LRU (Least Recently Used) cache implementation
 * Automatically evicts least recently used items when size limit is reached
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = Math.max(0, maxSize);
  }

  /**
   * Gets a value from the cache
   * Moves the item to the end (most recently used)
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }

    // Move to end (most recently used)
    const value = this.cache.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  /**
   * Sets a value in the cache
   * Evicts least recently used item if size limit is reached
   *
   * @remarks
   * Note: We use delete+set to move existing keys to the end of the Map
   * (maintaining LRU order). This is O(1) amortized but has higher constant
   * factor than a linked-list-based LRU. For high-performance scenarios,
   * consider using a dedicated LRU library with doubly-linked list.
   */
  set(key: K, value: V): void {
    // Don't cache if maxSize is 0
    if (this.maxSize === 0) {
      return;
    }

    // Delete existing key to update position (no has() check needed - delete is safe on missing keys)
    // FIX-023: Removed redundant has() check before delete
    this.cache.delete(key);

    // Evict oldest if at capacity (after delete, so we don't evict the key we're about to set)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, value);
  }

  /**
   * Checks if a key exists in the cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Deletes a key from the cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clears the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Gets the current cache size
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Memoizes a function with automatic caching
 * Supports TTL, size limits, and custom key generation
 *
 * @param fn - The function to memoize
 * @param options - Memoization options
 * @returns Memoized function
 *
 * @example
 * ```typescript
 * const expensiveOperation = memoize(
 *   (data: Map<string, number>) => {
 *     // Expensive computation
 *     return Array.from(data.values()).reduce((a, b) => a + b, 0);
 *   },
 *   { maxSize: 50, ttl: 5000 }
 * );
 * ```
 */
export function memoize<T extends (...args: any[]) => any>(
  fn: T,
  options: MemoizeOptions = {},
): T & { clearCache: () => void; getCacheSize: () => number } {
  const { maxSize = 100, ttl, weak = false, keyGenerator = defaultKeyGenerator } = options;

  // Choose cache implementation based on options
  const cache =
    weak && typeof WeakMap !== 'undefined'
      ? new WeakMap<object, CacheEntry<ReturnType<T>>>()
      : new LRUCache<string, CacheEntry<ReturnType<T>>>(maxSize);

  const memoized = function (this: any, ...args: Parameters<T>): ReturnType<T> {
    // Generate cache key
    const key = weak ? args[0] : keyGenerator(...args);

    // Check cache
    if (weak && cache instanceof WeakMap) {
      if (typeof key === 'object' && key !== null && cache.has(key)) {
        const entry = cache.get(key);
        if (!entry) {
          return fn.apply(this, args);
        }

        // Check TTL
        if (ttl === undefined || (ttl > 0 && Date.now() - entry.timestamp < ttl)) {
          entry.hits++;
          return entry.value;
        }
      }
    } else if (cache instanceof LRUCache) {
      const entry = cache.get(key as string);

      if (entry) {
        // Check TTL
        if (ttl === undefined || (ttl > 0 && Date.now() - entry.timestamp < ttl)) {
          entry.hits++;
          return entry.value;
        }
      }
    }

    // Compute and cache result
    const result = fn.apply(this, args);
    const entry: CacheEntry<ReturnType<T>> = {
      value: result,
      timestamp: Date.now(),
      hits: 0,
    };

    if (weak && cache instanceof WeakMap && typeof key === 'object' && key !== null) {
      cache.set(key, entry);
    } else if (cache instanceof LRUCache) {
      cache.set(key as string, entry);
    }

    return result;
  } as T;

  // Add cache management methods
  (memoized as any).clearCache = () => {
    if (cache instanceof LRUCache) {
      cache.clear();
    }
    // WeakMap doesn't have a clear method
  };

  (memoized as any).getCacheSize = () => {
    if (cache instanceof LRUCache) {
      return cache.size;
    }
    return -1; // WeakMap size is not accessible
  };

  return memoized as T & { clearCache: () => void; getCacheSize: () => number };
}

/**
 * Memoizes collection operations that are expensive
 * Specifically designed for collection transformations
 *
 * @param operation - The operation to memoize
 * @returns Memoized operation
 */
export function memoizeCollectionOp<K, V, R>(
  operation: (collection: ReadableCollection<K, V>, ...args: any[]) => R,
): (collection: ReadableCollection<K, V>, ...args: any[]) => R {
  // Use WeakMap for collection references
  const cache = new WeakMap<ReadableCollection<K, V>, Map<string, R>>();

  return function memoizedOp(collection: ReadableCollection<K, V>, ...args: any[]): R {
    // Get or create cache for this collection
    if (!cache.has(collection)) {
      cache.set(collection, new Map());
    }

    const key = defaultKeyGenerator(args);
    const collectionCache = cache.get(collection);
    if (!collectionCache) {
      const newCache = new Map();
      cache.set(collection, newCache);
      const result = operation(collection, ...args);
      newCache.set(key, result);
      return result;
    }

    // Check cache
    if (collectionCache.has(key)) {
      const cached = collectionCache.get(key);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Compute and cache result
    const result = operation(collection, ...args);
    collectionCache.set(key, result);

    return result;
  };
}

/**
 * Creates a memoized version of a reducer function
 * Caches intermediate results for incremental computation
 *
 * @param reducer - The reducer function
 * @param keyFn - Function to generate cache key from accumulator
 * @returns Memoized reducer
 */
export function memoizeReducer<T, R>(
  reducer: (acc: R, value: T, index: number) => R,
  keyFn: (acc: R) => string = JSON.stringify,
): (acc: R, value: T, index: number) => R {
  const cache = new Map<string, Map<string, R>>();

  return function memoizedReducer(acc: R, value: T, index: number): R {
    const accKey = keyFn(acc);
    const valueKey = JSON.stringify({ value, index });

    // Get or create cache for this accumulator
    if (!cache.has(accKey)) {
      cache.set(accKey, new Map());
    }

    const accCache = cache.get(accKey);
    if (!accCache) {
      const newCache = new Map<string, R>();
      cache.set(accKey, newCache);
      const result = reducer(acc, value, index);
      newCache.set(valueKey, result);
      return result;
    }

    // Check cache
    if (accCache.has(valueKey)) {
      const cached = accCache.get(valueKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Compute and cache result
    const result = reducer(acc, value, index);
    accCache.set(valueKey, result);

    // Limit cache size per accumulator
    if (accCache.size > 1000) {
      const firstKey = accCache.keys().next().value;
      if (firstKey !== undefined) {
        accCache.delete(firstKey);
      }
    }

    return result;
  };
}

/**
 * Structural hashing for collections
 * Creates a hash that represents the structure and content
 * Used for efficient equality checks and caching
 *
 * @param collection - The collection to hash
 * @returns Hash string
 */
export function hashCollection<K, V>(collection: ReadableCollection<K, V>): string {
  const entries = Array.from(collection.entries()).sort((a, b) => {
    const keyA = String(a[0]);
    const keyB = String(b[0]);
    return keyA.localeCompare(keyB);
  });

  return JSON.stringify({
    size: collection.size,
    entries: entries.map(([k, v]) => [k, v]),
  });
}

/**
 * Creates a memoized version of a collection method
 * Automatically invalidates cache when collection changes
 *
 * @param method - The method to memoize
 * @param detectChanges - Function to detect if collection has changed
 * @returns Memoized method
 */
export function memoizeMethod<T extends (...args: any[]) => any>(
  method: T,
  detectChanges: () => string | number = () => Date.now().toString(),
): T {
  let lastChangeToken: string | number = detectChanges();
  const cache = new Map<string, ReturnType<T>>();

  return function memoizedMethod(this: any, ...args: Parameters<T>): ReturnType<T> {
    // Check if collection has changed
    const currentToken = detectChanges();
    if (currentToken !== lastChangeToken) {
      cache.clear();
      lastChangeToken = currentToken;
    }

    // Generate cache key
    const key = defaultKeyGenerator(args);

    // Check cache
    if (cache.has(key)) {
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Compute and cache result
    const result = method.apply(this, args);
    cache.set(key, result);

    // Limit cache size
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) {
        cache.delete(firstKey);
      }
    }

    return result;
  } as T;
}

/**
 * Batch memoization for multiple related operations
 * Shares cache between operations for efficiency
 */
export class BatchMemoizer {
  private cache = new LRUCache<string, any>(500);

  /**
   * Memoizes a batch of related operations
   *
   * @param operations - Object with operation functions
   * @returns Object with memoized operations
   */
  memoizeBatch<T extends Record<string, (...args: any[]) => any>>(
    operations: T,
  ): T & { clearCache: () => void } {
    const memoized: any = {};

    for (const [name, op] of Object.entries(operations)) {
      memoized[name] = (...args: any[]) => {
        const key = `${name}:${defaultKeyGenerator(args)}`;

        if (this.cache.has(key)) {
          return this.cache.get(key);
        }

        const result = op(...args);
        this.cache.set(key, result);
        return result;
      };
    }

    memoized.clearCache = () => this.cache.clear();

    return memoized;
  }
}

/**
 * Export singleton batch memoizer for global use
 */
export const globalBatchMemoizer = new BatchMemoizer();
