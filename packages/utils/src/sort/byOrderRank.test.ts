import { describe, expect, it } from 'vitest';
import { sortByOrderRank, sortByOrderRankOnly } from './byOrderRank';

describe('sortByOrderRank', () => {
  const a = {
    order_rank: 'a',
    created_at: new Date('2023-01-01T00:00:00.000Z'),
  };
  const b = {
    order_rank: 'b',
    created_at: new Date('2023-01-02T00:00:00.000Z'),
  };
  const c = {
    order_rank: 'a',
    created_at: new Date('2023-01-03T00:00:00.000Z'),
  };

  it('should sort by order_rank first', () => {
    expect(sortByOrderRank(a, b)).toBeLessThan(0);
    expect(sortByOrderRank(b, a)).toBeGreaterThan(0);
  });

  it('should sort by created_at if order_rank is the same', () => {
    expect(sortByOrderRank(a, c)).toBeLessThan(0);
    expect(sortByOrderRank(c, a)).toBeGreaterThan(0);
  });
});

describe('sortByOrderRankOnly', () => {
  const a = { order_rank: 'a' };
  const b = { order_rank: 'b' };

  it('should sort by order_rank only', () => {
    expect(sortByOrderRankOnly(a, b)).toBeLessThan(0);
    expect(sortByOrderRankOnly(b, a)).toBeGreaterThan(0);
    expect(sortByOrderRankOnly(a, a)).toBe(0);
  });
});
