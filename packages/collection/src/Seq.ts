/**
 * Lazy Sequence implementation
 * Provides lazy evaluation for chain operations without creating intermediate collections
 * With caching support for improved performance on repeated iterations
 */

import type { BaseCollection } from './core/BaseCollection';
import { MutableCollection } from './core/MutableCollection';
import type { ReadableCollection } from './types/interfaces';
import { LRUCache } from './utils/memoize';

// Type alias for backward compatibility
type Collection<K, V> = MutableCollection<K, V>;
const Collection = MutableCollection;

export type SeqOperation<T, R> = (value: T) => R;
export type SeqPredicate<T> = (value: T) => boolean;

/**
 * Options for Seq caching behavior
 */
export interface SeqCacheOptions {
  /** Whether to cache results after first iteration */
  cacheResults?: boolean;
  /** Maximum number of cached operations */
  maxCacheSize?: number;
  /** Whether to share cache between cloned sequences */
  shareCache?: boolean;
}

/**
 * Lazy sequence for efficient chaining of collection operations
 * Operations are not executed until terminal operation is called
 * Supports intelligent caching for improved performance
 */
export class Seq<Key, Value> {
  private operations: Array<
    (iterable: Iterable<[Key, Value]>) => Iterable<[Key, Value]>
  > = [];
  private source: Iterable<[Key, Value]>;
  private _cache?: Array<[Key, Value]>;
  private _cacheComplete: boolean = false;
  private _operationCache?: LRUCache<string, Array<[Key, Value]>>;
  private _cacheOptions: SeqCacheOptions;
  private static _globalCache = new LRUCache<string, Array<[any, any]>>(1000);

  constructor(
    source: Iterable<[Key, Value]>,
    options: SeqCacheOptions = { cacheResults: false },
  ) {
    this.source = source;
    this._cacheOptions = options;

    if (options.cacheResults && options.maxCacheSize) {
      this._operationCache = new LRUCache<string, Array<[Key, Value]>>(
        options.maxCacheSize,
      );
    }
  }

  /**
   * Creates a Seq from a Collection or any ReadableCollection
   */
  static fromCollection<K, V>(
    collection:
      | Collection<K, V>
      | ReadableCollection<K, V>
      | BaseCollection<K, V>,
    options?: SeqCacheOptions,
  ): Seq<K, V> {
    // Store the collection itself, not its iterator
    // This allows multiple iterations
    return new Seq(collection, options);
  }

  /**
   * Creates a cached Seq that remembers results
   */
  static cached<K, V>(
    source: Iterable<[K, V]>,
    maxCacheSize: number = 100,
  ): Seq<K, V> {
    const materialized = Array.from(source);
    const seq = new Seq<K, V>(materialized, {
      cacheResults: true,
      maxCacheSize,
      shareCache: true,
    });
    return seq;
  }

  /**
   * Adds a filter operation to the chain
   */
  filter(predicate: (value: Value, key: Key) => boolean): Seq<Key, Value> {
    const newSeq = this.clone();
    const op = function* (iterable: Iterable<[Key, Value]>) {
      for (const [key, value] of iterable) {
        if (predicate(value, key)) {
          yield [key, value];
        }
      }
    };
    (op as unknown as { __op?: string }).__op = 'filter';
    newSeq.operations.push(
      op as unknown as (
        iterable: Iterable<[Key, Value]>,
      ) => Iterable<[Key, Value]>,
    );
    return newSeq;
  }

