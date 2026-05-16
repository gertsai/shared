import { deepMerge } from '../utils/helpers';
/**
 * Set operations for collections
 * These operations treat collections as sets and perform set algebra
 */

/**
 * Returns the union of two collections (all unique entries from both)
 */
export function union<K, V>(
  iterable1: Iterable<[K, V]>,
  iterable2: Iterable<[K, V]>,
): Map<K, V> {
  const result = new Map<K, V>();

  // Add all from first
  for (const [key, value] of iterable1) {
    result.set(key, value);
  }

  // Add all from second (overwrites if key exists)
  for (const [key, value] of iterable2) {
    result.set(key, value);
  }

  return result;
}

/**
 * Returns the intersection of two collections (only entries that exist in both)
 */
export function intersection<K, V>(
  iterable1: Iterable<[K, V]>,
  iterable2: Iterable<[K, V]>,
): Map<K, V> {
  const result = new Map<K, V>();
  const map2 = new Map(iterable2);

  for (const [key, value] of iterable1) {
    if (map2.has(key)) {
      result.set(key, value);
    }
  }

  return result;
}

/**
 * Returns the difference of two collections (entries in first but not in second)
 */
export function difference<K, V>(
  iterable1: Iterable<[K, V]>,
  iterable2: Iterable<[K, V]>,
): Map<K, V> {
  const result = new Map<K, V>();
  const map2 = new Map(iterable2);

  for (const [key, value] of iterable1) {
    if (!map2.has(key)) {
      result.set(key, value);
    }
  }

  return result;
}

/**
 * Returns the symmetric difference (entries that exist in either but not both)
 */
export function symmetricDifference<K, V>(
  iterable1: Iterable<[K, V]>,
  iterable2: Iterable<[K, V]>,
): Map<K, V> {
  const map1 = new Map(iterable1);
  const map2 = new Map(iterable2);
  const result = new Map<K, V>();

  // Add entries from first that aren't in second
  for (const [key, value] of map1) {
    if (!map2.has(key)) {
      result.set(key, value);
    }
  }

  // Add entries from second that aren't in first
  for (const [key, value] of map2) {
    if (!map1.has(key)) {
      result.set(key, value);
    }
  }

  return result;
}

/**
 * Checks if first collection is a subset of second
 */
export function isSubset<K, V>(
  iterable1: Iterable<[K, V]>,
  iterable2: Iterable<[K, V]>,
): boolean {
  const map2 = new Map(iterable2);

  for (const [key] of iterable1) {
    if (!map2.has(key)) {
      return false;
    }
  }

  return true;
}

/**
 * Checks if first collection is a superset of second
 */
export function isSuperset<K, V>(
  iterable1: Iterable<[K, V]>,
  iterable2: Iterable<[K, V]>,
): boolean {
  return isSubset(iterable2, iterable1);
}

/**
 * Checks if two collections are disjoint (have no common keys)
 */
export function isDisjoint<K, V>(
  iterable1: Iterable<[K, V]>,
  iterable2: Iterable<[K, V]>,
): boolean {
  const map2 = new Map(iterable2);

  for (const [key] of iterable1) {
    if (map2.has(key)) {
      return false;
    }
  }

  return true;
}

/**
 * Merges multiple collections, with later values overwriting earlier ones
 */
export function merge<K, V>(...iterables: Array<Iterable<[K, V]>>): Map<K, V> {
  const result = new Map<K, V>();

  for (const iterable of iterables) {
    for (const [key, value] of iterable) {
      result.set(key, value);
    }
  }

  return result;
}

/**
 * Merges collections with a custom merge strategy
 */
export function mergeWith<K, V>(
  merger: (existing: V, incoming: V, key: K) => V,
  ...iterables: Array<Iterable<[K, V]>>
): Map<K, V> {
  const result = new Map<K, V>();

  for (const iterable of iterables) {
    for (const [key, value] of iterable) {
      if (result.has(key)) {
        const existing = result.get(key);
        result.set(key, merger(existing as V, value, key));
      } else {
        result.set(key, value);
      }
    }
  }

  return result;
}

/**
 * Deep merges objects in collections
 */
export function mergeDeep<K, V = any>(
  ...iterables: Array<Iterable<[K, V]>>
): Map<K, V> {
  return mergeWith(
    (existing, incoming) => {
      if (
        existing !== null &&
        typeof existing === 'object' &&
        !Array.isArray(existing) &&
        incoming !== null &&
        typeof incoming === 'object' &&
        !Array.isArray(incoming)
      ) {
        // Delegate to helpers.deepMerge for object merging
        return deepMerge(
          existing as Record<string, any>,
          incoming as Record<string, any>,
        ) as V;
      }
      return incoming;
    },
    ...iterables,
  );
}

/**
 * Returns unique values from a collection
 */
export function unique<K, V>(
  iterable: Iterable<[K, V]>,
  keyFn?: (value: V) => unknown,
): Map<K, V> {
  const seen = new Set<unknown>();
  const result = new Map<K, V>();

  for (const [key, value] of iterable) {
    const uniqueKey = keyFn ? keyFn(value) : value;
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      result.set(key, value);
    }
  }

  return result;
}

/**
 * Check if two sets are equal
 */
export function setEquals<K, V>(
  a: Iterable<[K, V]>,
  b: Iterable<[K, V]>,
): boolean {
  const mapA = new Map(a);
  const mapB = new Map(b);

  if (mapA.size !== mapB.size) {
    return false;
  }

  for (const [key] of mapA) {
    if (!mapB.has(key)) {
      return false;
    }
  }

  return true;
}

/**
 * Returns unique values by selector
 */
export function uniqueBy<K, V, S>(
  iterable: Iterable<[K, V]>,
  selector: (value: V) => S,
): Map<K, V> {
  const seen = new Set<S>();
  const result = new Map<K, V>();
  for (const [key, value] of iterable) {
    const selected = selector(value);
    if (!seen.has(selected)) {
      seen.add(selected);
      result.set(key, value);
    }
  }
  return result;
}

/**
 * Returns duplicate entries based on value
 */
export function duplicates<K, V, D = V>(
  iterable: Iterable<[K, V]>,
  keyFn?: (value: V) => D,
): Array<[K, V]> {
  const seen = new Set<D | V>();
  const duplicated = new Set<D | V>();
  const result: Array<[K, V]> = [];

  // First pass: identify duplicates
  for (const [, value] of iterable) {
    const key = keyFn ? keyFn(value) : value;
    if (seen.has(key)) {
      duplicated.add(key);
    } else {
      seen.add(key);
    }
  }

  // Second pass: collect duplicate entries
  for (const [key, value] of iterable) {
    const dupKey = keyFn ? keyFn(value) : value;
    if (duplicated.has(dupKey)) {
      result.push([key, value]);
    }
  }

  return result;
}
