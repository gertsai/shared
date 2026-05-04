import { SortDirection, sortFactor } from '../types';

type ObjectWithNames = {
  full_name?: string;
  first_name?: string;
};

/**
 * Sorts an array of objects by name.
 * The function first tries to sort by `full_name`, and if that is not available, it falls back to `first_name`.
 *
 * @param a - The first object to compare.
 * @param b - The second object to compare.
 * @param type - The sort direction. Defaults to ascending.
 * @returns A number indicating the sort order.
 *
 * @example
 * ```typescript
 * const users = [
 *   { first_name: 'John', full_name: 'John Doe' },
 *   { first_name: 'Jane', full_name: 'Jane Doe' },
 *   { first_name: 'Alex' },
 * ];
 *
 * users.sort(sortByName);
 * // users is now sorted by name in ascending order
 *
 * users.sort((a, b) => sortByName(a, b, SortDirection.DESC));
 * // users is now sorted by name in descending order
 * ```
 */
export const sortByName = (
  a: ObjectWithNames,
  b: ObjectWithNames,
  type: SortDirection = SortDirection.DEFAULT,
) => {
  const a1 = a?.full_name?.toLowerCase() || a?.first_name?.toLowerCase() || '';
  const b1 = b?.full_name?.toLowerCase() || b?.first_name?.toLowerCase() || '';

  return a1 > b1 ? sortFactor[type] : a1 === b1 ? 0 : -sortFactor[type];
};