  /**
   * Adds a map operation to the chain
   */
  map<NewValue>(fn: (value: Value, key: Key) => NewValue): Seq<Key, NewValue> {
    const ops = [...this.operations];
    const src = this.source as Iterable<[Key, Value]>;
    const useBaseIterator = this._cacheOptions.cacheResults === true;
    const getBaseIterable = (): Iterable<[Key, Value]> => this;

    // Build a re-iterable source that applies existing ops once, then map lazily
    const source: Iterable<[Key, NewValue]> = {
      [Symbol.iterator](): Iterator<[Key, NewValue]> {
        function* gen(): Generator<[Key, NewValue]> {
          // Use base Seq iterator when caching is enabled to preserve generator reuse semantics
          let iterable: Iterable<[Key, Value]> = useBaseIterator
            ? getBaseIterable()
            : src;
          if (!useBaseIterator) {
            for (const operation of ops) {
              if (typeof operation === 'function') {
                iterable = operation(iterable);
              }
            }
          }
          for (const [key, value] of iterable) {
            yield [key, fn(value, key)];
          }
        }
        return gen();
      },
    };

    const newSeq = new Seq<Key, NewValue>(source, this._cacheOptions);
    // Preserve operations count for toString without executing them in new sequence
    (newSeq as unknown as { operations: Array<unknown> }).operations =
      new Array(this.operations.length + 1);

    // Share caches if configured
    if (this._cacheOptions.shareCache) {
      (newSeq as unknown as { _cache?: Array<[Key, NewValue]> })._cache =
        (this._cache as unknown as Array<[Key, NewValue]>) ?? undefined;
      (newSeq as unknown as { _cacheComplete: boolean })._cacheComplete =
        this._cacheComplete;
      (
        newSeq as unknown as {
          _operationCache?: LRUCache<string, Array<[Key, NewValue]>>;
        }
      )._operationCache =
        (this._operationCache as unknown as LRUCache<
          string,
          Array<[Key, NewValue]>
        >) ?? undefined;
    }

    return newSeq;
  }

  /**
   * Adds a take operation to limit results
   */
  take(amount: number): Seq<Key, Value> {
    const newSeq = this.clone();
    const op = function* (iterable: Iterable<[Key, Value]>) {
      let count = 0;
      for (const entry of iterable) {
        if (count >= amount) {
          break;
        }
        yield entry;
        count++;
      }
    };
    (op as unknown as { __op?: string; __arg?: unknown }).__op = 'take';
    (op as unknown as { __op?: string; __arg?: unknown }).__arg = amount;
    newSeq.operations.push(
      op as unknown as (
        iterable: Iterable<[Key, Value]>,
      ) => Iterable<[Key, Value]>,
    );
    return newSeq;
  }

  /**
   * Adds a skip operation
   */
  skip(amount: number): Seq<Key, Value> {
    const newSeq = this.clone();
    const op = function* (iterable: Iterable<[Key, Value]>) {
      let count = 0;
      for (const entry of iterable) {
        if (count >= amount) {
          yield entry;
        }
        count++;
      }
    };
    (op as unknown as { __op?: string; __arg?: unknown }).__op = 'skip';
    (op as unknown as { __op?: string; __arg?: unknown }).__arg = amount;
    newSeq.operations.push(
      op as unknown as (
        iterable: Iterable<[Key, Value]>,
      ) => Iterable<[Key, Value]>,
    );
    return newSeq;
  }

  /**
   * Terminal operation: converts to Collection
   * This executes all lazy operations
   */
  toCollection(): Collection<Key, Value> {
    const result = new Collection<Key, Value>();
    for (const [key, value] of this) {
      result.set(key, value);
    }
    return result;
  }

  /**
   * Terminal operation: converts to Array
   */
  toArray(): Value[] {
    const result: Value[] = [];
    for (const [, value] of this) {
      result.push(value);
    }
    return result;
  }

  /**
   * Terminal operation: gets first value
   */
  first(): Value | undefined {
    for (const [, value] of this) {
      return value;
    }
    return undefined;
  }

  /**
   * Terminal operation: counts elements
   */
  count(): number {
    let count = 0;
    for (const _item of this) {
      void _item; // Used for iteration count
      count++;
    }
    return count;
  }

  /**
   * Terminal operation: reduces to single value
   */
  reduce<R>(
    reducer: (accumulator: R, value: Value, key: Key) => R,
    initialValue: R,
  ): R {
    let result = initialValue;
    for (const [key, value] of this) {
      result = reducer(result, value, key);
    }
    return result;
  }

