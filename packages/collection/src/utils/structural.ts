/**
 * Utilities for structural comparison and optimization
 * Used to avoid unnecessary copies when data hasn't changed
 *
 * @module utils/structural
 */

import type { ReadableCollection } from '../types/interfaces';

/**
 * Check if two Maps have identical entries
 * Uses Object.is for value comparison
 */
export function mapsEqual<K, V>(map1: Map<K, V>, map2: Map<K, V>): boolean {
  if (map1.size !== map2.size) {
    return false;
  }

  for (const [key, value] of map1) {
    if (!map2.has(key) || !Object.is(map2.get(key), value)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if two iterables produce the same entries in the same order
 * Uses Object.is for value comparison
 */
export function iterablesEqual<K, V>(
  iter1: Iterable<[K, V]>,
  iter2: Iterable<[K, V]>,
): boolean {
  const arr1 = Array.from(iter1);
  const arr2 = Array.from(iter2);

  if (arr1.length !== arr2.length) {
    return false;
  }

  return arr1.every((entry1, i) => {
    const entry2 = arr2[i];
    return Object.is(entry1[0], entry2[0]) && Object.is(entry1[1], entry2[1]);
  });
}

/**
 * Check if a Map would change after applying a transformation
 * Returns true if the result would be different
 */
export function wouldTransformChange<K, V, R>(
  source: Map<K, V>,
  transformer: (value: V, key: K) => R,
): boolean {
  for (const [key, value] of source) {
    const transformed = transformer(value, key);
    if (!Object.is(value, transformed)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if filtering would remove any entries
 * Returns true if any entries would be removed
 */
export function wouldFilterChange<K, V>(
  source: Map<K, V>,
  predicate: (value: V, key: K) => boolean,
): boolean {
  for (const [key, value] of source) {
    if (!predicate(value, key)) {
      return true;
    }
  }
  return false;
}

/**
 * Optimized set operation that returns original if no change
 * Used for union, intersection, difference operations
 */
export function optimizedSetOp<K, V>(
  original: Map<K, V>,
  result: Map<K, V>,
  returnOriginal: boolean = true,
): Map<K, V> {
  if (returnOriginal && mapsEqual(original, result)) {
    return original;
  }
  return result;
}

/**
 * Check if two collections have the same content
 * Ignores the collection type, only compares entries
 */
export function collectionsEqual<K, V>(
  coll1: ReadableCollection<K, V>,
  coll2: ReadableCollection<K, V>,
): boolean {
  if (coll1.size !== coll2.size) {
    return false;
  }

  for (const [key, value] of coll1.entries()) {
    if (!coll2.has(key) || !Object.is(coll2.get(key), value)) {
      return false;
    }
  }

  return true;
}

/**
 * Create a hash code for a Map
 * Used for memoization and caching
 */
export function mapHashCode<K, V>(map: Map<K, V>): number {
  let hash = 0;
  let i = 0;

  for (const [key, value] of map) {
    // Simple hash combining
    const keyHash = hashValue(key);
    const valueHash = hashValue(value);
    hash = (hash * 31 + keyHash + valueHash * 37 + i++) | 0;
  }

  return hash;
}

/**
 * Hash a single value
 * Handles primitives and objects
 */
function hashValue(value: unknown): number {
  if (value === null) {
    return 0;
  }
  if (value === undefined) {
    return 1;
  }

  switch (typeof value) {
    case 'boolean':
      return value ? 2 : 3;
    case 'number':
      return value | 0;
    case 'string':
      return stringHashCode(value);
    case 'symbol':
      return stringHashCode(value.toString());
    case 'bigint':
      return Number(BigInt.asIntN(32, value));
    case 'object':
      // For objects, use a weak hash based on properties count
      if (Array.isArray(value)) {
        return value.length * 17;
      }
      if (value instanceof Map) {
        return value.size * 19;
      }
      if (value instanceof Set) {
        return value.size * 23;
      }
      return Object.keys(value).length * 29;
    default:
      return 0;
  }
}

/**
 * Simple string hash code
 */
function stringHashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Check if a transformation would produce different keys
 */
export function wouldKeyTransformChange<K, V, NK>(
  source: Map<K, V>,
  transformer: (key: K, value: V) => NK,
): boolean {
  const newKeys = new Set<NK>();

  for (const [key, value] of source) {
    const newKey = transformer(key, value);

    // Check for key collision
    if (newKeys.has(newKey)) {
      return true; // Keys would collide, definitely changes
    }
    newKeys.add(newKey);

    // Check if key actually changed
    if (!Object.is(key, newKey)) {
      return true;
    }
  }

  return false;
}

/**
 * Batch check multiple conditions for optimization
 * Returns true if ANY condition would cause a change
 */
export function wouldAnyChange(...checks: (() => boolean)[]): boolean {
  return checks.some((check) => check());
}

/**
 * Structural comparison options
 */
export interface CompareOptions {
  /** Use deep equality for object values */
  deep?: boolean;
  /** Custom equality function */
  equals?: (a: unknown, b: unknown) => boolean;
  /** Skip certain keys from comparison */
  skip?: Set<unknown>;
}

/**
 * Advanced structural comparison with options
 */
export function structuralCompare<K, V>(
  map1: Map<K, V>,
  map2: Map<K, V>,
  options: CompareOptions = {},
): boolean {
  const { deep = false, equals = Object.is, skip = new Set() } = options;

  // Count non-skipped keys
  let effectiveSize1 = 0;
  let effectiveSize2 = 0;

  for (const key of map1.keys()) {
    if (!skip.has(key)) {
      effectiveSize1++;
    }
  }

  for (const key of map2.keys()) {
    if (!skip.has(key)) {
      effectiveSize2++;
    }
  }

  if (effectiveSize1 !== effectiveSize2) {
    return false;
  }

  for (const [key, value1] of map1) {
    if (skip.has(key)) {
      continue;
    }

    if (!map2.has(key)) {
      return false;
    }

    const value2 = map2.get(key);

    if (deep && typeof value1 === 'object' && typeof value2 === 'object') {
      if (!deepEqual(value1, value2)) {
        return false;
      }
    } else if (!equals(value1, value2)) {
      return false;
    }
  }

  return true;
}

/**
 * Simple deep equality check
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  if (a === null || b === null) {
    return false;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!keysB.includes(key)) {
      return false;
    }
    const va = (a as Record<string, unknown>)[key];
    const vb = (b as Record<string, unknown>)[key];
    if (!deepEqual(va, vb)) {
      return false;
    }
  }

  return true;
}
