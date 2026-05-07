/**
 * Transform operations for collections
 * These are pure functions that work with any Iterable
 * Can be memoized externally using utils/memoize for performance
 *
 * @module operations/transform
 */

import { InvalidArgumentError } from '../errors';

/**
 * Maps values in a collection to a new array
 */
export function map<K, V, R>(
  iterable: Iterable<[K, V]>,
  fn: (value: V, key: K, index: number) => R,
): R[] {
  const result: R[] = [];
  let index = 0;
  for (const [key, value] of iterable) {
    result.push(fn(value, key, index++));
  }
  return result;
}

/**
 * Maps values in a collection to a new Map with same keys
 */
export function mapValues<K, V, R>(
  iterable: Iterable<[K, V]>,
  fn: (value: V, key: K) => R,
): Map<K, R> {
  const result = new Map<K, R>();
  for (const [key, value] of iterable) {
    result.set(key, fn(value, key));
  }
  return result;
}

/**
 * Maps keys in a collection to new keys with same values
 */
export function mapKeys<K, V, NK>(
  iterable: Iterable<[K, V]>,
  fn: (key: K, value: V) => NK,
): Map<NK, V> {
  const result = new Map<NK, V>();
  for (const [key, value] of iterable) {
    const newKey = fn(key, value);
    result.set(newKey, value);
  }
  return result;
}

/**
 * Maps entries to new key-value pairs
 */
export function mapEntries<K, V, NK, NV>(
  iterable: Iterable<[K, V]>,
  fn: (key: K, value: V, index: number) => [NK, NV],
): Map<NK, NV> {
  const result = new Map<NK, NV>();
  let index = 0;
  for (const [key, value] of iterable) {
    const [newKey, newValue] = fn(key, value, index++);
    result.set(newKey, newValue);
  }
  return result;
}

/**
 * FlatMaps values in a collection
 */
export function flatMap<K, V, R>(
  iterable: Iterable<[K, V]>,
  fn: (value: V, key: K, index: number) => R[] | R,
): R[] {
  const result: R[] = [];
  let index = 0;
  for (const [key, value] of iterable) {
    const mapped = fn(value, key, index++);
    if (Array.isArray(mapped)) {
      result.push(...mapped);
    } else {
      result.push(mapped);
    }
  }
  return result;
}

/**
 * Filters and maps in one pass (more efficient than filter then map)
 */
export function filterMap<K, V, R>(
  iterable: Iterable<[K, V]>,
  fn: (value: V, key: K, index: number) => R | undefined,
): R[] {
  const result: R[] = [];
  let index = 0;
  for (const [key, value] of iterable) {
    const mapped = fn(value, key, index++);
    if (mapped !== undefined) {
      result.push(mapped);
    }
  }
  return result;
}

/**
 * Zips two iterables together
 */
export function* zip<K, V, K2, V2>(
  iterable1: Iterable<[K, V]>,
  iterable2: Iterable<[K2, V2]>,
): Generator<[[K, V], [K2, V2]]> {
  const iter1 = iterable1[Symbol.iterator]();
  const iter2 = iterable2[Symbol.iterator]();

  while (true) {
    const result1 = iter1.next();
    const result2 = iter2.next();

    if (result1.done || result2.done) {
      break;
    }

    yield [result1.value, result2.value];
  }
}

/**
 * Zips with index
 */
export function* zipWithIndex<K, V>(iterable: Iterable<[K, V]>): Generator<[[K, V], number]> {
  let index = 0;
  for (const entry of iterable) {
    yield [entry, index++];
  }
}

/**
 * Chunks entries into arrays of specified size
 */
export function* chunk<K, V>(iterable: Iterable<[K, V]>, size: number): Generator<Array<[K, V]>> {
  if (size <= 0) {
    throw new InvalidArgumentError('size', 'must be positive');
  }

  let chunk: Array<[K, V]> = [];

  for (const entry of iterable) {
    chunk.push(entry);
    if (chunk.length === size) {
      yield chunk;
      chunk = [];
    }
  }

  if (chunk.length > 0) {
    yield chunk;
  }
}

/**
 * Reverses the order of entries
 */
export function reverse<K, V>(iterable: Iterable<[K, V]>): Array<[K, V]> {
  return Array.from(iterable).toReversed();
}

/**
 * Sorts entries using a comparator
 */
export function sort<K, V>(
  iterable: Iterable<[K, V]>,
  compareFn?: (a: [K, V], b: [K, V]) => number,
): Array<[K, V]> {
  return Array.from(iterable).toSorted(compareFn);
}

/**
 * Sorts by key
 */
export function sortByKey<K, V>(
  iterable: Iterable<[K, V]>,
  compareFn?: (a: K, b: K) => number,
): Array<[K, V]> {
  return sort(iterable, (a, b) => {
    if (compareFn) {
      return compareFn(a[0], b[0]);
    }
    // Default comparison
    if (a[0] < b[0]) {
      return -1;
    }
    if (a[0] > b[0]) {
      return 1;
    }
    return 0;
  });
}

/**
 * Sorts by value
 */
export function sortByValue<K, V>(
  iterable: Iterable<[K, V]>,
  compareFn?: (a: V, b: V) => number,
): Array<[K, V]> {
  return sort(iterable, (a, b) => {
    if (compareFn) {
      return compareFn(a[1], b[1]);
    }
    // Default comparison
    if (a[1] < b[1]) {
      return -1;
    }
    if (a[1] > b[1]) {
      return 1;
    }
    return 0;
  });
}

/**
 * Reject entries by predicate (opposite of filter)
 */
export function reject<K, V>(
  iterable: Iterable<[K, V]>,
  predicate: (value: V, key: K, index: number) => boolean,
): Map<K, V> {
  const result = new Map<K, V>();
  let index = 0;
  for (const [key, value] of iterable) {
    if (!predicate(value, key, index++)) {
      result.set(key, value);
    }
  }
  return result;
}

/**
 * Flatten nested arrays in values
 */
export function flatten<K>(iterable: Iterable<[K, any]>, depth: number = 1): Array<any> {
  const result: Array<any> = [];

  const flattenHelper = (value: any, currentDepth: number): void => {
    if (currentDepth > 0 && Array.isArray(value)) {
      for (const item of value) {
        flattenHelper(item, currentDepth - 1);
      }
    } else {
      result.push(value);
    }
  };

  for (const [, value] of iterable) {
    flattenHelper(value, depth);
  }

  return result;
}

/**
 * Remove falsy values
 */
export function compact<K, V>(iterable: Iterable<[K, V]>): Map<K, V> {
  const result = new Map<K, V>();
  for (const [key, value] of iterable) {
    if (value) {
      result.set(key, value);
    }
  }
  return result;
}