  /**
   * Terminal operation: checks if any element matches predicate
   */
  some(predicate: (value: Value, key: Key) => boolean): boolean {
    for (const [key, value] of this) {
      if (predicate(value, key)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Terminal operation: checks if all elements match predicate
   */
  every(predicate: (value: Value, key: Key) => boolean): boolean {
    for (const [key, value] of this) {
      if (!predicate(value, key)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Terminal operation: finds first matching element
   */
  find(predicate: (value: Value, key: Key) => boolean): Value | undefined {
    for (const [key, value] of this) {
      if (predicate(value, key)) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Forces evaluation and caches result
   * Useful when the same Seq will be iterated multiple times
   */
  cacheResult(): Seq<Key, Value> {
    if (!this._cache) {
      this._cache = Array.from(this);
      this._cacheComplete = true;
    }
    return this;
  }

  /**
   * Makes the Seq iterable with intelligent caching
   */
  *[Symbol.iterator](): Iterator<[Key, Value]> {
    // Use complete cache if available
    if (this._cacheComplete && this._cache) {
      yield* this._cache;
      return;
    }

    // Check operation cache if enabled
    const cacheKey = this._getCacheKey();
    if (this._operationCache && cacheKey) {
      const cached = this._operationCache.get(cacheKey);
      if (cached) {
        yield* cached;
        return;
      }
    }

    // Execute operations
    const results: Array<[Key, Value]> = [];
    const shouldCache =
      this._cacheOptions.cacheResults || this._cache !== undefined;

    let iterable: Iterable<[Key, Value]> = this.source;
    for (const operation of this.operations) {
      if (typeof operation === 'function') {
        iterable = operation(iterable);
      }
    }

    for (const entry of iterable) {
      if (shouldCache) {
        results.push(entry);
      }
      yield entry;
    }

    // Cache results if needed
    if (shouldCache && results.length > 0) {
      this._cache = results;
      this._cacheComplete = true;

      if (this._operationCache && cacheKey) {
        this._operationCache.set(cacheKey, results);
      }
    }
  }

  /**
   * Generate a cache key based on operations
   * @private
   */
  private _getCacheKey(): string {
    return `seq_${this.operations.length}_${JSON.stringify(this._cacheOptions)}`;
  }

  /**
   * Clones the Seq with same operations
   */
  private clone(): Seq<Key, Value> {
    const cloned = new Seq<Key, Value>(this.source, this._cacheOptions);
    cloned.operations = [...this.operations];
    if (this._cacheOptions.shareCache) {
      cloned._cache = this._cache;
      cloned._cacheComplete = this._cacheComplete;
      // Do not share operation-level cache across different op chains
      cloned._operationCache = undefined;
    }
    return cloned;
  }

  /**
   * Invalidates the cache, forcing re-evaluation
   */
  invalidateCache(): this {
    this._cache = undefined;
    this._cacheComplete = false;
    if (this._operationCache) {
      this._operationCache.clear();
    }
    return this;
  }

  /**
   * Enables caching for this sequence
   */
  withCache(maxCacheSize: number = 100): Seq<Key, Value> {
    const newSeq = this.clone();
    newSeq._cacheOptions = {
      ...this._cacheOptions,
      cacheResults: true,
      maxCacheSize,
    };
    newSeq._operationCache = new LRUCache<string, Array<[Key, Value]>>(
      maxCacheSize,
    );
    return newSeq;
  }

  /**
   * Clears the global cache for all Seq instances
   */
  static clearGlobalCache(): void {
    Seq._globalCache.clear();
  }

  /**
   * Debugging: returns description of operations chain
   */
  toString(): string {
    return `Seq { operations: ${this.operations.length} }`;
  }
}

/**
 * Helper function to create a Seq from various inputs
 */
export function seq<K, V>(
  input: Iterable<[K, V]> | MutableCollection<K, V>,
  options?: SeqCacheOptions,
): Seq<K, V> {
  if (input instanceof MutableCollection) {
    return Seq.fromCollection(input, options);
  }
  return new Seq(input, options);
}

/**
 * Factory function to create a cached Seq
 * Automatically enables caching for improved performance
 */
export function cachedSeq<K, V>(
  input: Iterable<[K, V]> | MutableCollection<K, V>,
  maxCacheSize: number = 100,
): Seq<K, V> {
  const options: SeqCacheOptions = {
    cacheResults: true,
    maxCacheSize,
    shareCache: true,
  };

  if (input instanceof MutableCollection) {
    // Materialize entries to ensure stable, replayable source
    return new Seq(Array.from(input.entries()), options);
  }
  // Materialize generic iterable to ensure single pass
  return new Seq(Array.from(input), options);
}
