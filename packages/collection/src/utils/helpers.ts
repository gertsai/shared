/**
 * Shared helper functions for collection operations
 * These functions contain common logic used by both MutableCollection and ImmutableCollection
 */

import type { ReadableCollection } from '../types/interfaces';

type PlainObject = Record<string | number, unknown>;

function isArray(value: unknown): value is ReadonlyArray<unknown> {
  return Array.isArray(value);
}

export function isMap(value: unknown): value is ReadonlyMap<unknown, unknown> {
  return value instanceof Map;
}

export function isSet(value: unknown): value is ReadonlySet<unknown> {
  return value instanceof Set;
}

export function isPrimitive(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint'
  );
}

/**
 * Creates a new collection instance of the same type as the input
 * Used for operations that return a new collection
 */
export function createCollectionLike<K, V, T extends ReadableCollection<K, V>>(
  original: T,
  entries: Iterable<[K, V]>,
): T {
  const Constructor = original.constructor as new (
    entries?: Iterable<[K, V]>,
  ) => T;
  return new Constructor(entries);
}

/**
 * Converts various input types to an iterable of entries
 */
export function toEntries<K, V>(
  input: Iterable<[K, V]> | ReadableCollection<K, V> | Map<K, V>,
): Iterable<[K, V]> {
  if ('entries' in input && typeof input.entries === 'function') {
    return input.entries();
  }
  return input as Iterable<[K, V]>;
}

/**
 * Checks if two values are equal using Object.is semantics
 */
export function isEqual<T>(a: T, b: T): boolean {
  return Object.is(a, b);
}

/**
 * Combines multiple predicates with AND logic
 */
export function combinePredicates<T>(
  ...predicates: Array<(value: T) => boolean>
): (value: T) => boolean {
  return (value: T) => predicates.every((predicate) => predicate(value));
}

/**
 * Creates a comparator function for sorting by a key selector
 */
export function createComparatorByKey<T, K>(
  keySelector: (value: T) => K,
  compareFn?: (a: K, b: K) => number,
): (a: T, b: T) => number {
  return (a: T, b: T) => {
    const keyA = keySelector(a);
    const keyB = keySelector(b);

    if (compareFn) {
      return compareFn(keyA, keyB);
    }

    // Default comparison
    if (keyA < keyB) {
      return -1;
    }
    if (keyA > keyB) {
      return 1;
    }
    return 0;
  };
}

/**
 * Efficiently concatenates multiple iterables
 */
export function* concat<T>(...iterables: Array<Iterable<T>>): Generator<T> {
  for (const iterable of iterables) {
    yield* iterable;
  }
}

/**
 * Batches entries into chunks of specified size
 */
export function* batch<T>(iterable: Iterable<T>, size: number): Generator<T[]> {
  if (size <= 0) {
    throw new Error('Batch size must be positive');
  }

  let batch: T[] = [];
  for (const item of iterable) {
    batch.push(item);
    if (batch.length === size) {
      yield batch;
      batch = [];
    }
  }

  if (batch.length > 0) {
    yield batch;
  }
}

/**
 * Creates a deep clone of a value
 */
function deepCloneInternal(
  value: unknown,
  visited: WeakMap<any, any>,
): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Handle circular references
  if (visited.has(value)) {
    return visited.get(value);
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags);
  }

  if (isArray(value)) {
    const cloned: unknown[] = [];
    visited.set(value, cloned);
    for (const item of value) {
      cloned.push(deepCloneInternal(item, visited));
    }
    return cloned;
  }

  if (isMap(value)) {
    const cloned = new Map();
    visited.set(value, cloned);
    for (const [k, v] of value) {
      cloned.set(deepCloneInternal(k, visited), deepCloneInternal(v, visited));
    }
    return cloned;
  }

  if (isSet(value)) {
    const cloned = new Set();
    visited.set(value, cloned);
    for (const item of value) {
      cloned.add(deepCloneInternal(item, visited));
    }
    return cloned;
  }

  if (isPlainObject(value)) {
    const source = value as PlainObject;
    const result: PlainObject = {};
    visited.set(value, result);
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        result[key] = deepCloneInternal(source[key], visited);
      }
    }
    return result;
  }

  // Fallback for non-plain objects
  return value;
}

