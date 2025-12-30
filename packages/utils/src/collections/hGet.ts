/**
 * Gets the first element of an array.
 *
 * @param array - The array to query.
 * @returns The first element of the array, or `undefined` if the array is empty or null.
 *
 * @example
 * ```typescript
 * const array = [1, 2, 3];
 * const firstElement = hGetFirst(array);
 * // firstElement is 1
 * ```
 */
export function hGetFirst<T>(array: T[]): T | undefined {
  return array != null && array.length > 0 ? array[0] : undefined;
}

/**
 * Gets the last element of an array.
 *
 * @param array - The array to query.
 * @returns The last element of the array, or `undefined` if the array is empty or null.
 *
 * @example
 * ```typescript
 * const array = [1, 2, 3];
 * const lastElement = hGetLast(array);
 * // lastElement is 3
 * ```
 */
export function hGetLast<T>(array: T[]): T | undefined {
  const length = array == null ? 0 : array.length;
  return length ? array[length - 1] : undefined;
}
