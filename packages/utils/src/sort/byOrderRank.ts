import type { ITimestamp } from '../timestamp';

type DocWithOrderRankAndCreatedAt = {
  order_rank: string;
  created_at: ITimestamp | Date | number;
};

/**
 * Sorts an array of objects by `order_rank` first, and then by `created_at` if the `order_rank` is the same.
 *
 * @param a - The first object to compare.
 * @param b - The second object to compare.
 * @returns A number indicating the sort order.
 *
 * @example
 * ```typescript
 * const documents = [
 *   { order_rank: 'b', created_at: new Date('2023-01-01') },
 *   { order_rank: 'a', created_at: new Date('2023-01-02') },
 *   { order_rank: 'a', created_at: new Date('2023-01-01') },
 * ];
 *
 * documents.sort(sortByOrderRank);
 * // documents is now sorted by order_rank, and then by created_at
 * ```
 */
export const sortByOrderRank = (
  a: DocWithOrderRankAndCreatedAt,
  b: DocWithOrderRankAndCreatedAt,
) => {
  if (a.order_rank < b.order_rank) {
    return -1;
  }
  if (a.order_rank > b.order_rank) {
    return 1;
  }

  return +a.created_at - +b.created_at;
};

/**
 * Sorts an array of objects by `order_rank` only.
 *
 * @param a - The first object to compare.
 * @param b - The second object to compare.
 * @returns A number indicating the sort order.
 *
 * @example
 * ```typescript
 * const documents = [
 *   { order_rank: 'b' },
 *   { order_rank: 'a' },
 * ];
 *
 * documents.sort(sortByOrderRankOnly);
 * // documents is now sorted by order_rank
 * ```
 */
export const sortByOrderRankOnly = (
  a: { order_rank: string },
  b: { order_rank: string },
) => {
  if (a.order_rank < b.order_rank) {
    return -1;
  }
  if (a.order_rank > b.order_rank) {
    return 1;
  }
  return 0;
};
