/**
 * Aggregation operations for collections
 * These are pure functions that work with any Iterable
 * Note: Heavy operations like groupBy can be memoized externally using utils/memoize
 */

/**
 * Reduces a collection to a single value
 *
 * @param iterable - The collection to reduce
 * @param reducer - Function that accumulates values
 * @param initialValue - Initial value for the accumulator
 * @returns The final reduced value
 *
 * @example
 * ```typescript
 * const sum = reduce(collection, (acc, value) => acc + value, 0);
 * const concatenated = reduce(entries, (acc, v, k) => acc + k + v, '');
 * ```
 */
export function reduce<K, V, R>(
  iterable: Iterable<[K, V]>,
  reducer: (accumulator: R, value: V, key: K, index: number) => R,
  initialValue: R,
): R;
export function reduce<K, V>(
  iterable: Iterable<[K, V]>,
  reducer: (accumulator: V, value: V, key: K, index: number) => V,
): V;
export function reduce<K, V, R>(
  iterable: Iterable<[K, V]>,
  reducer: (accumulator: R | V, value: V, key: K, index: number) => R | V,
  initialValue?: R,
): R | V {
  const iterator = iterable[Symbol.iterator]();
  let index = 0;

  if (arguments.length < 3) {
    // No initial value provided
    const first = iterator.next();
    if (first.done) {
      throw new TypeError('Reduce of empty iterable with no initial value');
    }
    const firstValue = first.value[1] as V;
    let accumulator = firstValue;

    // Start from second element
    for (const [key, value] of { [Symbol.iterator]: () => iterator }) {
      accumulator = (reducer as (acc: V, val: V, k: K, i: number) => V)(
        accumulator,
        value,
        key,
        ++index,
      );
    }
    return accumulator;
  } else {
    let accumulator = initialValue as R;
    for (const [key, value] of iterable) {
      accumulator = (reducer as (acc: R, val: V, k: K, i: number) => R)(
        accumulator,
        value,
        key,
        index++,
      );
    }
    return accumulator;
  }
}

/**
 * Groups entries by a key selector function
 */
export function groupBy<K, V, G>(
  iterable: Iterable<[K, V]>,
  keySelector: (value: V, key: K) => G,
): Map<G, Array<[K, V]>> {
  const groups = new Map<G, Array<[K, V]>>();

  for (const [key, value] of iterable) {
    const groupKey = keySelector(value, key);
    let bucket = groups.get(groupKey);
    if (!bucket) {
      bucket = [];
      groups.set(groupKey, bucket);
    }
    bucket.push([key, value]);
  }

  return groups;
}

/**
 * Groups values by a key selector function (returns only values)
 */
export function groupByValues<K, V, G>(
  iterable: Iterable<[K, V]>,
  keySelector: (value: V, key: K) => G,
): Map<G, V[]> {
  const groups = new Map<G, V[]>();

  for (const [key, value] of iterable) {
    const groupKey = keySelector(value, key);
    let bucket = groups.get(groupKey);
    if (!bucket) {
      bucket = [];
      groups.set(groupKey, bucket);
    }
    bucket.push(value);
  }

  return groups;
}

/**
 * Counts elements that match a predicate
 */
