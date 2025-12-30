import type { ITimestamp } from '../timestamp';

type DocWithUpdatedAt = {
  updated_at: ITimestamp | Date;
};

/**
 * Sorts an array of objects by the `updated_at` field in ascending order.
 *
 * @param a - The first object to compare.
 * @param b - The second object to compare.
 * @returns A number indicating the sort order.
 *
 * @example
 * ```typescript
 * const documents = [
 *   { updated_at: new Date('2023-01-02') },
 *   { updated_at: new Date('2023-01-01') },
 * ];
 *
 * documents.sort(sortByUpdatedAt);
 * // documents is now sorted by updated_at in ascending order
 * ```
 */
export const sortByUpdatedAt = (a: DocWithUpdatedAt, b: DocWithUpdatedAt) =>
  +a?.updated_at - +b?.updated_at;
