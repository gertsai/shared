/**
 * Converts an array of objects to an object, using a specified key as the keys of the new object.
 *
 * @param data - The array to convert.
 * @param key - The key to use for the new object's keys. Defaults to "id".
 * @param defaults - A function that returns an object with default values to merge with each element.
 * @returns An object with the converted data.
 *
 * @example
 * ```typescript
 * const users = [
 *   { id: '1', name: 'John' },
 *   { id: '2', name: 'Jane' },
 * ];
 *
 * const usersObject = arrayToObject(users, 'id');
 * // usersObject is {
 * //   '1': { id: '1', name: 'John' },
 * //   '2': { id: '2', name: 'Jane' },
 * // }
 * ```
 */
export const arrayToObject = <T>(
  data: T[],
  key = 'id',
  defaults = () => ({}),
): Record<string, T> =>
  data.reduce(
    // @ts-expect-error - TS doesn't understand that obj[elem[key]] is a valid assignment
    (obj, elem) => ((obj[elem[key]] = { ...elem, ...defaults() }), obj),
    {},
  );