export function count<K, V>(
  iterable: Iterable<[K, V]>,
  predicate?: (value: V, key: K, index: number) => boolean,
): number {
  let count = 0;
  let index = 0;

  if (!predicate) {
    // Count all elements
    for (const _item of iterable) {
      void _item; // Used for iteration count
      count++;
    }
  } else {
    // Count matching elements
    for (const [key, value] of iterable) {
      if (predicate(value, key, index++)) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Calculates the sum of numeric values
 */
export function sum<K>(
  iterable: Iterable<[K, number]>,
  selector?: (value: number, key: K) => number,
): number {
  let total = 0;

  if (!selector) {
    for (const [, value] of iterable) {
      total += value;
    }
  } else {
    for (const [key, value] of iterable) {
      total += selector(value, key);
    }
  }

  return total;
}

/**
 * Calculates the average of numeric values
 */
export function average<K>(
  iterable: Iterable<[K, number]>,
  selector?: (value: number, key: K) => number,
): number {
  let total = 0;
  let count = 0;

  if (!selector) {
    for (const [, value] of iterable) {
      total += value;
      count++;
    }
  } else {
    for (const [key, value] of iterable) {
      total += selector(value, key);
      count++;
    }
  }

  return count === 0 ? NaN : total / count;
}

/**
 * Finds the minimum value
 */
export function min<K>(iterable: Iterable<[K, number]>): number;
export function min<K, V>(
  iterable: Iterable<[K, V]>,
  compareFn: (a: V, b: V) => number,
): V | undefined;
export function min<K, V>(
  iterable: Iterable<[K, V | number]>,
  compareFn?: (a: V | number, b: V | number) => number,
): V | number | undefined {
  // With compareFn
  if (compareFn) {
    let minValue: V | undefined;
    for (const [, value] of iterable as Iterable<[K, V]>) {
      if (minValue === undefined) {
        minValue = value;
      } else if (compareFn(value, minValue) < 0) {
        minValue = value;
      }
    }
    return minValue;
  }

  // Without compareFn - handle numbers and strings only
  let minValue: V | number | undefined;
  let hasValues = false;

  for (const [, value] of iterable) {
    if (!hasValues) {
      minValue = value;
      hasValues = true;
    } else if (minValue !== undefined) {
      if (typeof value === 'number' && typeof minValue === 'number') {
        minValue = Math.min(minValue, value);
      } else if (typeof value === 'string' && typeof minValue === 'string') {
        minValue = value < minValue ? value : minValue;
      }
    }
  }

  // Return Infinity for empty number collections
  if (!hasValues) {
    return Infinity;
  }

  return minValue;
}

/**
 * Finds the maximum value
 */
export function max<K>(iterable: Iterable<[K, number]>): number;
export function max<K, V>(
  iterable: Iterable<[K, V]>,
  compareFn: (a: V, b: V) => number,
): V | undefined;
export function max<K, V>(
  iterable: Iterable<[K, V | number]>,
  compareFn?: (a: V | number, b: V | number) => number,
): V | number | undefined {
  // With compareFn
  if (compareFn) {
    let maxValue: V | undefined;
    for (const [, value] of iterable as Iterable<[K, V]>) {
      if (maxValue === undefined) {
        maxValue = value;
      } else if (compareFn(value, maxValue) > 0) {
        maxValue = value;
      }
    }
    return maxValue;
  }

  // Without compareFn - handle numbers and strings only
  let maxValue: V | number | undefined;
  let hasValues = false;

  for (const [, value] of iterable) {
    if (!hasValues) {
      maxValue = value;
      hasValues = true;
    } else if (maxValue !== undefined) {
      if (typeof value === 'number' && typeof maxValue === 'number') {
        maxValue = Math.max(maxValue, value);
      } else if (typeof value === 'string' && typeof maxValue === 'string') {
        maxValue = value > maxValue ? value : maxValue;
      }
    }
  }

  // Return -Infinity for empty number collections
  if (!hasValues) {
    return -Infinity;
  }

  return maxValue;
}

/**
 * Finds min and max in one pass
 */
export function minMax<K, V>(
  iterable: Iterable<[K, V]>,
  compareFn?: (a: V, b: V) => number,
): [V | undefined, V | undefined] {
  let minValue: V | undefined;
  let maxValue: V | undefined;

  for (const [, value] of iterable) {
    if (minValue === undefined) {
      minValue = value;
      maxValue = value;
    } else if (compareFn) {
      if (compareFn(value, minValue) < 0) {
        minValue = value;
      }
      if (maxValue === undefined || compareFn(value, maxValue) > 0) {
        maxValue = value;
      }
    } else {
      if (
        (typeof value === 'number' &&
          typeof minValue === 'number' &&
          value < minValue) ||
        (typeof value === 'string' &&
          typeof minValue === 'string' &&
          value < minValue)
      ) {
        minValue = value;
      }
      if (
        maxValue !== undefined &&
        ((typeof value === 'number' &&
          typeof maxValue === 'number' &&
          value > maxValue) ||
          (typeof value === 'string' &&
            typeof maxValue === 'string' &&
            value > maxValue))
      ) {
        maxValue = value;
      }
    }
  }

  return [minValue, maxValue];
}

/**
 * Partitions entries into groups of true/false based on predicate
 */
export function partition<K, V>(
  iterable: Iterable<[K, V]>,
  predicate: (value: V, key: K, index: number) => boolean,
): [Array<[K, V]>, Array<[K, V]>] {
  const truthy: Array<[K, V]> = [];
  const falsy: Array<[K, V]> = [];
  let index = 0;

  for (const [key, value] of iterable) {
    if (predicate(value, key, index++)) {
      truthy.push([key, value]);
    } else {
      falsy.push([key, value]);
    }
  }

  return [truthy, falsy];
}

/**
 * Creates a frequency map of values
 */
export function frequencies<K, V, F = V>(
  iterable: Iterable<[K, V]>,
  keyFn?: (value: V) => F,
): Map<F | V, number> {
  const freqs = new Map<F | V, number>();

  for (const [, value] of iterable) {
    const key: F | V = keyFn ? keyFn(value) : value;
    freqs.set(key, (freqs.get(key) ?? 0) + 1);
  }

  return freqs;
}

/**
 * Checks if collection is empty
 */
export function isEmpty<K, V>(iterable: Iterable<[K, V]>): boolean {
  for (const _ of iterable) {
    return false;
  }
  return true;
}

/**
 * Gets the first entry
 */
export function first<K, V>(iterable: Iterable<[K, V]>): [K, V] | undefined {
  for (const entry of iterable) {
    return entry;
  }
  return undefined;
}

/**
 * Gets the last entry
 */
export function last<K, V>(iterable: Iterable<[K, V]>): [K, V] | undefined {
  let lastEntry: [K, V] | undefined;
  for (const entry of iterable) {
    lastEntry = entry;
  }
  return lastEntry;
}

/**
 * Find median value
 */
export function median<K>(iterable: Iterable<[K, number]>): number {
  const values = Array.from(iterable)
    .map(([, v]) => v)
    .toSorted((a, b) => a - b);
  if (values.length === 0) {
    return NaN;
  }
  const mid = Math.floor(values.length / 2);
  // bounds guaranteed: values.length > 0 ⇒ 0 ≤ mid < values.length and mid-1 ≥ 0 when length ≥ 2
  return values.length % 2 !== 0
    ? values[mid]!
    : (values[mid - 1]! + values[mid]!) / 2;
}

/**
 * Find mode (most common value)
 */
export function mode<K, V>(iterable: Iterable<[K, V]>): V | undefined {
  const freqMap = new Map<V, number>();
  for (const [, value] of iterable) {
    freqMap.set(value, (freqMap.get(value) || 0) + 1);
  }

  let maxCount = 0;
  let modeValue: V | undefined;

  for (const [value, count] of freqMap) {
    if (count > maxCount) {
      maxCount = count;
      modeValue = value;
    }
  }

  return modeValue;
}

/**
 * Get frequency map of values
 */
export function frequency<K, V>(iterable: Iterable<[K, V]>): Map<V, number> {
  const freqMap = new Map<V, number>();
  for (const [, value] of iterable) {
    freqMap.set(value, (freqMap.get(value) || 0) + 1);
  }
  return freqMap;
}

/**
 * Get entry with minimum value
 */
export function minEntry<K, V>(iterable: Iterable<[K, V]>): [K, V] | undefined {
  let minEntry: [K, V] | undefined;
  let minVal: V | undefined;

  for (const entry of iterable) {
    const [, value] = entry;
    if (minVal === undefined) {
      minVal = value;
      minEntry = entry;
    } else if (
      (typeof value === 'number' &&
        typeof minVal === 'number' &&
        value < minVal) ||
      (typeof value === 'string' &&
        typeof minVal === 'string' &&
        value < minVal)
    ) {
      minVal = value;
      minEntry = entry;
    }
  }

  return minEntry;
}

/**
 * Get entry with maximum value
 */
export function maxEntry<K, V>(iterable: Iterable<[K, V]>): [K, V] | undefined {
  let maxEntry: [K, V] | undefined;
  let maxVal: V | undefined;

  for (const entry of iterable) {
    const [, value] = entry;
    if (maxVal === undefined) {
      maxVal = value;
      maxEntry = entry;
    } else if (
      (typeof value === 'number' &&
        typeof maxVal === 'number' &&
        value > maxVal) ||
      (typeof value === 'string' &&
        typeof maxVal === 'string' &&
        value > maxVal)
    ) {
      maxVal = value;
      maxEntry = entry;
    }
  }

  return maxEntry;
}
