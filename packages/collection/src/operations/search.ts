/**
 * Modular search operations
 * This module demonstrates the shape of pure operations used by collections.
 */

/**
 * Finds the first element that satisfies the predicate
 * @param iterable - Source iterable to search in
 * @param predicate - Function to test each element
 * @returns The first matching element or undefined
 */
export function find<K, V>(
  iterable: Iterable<[K, V]>,
  predicate: (value: V, key: K, index: number) => boolean,
): V | undefined {
  let index = 0;
  for (const [key, value] of iterable) {
    if (predicate(value, key, index++)) {
      return value;
    }
  }
  return undefined;
}

/**
 * Finds the key of the first element that satisfies the predicate
 */
export function findKey<K, V>(
  iterable: Iterable<[K, V]>,
  predicate: (value: V, key: K, index: number) => boolean,
): K | undefined {
  let index = 0;
  for (const [key, value] of iterable) {
    if (predicate(value, key, index++)) {
      return key;
    }
  }
  return undefined;
}

/**
 * Finds the last element that satisfies the predicate
 */
export function findLast<K, V>(
  iterable: Iterable<[K, V]>,
  predicate: (value: V, key: K, index: number) => boolean,
): V | undefined {
  let result: V | undefined;
  let index = 0;
  for (const [key, value] of iterable) {
    if (predicate(value, key, index++)) {
      result = value;
    }
  }
  return result;
}

/**
 * Find first entry matching predicate
 */
export function findEntry<K, V>(
  iterable: Iterable<[K, V]>,
  predicate: (value: V, key: K, index: number) => boolean,
): [K, V] | undefined {
  let index = 0;
  for (const entry of iterable) {
    const [key, value] = entry;
    if (predicate(value, key, index++)) {
      return entry;
    }
  }
  return undefined;
}

/**
 * Find last key matching predicate
 */
export function findLastKey<K, V>(
  iterable: Iterable<[K, V]>,
  predicate: (value: V, key: K, index: number) => boolean,
): K | undefined {
  let lastKey: K | undefined;
  let index = 0;
  for (const [key, value] of iterable) {
    if (predicate(value, key, index++)) {
      lastKey = key;
    }
  }
  return lastKey;
}

/**
 * Check if collection includes a value
 */
export function includes<K, V>(
  iterable: Iterable<[K, V]>,
  searchValue: V,
): boolean {
  for (const [, value] of iterable) {
    if (Object.is(value, searchValue)) {
      return true;
    }
  }
  return false;
}

/**
 * Filters entries based on predicate
 * @returns Array of entries that match the predicate
 */
export function filter<K, V>(
  iterable: Iterable<[K, V]>,
  predicate: (value: V, key: K, index: number) => boolean,
): Array<[K, V]> {
  const result: Array<[K, V]> = [];
  let index = 0;
  for (const [key, value] of iterable) {
    if (predicate(value, key, index++)) {
      result.push([key, value]);
    }
  }
  return result;
}

/**
 * Lazy filter over entries
 */
export function* filterIter<K, V>(
  iterable: Iterable<[K, V]>,
  predicate: (value: V, key: K, index: number) => boolean,
): Generator<[K, V]> {
  let index = 0;
  for (const [key, value] of iterable) {
    if (predicate(value, key, index++)) {
      yield [key, value];
    }
  }
}

/**
 * Checks if any element satisfies the predicate
 */
export function some<K, V>(
  iterable: Iterable<[K, V]>,
  predicate: (value: V, key: K, index: number) => boolean,
): boolean {
  let index = 0;
  for (const [key, value] of iterable) {
    if (predicate(value, key, index++)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if all elements satisfy the predicate
 */
export function every<K, V>(
  iterable: Iterable<[K, V]>,
  predicate: (value: V, key: K, index: number) => boolean,
): boolean {
  let index = 0;
  for (const [key, value] of iterable) {
    if (!predicate(value, key, index++)) {
      return false;
    }
  }
  return true;
}

/**
 * Takes first n elements
 */
export function* take<K, V>(
  iterable: Iterable<[K, V]>,
  n: number,
): Generator<[K, V]> {
  if (n <= 0) {
    return;
  }

  let count = 0;
  for (const entry of iterable) {
    if (count >= n) {
      break;
    }
    yield entry;
    count++;
  }
}

/**
 * Skips first n elements
 */
export function* skip<K, V>(
  iterable: Iterable<[K, V]>,
  n: number,
): Generator<[K, V]> {
  let count = 0;
  for (const entry of iterable) {
    if (count >= n) {
      yield entry;
    }
    count++;
  }
}

/**
 * Example of how these operations would be used in a Collection class:
 */
export class ExampleCollection<K, V> {
  private data: Map<K, V>;

  constructor(entries?: Iterable<[K, V]>) {
    this.data = new Map(entries);
  }

  // Clean, simple delegation to modular operations
  find(predicate: (v: V, k: K, i: number) => boolean): V | undefined {
    return find(this.data, predicate);
  }

  filter(
    predicate: (v: V, k: K, i: number) => boolean,
  ): ExampleCollection<K, V> {
    const entries = filter(this.data, predicate);
    return new ExampleCollection(entries);
  }

  some(predicate: (v: V, k: K, i: number) => boolean): boolean {
    return some(this.data, predicate);
  }

  every(predicate: (v: V, k: K, i: number) => boolean): boolean {
    return every(this.data, predicate);
  }

  take(n: number): ExampleCollection<K, V> {
    return new ExampleCollection(take(this.data, n));
  }

  skip(n: number): ExampleCollection<K, V> {
    return new ExampleCollection(skip(this.data, n));
  }
}
