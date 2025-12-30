import type { OrderRanksRepo } from './makeOrderRank';

export type OrderRanksRepoSource = { _uid: string; order_rank: string };

export function createOrderRanksRepo(
  obj: Record<string, OrderRanksRepoSource> | OrderRanksRepoSource[],
): OrderRanksRepo {
  // Handle Record<string, OrderRanksRepoSource>
  return Object.fromEntries(
    Object.values(obj).map(({ _uid, order_rank }) => [_uid, order_rank]),
  );
}
