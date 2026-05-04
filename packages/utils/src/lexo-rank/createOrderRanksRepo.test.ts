import { describe, expect, it } from 'vitest';
import type { OrderRanksRepoSource } from './createOrderRanksRepo';
import { createOrderRanksRepo } from './createOrderRanksRepo';
import type { OrderRanksRepo } from './makeOrderRank';

describe('createOrderRanksRepo', () => {
  describe('array input', () => {
    it('should convert single OrderRanksRepoSource array to OrderRanksRepo', () => {
      const sources: OrderRanksRepoSource[] = [
        {
          _uid: 'user123',
          order_rank: 'hhhhhh:',
        },
      ];

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        user123: 'hhhhhh:',
      });
    });

    it('should handle different uid formats in array', () => {
      const testCases: OrderRanksRepoSource[] = [
        { _uid: 'simple', order_rank: 'aaaaaa:' },
        { _uid: 'with-dashes', order_rank: 'bbbbbb:' },
        { _uid: 'with_underscores', order_rank: 'cccccc:' },
        { _uid: 'with123numbers', order_rank: 'dddddd:' },
        { _uid: 'UPPERCASE', order_rank: 'eeeeee:' },
        { _uid: 'MixedCase', order_rank: 'ffffff:' },
      ];

      const result = createOrderRanksRepo(testCases);

      const expected = testCases.reduce(
        (acc, source) => {
          acc[source._uid] = source.order_rank;
          return acc;
        },
        {} as Record<string, string>,
      );

      expect(result).toEqual(expected);
    });

    it('should handle different order_rank formats in array', () => {
      const testCases: OrderRanksRepoSource[] = [
        { _uid: 'test1', order_rank: '000000:' },
        { _uid: 'test2', order_rank: 'zzzzzz:' },
        { _uid: 'test3', order_rank: 'aaaaaa:bbbbbb' },
        { _uid: 'test4', order_rank: 'multi:segment:rank' },
        { _uid: 'test5', order_rank: 'a' },
        { _uid: 'test6', order_rank: '' },
      ];

      const result = createOrderRanksRepo(testCases);

      const expected = testCases.reduce(
        (acc, source) => {
          acc[source._uid] = source.order_rank;
          return acc;
        },
        {} as Record<string, string>,
      );

      expect(result).toEqual(expected);
    });

    it('should handle empty array', () => {
      const sources: OrderRanksRepoSource[] = [];

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({});
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should handle duplicate uids in array with last value winning', () => {
      const sources: OrderRanksRepoSource[] = [
        { _uid: 'duplicate', order_rank: 'first:' },
        { _uid: 'unique', order_rank: 'middle:' },
        { _uid: 'duplicate', order_rank: 'last:' },
      ];

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        duplicate: 'last:',
        unique: 'middle:',
      });
    });
  });

  describe('record input', () => {
    it('should convert record of OrderRanksRepoSource to OrderRanksRepo', () => {
      const sources: Record<string, OrderRanksRepoSource> = {
        item1: { _uid: 'user123', order_rank: 'aaaaaa:' },
        item2: { _uid: 'user456', order_rank: 'hhhhhh:' },
        item3: { _uid: 'user789', order_rank: 'zzzzzz:' },
      };

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        user123: 'aaaaaa:',
        user456: 'hhhhhh:',
        user789: 'zzzzzz:',
      });
    });

    it('should handle large numbers of objects', () => {
      const sources: Record<string, OrderRanksRepoSource> = {};
      const expected: OrderRanksRepo = {};

      // Create 100 test objects
      for (let i = 0; i < 100; i++) {
        const uid = `user${i}`;
        const orderRank = `${i.toString(36).padStart(6, '0')}:`;
        sources[`item${i}`] = { _uid: uid, order_rank: orderRank };
        expected[uid] = orderRank;
      }

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual(expected);
      expect(Object.keys(result)).toHaveLength(100);
    });

    it('should maintain order independence', () => {
      const sources1: Record<string, OrderRanksRepoSource> = {
        a: { _uid: 'user1', order_rank: 'rank1:' },
        b: { _uid: 'user2', order_rank: 'rank2:' },
        c: { _uid: 'user3', order_rank: 'rank3:' },
      };

      const sources2: Record<string, OrderRanksRepoSource> = {
        c: { _uid: 'user3', order_rank: 'rank3:' },
        a: { _uid: 'user1', order_rank: 'rank1:' },
        b: { _uid: 'user2', order_rank: 'rank2:' },
      };

      const result1 = createOrderRanksRepo(sources1);
      const result2 = createOrderRanksRepo(sources2);

      expect(result1).toEqual(result2);
    });

    it('should handle duplicate uids with last value winning', () => {
      const sources: Record<string, OrderRanksRepoSource> = {
        item1: { _uid: 'duplicate', order_rank: 'first:' },
        item2: { _uid: 'unique', order_rank: 'middle:' },
        item3: { _uid: 'duplicate', order_rank: 'last:' },
      };

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        duplicate: 'last:',
        unique: 'middle:',
      });
    });
  });

  describe('empty and edge cases', () => {
    it('should handle empty record', () => {
      const sources: Record<string, OrderRanksRepoSource> = {};

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({});
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should handle record with one empty object', () => {
      const sources: Record<string, OrderRanksRepoSource> = {
        empty: { _uid: '', order_rank: '' },
      };

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        '': '',
      });
    });

    it('should handle array with one empty object', () => {
      const sources: OrderRanksRepoSource[] = [{ _uid: '', order_rank: '' }];

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        '': '',
      });
    });

    it('should handle special characters in uid and order_rank in record', () => {
      const sources: Record<string, OrderRanksRepoSource> = {
        special1: { _uid: 'user@domain.com', order_rank: 'rank:with:colons' },
        special2: { _uid: 'user with spaces', order_rank: 'rank with spaces' },
        special3: {
          _uid: 'user/with/slashes',
          order_rank: 'rank\\with\\backslashes',
        },
        special4: { _uid: 'user"with"quotes', order_rank: "rank'with'quotes" },
        special5: {
          _uid: 'user{with}braces',
          order_rank: 'rank[with]brackets',
        },
      };

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        'user@domain.com': 'rank:with:colons',
        'user with spaces': 'rank with spaces',
        'user/with/slashes': 'rank\\with\\backslashes',
        'user"with"quotes': "rank'with'quotes",
        'user{with}braces': 'rank[with]brackets',
      });
    });

    it('should handle special characters in uid and order_rank in array', () => {
      const sources: OrderRanksRepoSource[] = [
        { _uid: 'user@domain.com', order_rank: 'rank:with:colons' },
        { _uid: 'user with spaces', order_rank: 'rank with spaces' },
        { _uid: 'user/with/slashes', order_rank: 'rank\\with\\backslashes' },
        { _uid: 'user"with"quotes', order_rank: "rank'with'quotes" },
        { _uid: 'user{with}braces', order_rank: 'rank[with]brackets' },
      ];

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        'user@domain.com': 'rank:with:colons',
        'user with spaces': 'rank with spaces',
        'user/with/slashes': 'rank\\with\\backslashes',
        'user"with"quotes': "rank'with'quotes",
        'user{with}braces': 'rank[with]brackets',
      });
    });

    it('should handle unicode characters in record', () => {
      const sources: Record<string, OrderRanksRepoSource> = {
        emoji: { _uid: '👤user🎯', order_rank: '🏆rank⭐' },
        accents: { _uid: 'usér', order_rank: 'ránk' },
        chinese: { _uid: '用户', order_rank: '排名' },
        arabic: { _uid: 'مستخدم', order_rank: 'ترتيب' },
      };

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        '👤user🎯': '🏆rank⭐',
        usér: 'ránk',
        用户: '排名',
        مستخدم: 'ترتيب',
      });
    });

    it('should handle unicode characters in array', () => {
      const sources: OrderRanksRepoSource[] = [
        { _uid: '👤user🎯', order_rank: '🏆rank⭐' },
        { _uid: 'usér', order_rank: 'ránk' },
        { _uid: '用户', order_rank: '排名' },
        { _uid: 'مستخدم', order_rank: 'ترتيب' },
      ];

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        '👤user🎯': '🏆rank⭐',
        usér: 'ránk',
        用户: '排名',
        مستخدم: 'ترتيب',
      });
    });
  });

  describe('type compatibility', () => {
    it('should return object compatible with OrderRanksRepo type from record', () => {
      const sources: Record<string, OrderRanksRepoSource> = {
        test: { _uid: 'testUser', order_rank: 'testRank:' },
      };

      const result = createOrderRanksRepo(sources);

      // Type assertion should work
      const typedResult: OrderRanksRepo = result;
      expect(typedResult).toBeDefined();
      expect(typeof typedResult).toBe('object');
    });

    it('should return object compatible with OrderRanksRepo type from array', () => {
      const sources: OrderRanksRepoSource[] = [
        { _uid: 'testUser', order_rank: 'testRank:' },
      ];

      const result = createOrderRanksRepo(sources);

      // Type assertion should work
      const typedResult: OrderRanksRepo = result;
      expect(typedResult).toBeDefined();
      expect(typeof typedResult).toBe('object');
    });

    it('should work with complex record structures', () => {
      const sources: Record<string, OrderRanksRepoSource> = {
        'complex-key-1': {
          _uid: 'complex_uid_1',
          order_rank: 'complex:rank:1',
        },
        'complex-key-2': {
          _uid: 'complex_uid_2',
          order_rank: 'complex:rank:2',
        },
      };

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        complex_uid_1: 'complex:rank:1',
        complex_uid_2: 'complex:rank:2',
      });
    });

    it('should work with complex array structures', () => {
      const sources: OrderRanksRepoSource[] = [
        {
          _uid: 'complex_uid_1',
          order_rank: 'complex:rank:1',
        },
        {
          _uid: 'complex_uid_2',
          order_rank: 'complex:rank:2',
        },
      ];

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        complex_uid_1: 'complex:rank:1',
        complex_uid_2: 'complex:rank:2',
      });
    });
  });

  describe('integration with makeOrderRank', () => {
    it('should create repo compatible with makeOrderRank function', () => {
      const sources: Record<string, OrderRanksRepoSource> = {
        first: { _uid: 'item1', order_rank: 'aaaaaa:' },
        second: { _uid: 'item2', order_rank: 'hhhhhh:' },
        third: { _uid: 'item3', order_rank: 'zzzzzz:' },
      };

      const repo = createOrderRanksRepo(sources);

      // Verify it has the expected structure for makeOrderRank
      expect(repo).toHaveProperty('item1', 'aaaaaa:');
      expect(repo).toHaveProperty('item2', 'hhhhhh:');
      expect(repo).toHaveProperty('item3', 'zzzzzz:');

      // Verify all values are strings (order ranks)
      Object.values(repo).forEach((orderRank) => {
        expect(typeof orderRank).toBe('string');
      });

      // Verify all keys are strings (uids)
      Object.keys(repo).forEach((uid) => {
        expect(typeof uid).toBe('string');
      });
    });

    it('should handle real-world scenario with mixed data', () => {
      const sources: Record<string, OrderRanksRepoSource> = {
        task1: { _uid: 'task_123', order_rank: '000000:' },
        task2: { _uid: 'task_456', order_rank: 'hhhhhh:' },
        task3: { _uid: 'task_789', order_rank: 'zzzzzz:' },
        user1: { _uid: 'user_abc', order_rank: 'bbbbbb:' },
        user2: { _uid: 'user_def', order_rank: 'mmmmmm:' },
      };

      const repo = createOrderRanksRepo(sources);

      expect(repo).toEqual({
        task_123: '000000:',
        task_456: 'hhhhhh:',
        task_789: 'zzzzzz:',
        user_abc: 'bbbbbb:',
        user_def: 'mmmmmm:',
      });

      // Should be sorted-ready for makeOrderRank
      const entries = Object.entries(repo);
      expect(entries).toHaveLength(5);
      entries.forEach(([uid, orderRank]) => {
        expect(typeof uid).toBe('string');
        expect(typeof orderRank).toBe('string');
      });
    });
  });

  describe('performance and scalability', () => {
    it('should handle large record datasets efficiently', () => {
      const startTime = Date.now();

      const sources: Record<string, OrderRanksRepoSource> = {};
      for (let i = 0; i < 10000; i++) {
        sources[`item${i}`] = {
          _uid: `uid_${i}`,
          order_rank: `rank_${i}:`,
        };
      }

      const result = createOrderRanksRepo(sources);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(Object.keys(result)).toHaveLength(10000);
    });

    it('should handle large array datasets efficiently', () => {
      const startTime = Date.now();

      const sources: OrderRanksRepoSource[] = [];
      for (let i = 0; i < 10000; i++) {
        sources.push({
          _uid: `uid_${i}`,
          order_rank: `rank_${i}:`,
        });
      }

      const result = createOrderRanksRepo(sources);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(Object.keys(result)).toHaveLength(10000);
    });

    it('should not modify original record input', () => {
      const originalSources: Record<string, OrderRanksRepoSource> = {
        test: { _uid: 'original', order_rank: 'original:' },
      };

      const sourcesCopy = JSON.parse(JSON.stringify(originalSources));
      const result = createOrderRanksRepo(originalSources);

      // Modify result
      result.modified = 'modified:';

      // Original should be unchanged
      expect(originalSources).toEqual(sourcesCopy);
    });

    it('should not modify original array input', () => {
      const originalSources: OrderRanksRepoSource[] = [
        { _uid: 'original', order_rank: 'original:' },
      ];

      const sourcesCopy = JSON.parse(JSON.stringify(originalSources));
      const result = createOrderRanksRepo(originalSources);

      // Modify result
      result.modified = 'modified:';

      // Original should be unchanged
      expect(originalSources).toEqual(sourcesCopy);
    });
  });

  describe('error handling and robustness', () => {
    it('should handle record objects with extra properties', () => {
      const sources: Record<string, any> = {
        withExtra: {
          _uid: 'test',
          order_rank: 'test:',
          extraProperty: 'ignored',
          anotherExtra: 123,
        },
      };

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        test: 'test:',
      });
    });

    it('should handle array objects with extra properties', () => {
      const sources: any[] = [
        {
          _uid: 'test',
          order_rank: 'test:',
          extraProperty: 'ignored',
          anotherExtra: 123,
        },
      ];

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        test: 'test:',
      });
    });

    it('should preserve exact string values in record', () => {
      const sources: Record<string, OrderRanksRepoSource> = {
        whitespace: {
          _uid: ' uid with spaces ',
          order_rank: ' rank with spaces ',
        },
        numbers: { _uid: '123', order_rank: '456' },
        mixed: { _uid: 'Uid123', order_rank: 'Rank456:' },
      };

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        ' uid with spaces ': ' rank with spaces ',
        '123': '456',
        Uid123: 'Rank456:',
      });
    });

    it('should preserve exact string values in array', () => {
      const sources: OrderRanksRepoSource[] = [
        { _uid: ' uid with spaces ', order_rank: ' rank with spaces ' },
        { _uid: '123', order_rank: '456' },
        { _uid: 'Uid123', order_rank: 'Rank456:' },
      ];

      const result = createOrderRanksRepo(sources);

      expect(result).toEqual({
        ' uid with spaces ': ' rank with spaces ',
        '123': '456',
        Uid123: 'Rank456:',
      });
    });
  });
});
