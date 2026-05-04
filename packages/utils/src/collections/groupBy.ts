import get from 'lodash.get';

/**
 * Groups the elements of an array based on the value of a specified key.
 *
 * @param data - The array to group.
 * @param key - The key to group by. Defaults to "id".
 * @returns An object with the grouped elements.
 *
 * @example
 * ```typescript
 * const users = [
 *   { id: '1', name: 'John' },
 *   { id: '2', name: 'Jane' },
 *   { id: '1', name: 'Joe' },
 * ];
 *
 * const groupedUsers = groupBy(users, 'id');
 * // groupedUsers is {
 * //   '1': [{ id: '1', name: 'John' }, { id: '1', name: 'Joe' }],
 * //   '2': [{ id: '2', name: 'Jane' }],
 * // }
 * ```
 */
export const groupBy = <T>(data: T[], key = 'id'): Record<string, T[]> =>
  data.reduce(
    (grouped, elem) => {
      (grouped[get(elem, key)] ??= []).push(elem);
      return grouped;
    },
    {} as Record<string, T[]>,
  );