export function deepClone<T>(value: T): T {
  return deepCloneInternal(value, new WeakMap()) as T;
}

/**
 * Checks if a value is a plain object
 */
export function isPlainObject(value: unknown): value is PlainObject {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Merges two objects deeply
 */
/**
 * Deeply merges two plain objects. Does not mutate inputs.
 * Arrays, Maps, and Sets are cloned on assignment and not merged recursively.
 */
export function deepMerge<
  TTarget extends PlainObject,
  TSource extends Partial<TTarget>,
>(
  target: TTarget | null | undefined,
  source: TSource | null | undefined,
  strategy?: (old: any, incoming: any) => any,
): TTarget {
  if (!target) {
    return (source || {}) as TTarget;
  }
  if (!source) {
    return target;
  }

  // Handle Maps
  if (isMap(target) && isMap(source)) {
    const result = new Map(target);
    for (const [key, value] of source) {
      result.set(key, value);
    }
    // Cast is safe because TTarget extends PlainObject is nominally wrong for Map; callers use strategy
    return result as unknown as TTarget;
  }

  // Handle Sets
  if (isSet(target) && isSet(source)) {
    return new Set([...target, ...source]) as unknown as TTarget;
  }

  const result: TTarget = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = (source as PlainObject)[key];
      const targetValue = (result as PlainObject)[key];

      if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        // Recursively merge objects with strategy
        (result as PlainObject)[key] = deepMerge(
          targetValue as PlainObject,
          sourceValue as Partial<PlainObject>,
          strategy,
        );
      } else if (strategy && targetValue !== undefined) {
        // Apply strategy for non-object values
        (result as PlainObject)[key] = strategy(targetValue, sourceValue);
      } else if (sourceValue !== undefined) {
        // Clone source value if no strategy or target is undefined
        (result as PlainObject)[key] = deepClone(sourceValue);
      }
    }
  }

  return result;
}

/**
 * Memoizes a function result
 */
export function memoize<Args extends any[], Result>(
  fn: (...args: Args) => Result,
  keyGenerator?: (...args: Args) => string,
): (...args: Args) => Result {
  const cache = new Map<string, Result>();

  return (...args: Args): Result => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);

    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * Type guard to check if a value is iterable
 */
export function isIterable<T>(value: any): value is Iterable<T> {
  return value != null && typeof value[Symbol.iterator] === 'function';
}

/**
 * Converts a collection to a plain object
 */
export function toObject<K, V>(entries: Iterable<[K, V]>): Record<string, V> {
  const obj: Record<string, V> = {};
  for (const [key, value] of entries) {
    obj[String(key)] = value;
  }
  return obj;
}

/**
 * Gets the size of an iterable
 */
export function getIterableSize<T>(iterable: Iterable<T>): number {
  let size = 0;

  for (const _item of iterable) {
    void _item; // Used for iteration count
    size++;
  }
  return size;
}

/**
 * Convert any value to entries array
 */
export function entriesArray(value: unknown): Array<[any, any]> {
  if (isMap(value)) {
    return Array.from(value.entries());
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => [i, v]);
  }
  if (value && typeof value === 'object') {
    return Object.entries(value);
  }
  return [];
}

/**
 * Get random index within range
 */
export function getRandomIndex(size: number): number {
  if (size <= 0) {
    throw new Error('Size must be positive');
  }
  return Math.floor(Math.random() * size);
}

/**
 * Merge strategies for deepMerge
 */
export const mergeStrategies = {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  replace: (_old: any, incoming: any) => incoming,
  concat: (old: any, incoming: any) => {
    if (Array.isArray(old) && Array.isArray(incoming)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return [...old, ...incoming];
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return incoming;
  },
  dedupe: (old: any, incoming: any) => {
    if (Array.isArray(old) && Array.isArray(incoming)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return Array.from(new Set([...old, ...incoming]));
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return incoming;
  },
} as const;
