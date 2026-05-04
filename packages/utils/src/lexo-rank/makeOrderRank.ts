import { $lexoRank } from './instance';

export type OrderRanksRepo = Record<string, string>;

/**
 * Generate Order Rank for item in the list, presented by
 * Object with key as item uid and value as item order rank
 * @param repo - Object with key as item uid and value as item order rank
 * @param prev_uid - uid of previous item in the list
 * @param next_uid - uid of next item in the list
 * @param prev_order_rank - order rank of previous item in the list
 * @param to_start - if true, item will be placed to the start of the list
 */
export function makeOrderRank({
  repo,
  prev_uid,
  next_uid,
  prev_rank,
  to_start = false,
}: {
  repo: OrderRanksRepo;
  prev_uid?: string;
  next_uid?: string;
  prev_rank?: string;
  to_start?: boolean;
}) {
  const ranks = { ...repo };

  if (prev_uid && !ranks[prev_uid] && prev_rank) {
    // Needed when the previous item is not in the list yet
    ranks[prev_uid] = prev_rank;
  }

  const contextRanks = Object.entries(ranks).sort((a, b) => {
    if (a[1] > b[1]) {
      return 1;
    }
    if (a[1] < b[1]) {
      return -1;
    }
    /* c8 ignore next 1 */
    return 0;
  });

  if (contextRanks.length) {
    if (next_uid) {
      // If next item is specified
      const nextRankIndex = contextRanks.findIndex((x) => x[0] === next_uid);

      if (nextRankIndex === -1 || nextRankIndex === 0) {
        // If rank of next item is not found, or it's first
        // - set rank below first
        return $lexoRank.prev(contextRanks[0][1]);
      } else {
        // If rank of next item is found, and it's not first
        // - set rank between previous and next by rank
        return $lexoRank.middle(
          contextRanks[nextRankIndex - 1][1],
          contextRanks[nextRankIndex][1],
        );
      }
    } else if (prev_uid) {
      // If prev item is specified
      const prevRankIndex = contextRanks.findIndex((x) => x[0] === prev_uid);

      if (prevRankIndex === -1 || prevRankIndex === contextRanks.length - 1) {
        // If rank of previous item is not found, or it's last
        // - set rank below first
        return $lexoRank.next(contextRanks[contextRanks.length - 1][1]);
      } else {
        // If rank of previous item is found, and it's not last
        // - set rank between previous and next by rank
        return $lexoRank.middle(
          contextRanks[prevRankIndex][1],
          contextRanks[prevRankIndex + 1][1],
        );
      }
    } else {
      if (to_start) {
        // If nor next nor prev item is specified
        // - set rank to the start
        return $lexoRank.prev(contextRanks[0][1]);
      }
      // If nor next nor prev item is specified
      // - set rank to the end
      return $lexoRank.next(contextRanks[contextRanks.length - 1][1]);
    }
  } else {
    // If its first item in the list
    return $lexoRank.middle();
  }
}
