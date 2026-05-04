import type { ITimestamp } from '../timestamp';

type DocWithCreatedAt = {
  created_at: ITimestamp | Date;
};

/**
 * Sorts an array of objects by the `created_at` field in ascending order.
 *
 * @param a - The first object to compare.
 * @param b - The second object to compare.
 * @returns A number indicating the sort order.
 *
 * @example
 * ```typescript
 * const documents = [
 *   { created_at: new Date('2023-01-02') },
 *   { created_at: new Date('2023-01-01') },
 * ];
 *
 * documents.sort(sortByCreatedAt);
 * // documents is now sorted by created_at in ascending order
 * ```
 */
export const sortByCreatedAt = (a: DocWithCreatedAt, b: DocWithCreatedAt) =>
  +a?.created_at - +b?.created_at;
