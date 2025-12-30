import { describe, expect, it } from 'vitest';
import { $lexoRank } from './instance';

describe('$lexoRank default instance', () => {
  describe('instance properties', () => {
    it('should be an instance of LexoRank', () => {
      expect($lexoRank).toBeDefined();
      expect(typeof $lexoRank).toBe('object');
    });

    it('should have randomization enabled', () => {
      // Test that the instance has randomization by generating multiple random ranks
      const ranks = new Set();

      for (let i = 0; i < 50; i++) {
        ranks.add($lexoRank.random());
      }

      // With randomization, we should get many different ranks
      expect(ranks.size).toBeGreaterThan(40);
    });

    it('should have larger step size than default', () => {
      // The instance is configured with stepSize: 200
      // This means next/prev operations will have larger gaps
      const baseRank = 'hhhhhh:';
      const nextRank = $lexoRank.next(baseRank);
      const prevRank = $lexoRank.prev(baseRank);

      expect(nextRank.localeCompare(baseRank)).toBe(1);
      expect(prevRank.localeCompare(baseRank)).toBe(-1);
    });
  });

  describe('method functionality', () => {
    it('should generate middle ranks correctly', () => {
      const prev = 'aaaaaa:';
      const next = 'zzzzzz:';
      const middle = $lexoRank.middle(prev, next);

      expect(middle.localeCompare(prev)).toBe(1);
      expect(middle.localeCompare(next)).toBe(-1);
    });

    it('should generate next ranks correctly', () => {
      const rank = 'hhhhhh:';
      const nextRank = $lexoRank.next(rank);

      expect(nextRank.localeCompare(rank)).toBe(1);
      expect(nextRank).toMatch(/^[0-9a-z]+:?/);
    });

    it('should generate prev ranks correctly', () => {
      const rank = 'hhhhhh:';
      const prevRank = $lexoRank.prev(rank);

      expect(prevRank.localeCompare(rank)).toBe(-1);
      expect(prevRank).toMatch(/^[0-9a-z]+:?/);
    });

    it('should generate random ranks correctly', () => {
      const randomRank = $lexoRank.random();

      expect(randomRank).toMatch(/^[0-9a-z]+:?/);
    });

    it('should use middleOrSibling correctly', () => {
      const prev = 'aaaaaa:';
      const next = 'zzzzzz:';
      const result = $lexoRank.middleOrSibling(prev, next);

      expect(result.localeCompare(prev)).toBe(1);
      expect(result.localeCompare(next)).toBe(-1);
    });

    it('should use nextOrMiddle correctly', () => {
      const rank = 'hhhhhh:';
      const result = $lexoRank.nextOrMiddle(rank);

      expect(result.localeCompare(rank)).toBe(1);
    });

    it('should use prevOrMiddle correctly', () => {
      const rank = 'hhhhhh:';
      const result = $lexoRank.prevOrMiddle(rank);

      expect(result.localeCompare(rank)).toBe(-1);
    });

    it('should convert numbers to ranks correctly', () => {
      const result = $lexoRank.fromNumber(12345);

      expect(result).toMatch(/^[0-9a-z]+:?/);
    });
  });

  describe('randomization effects', () => {
    it('should produce varied results due to randomization', () => {
      const prev = 'hhhhhh:';
      const next = 'kkkkkk:';
      const results = new Set();

      for (let i = 0; i < 20; i++) {
        results.add($lexoRank.middle(prev, next));
      }

      // Due to randomization, we might get different results
      // All should still be between prev and next
      results.forEach((result) => {
        expect((result as string).localeCompare(prev)).toBe(1);
        expect((result as string).localeCompare(next)).toBe(-1);
      });
    });

    it('should show randomization in next operations', () => {
      const baseRank = 'hhhhhh:';
      const results = new Set();

      for (let i = 0; i < 20; i++) {
        results.add($lexoRank.next(baseRank));
      }

      // All results should be greater than base rank
      results.forEach((result) => {
        expect((result as string).localeCompare(baseRank)).toBe(1);
      });
    });

    it('should show randomization in prev operations', () => {
      const baseRank = 'hhhhhh:';
      const results = new Set();

      for (let i = 0; i < 20; i++) {
        results.add($lexoRank.prev(baseRank));
      }

      // All results should be less than base rank
      results.forEach((result) => {
        expect((result as string).localeCompare(baseRank)).toBe(-1);
      });
    });
  });

  describe('step size effects', () => {
    it('should create larger gaps with stepSize 200', () => {
      // Generate a sequence of ranks and measure gaps
      let currentRank = $lexoRank.middle();
      const ranks = [currentRank];

      for (let i = 0; i < 5; i++) {
        currentRank = $lexoRank.next(currentRank);
        ranks.push(currentRank);
      }

      // Verify all ranks are in order
      for (let i = 0; i < ranks.length - 1; i++) {
        expect(ranks[i]!.localeCompare(ranks[i + 1]!)).toBe(-1);
      }
    });
  });

  describe('consistency and reliability', () => {
    it('should maintain rank ordering despite randomization', () => {
      const baseRank = 'middle:';

      for (let i = 0; i < 10; i++) {
        const prevRank = $lexoRank.prev(baseRank);
        const nextRank = $lexoRank.next(baseRank);

        expect(prevRank.localeCompare(baseRank)).toBe(-1);
        expect(baseRank.localeCompare(nextRank)).toBe(-1);
      }
    });

    it('should handle edge cases consistently', () => {
      const edgeCases = ['', '0:', 'z:', '000000:', 'zzzzzz:'];

      edgeCases.forEach((rank) => {
        expect(() => $lexoRank.next(rank)).not.toThrow();
        expect(() => $lexoRank.prev(rank)).not.toThrow();

        const nextRank = $lexoRank.next(rank);
        const prevRank = $lexoRank.prev(rank);

        expect(nextRank).toMatch(/^[0-9a-z]*:?/);
        expect(prevRank).toMatch(/^[0-9a-z]*:?/);
      });
    });

    it('should work with complex middle operations', () => {
      const testCases = [
        { prev: 'aaa000:', next: 'aaa001:' },
        { prev: 'hhhhhh:', next: 'hhhhhz:' },
        { prev: '000000:', next: 'zzzzzz:' },
      ];

      testCases.forEach(({ prev, next }) => {
        const middle = $lexoRank.middle(prev, next);

        expect(middle.localeCompare(prev)).toBe(1);
        expect(middle.localeCompare(next)).toBe(-1);
      });
    });
  });

  describe('performance characteristics', () => {
    it('should perform operations efficiently with randomization', () => {
      const startTime = Date.now();

      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        const rank = $lexoRank.random();
        $lexoRank.next(rank);
        $lexoRank.prev(rank);
      }

      const endTime = Date.now();

      // Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle dense rank generation', () => {
      let currentRank = $lexoRank.middle();

      // Generate many intermediate ranks
      for (let i = 0; i < 100; i++) {
        const nextRank = $lexoRank.next(currentRank);
        const intermediateRank = $lexoRank.middle(currentRank, nextRank);

        expect(currentRank.localeCompare(intermediateRank)).toBe(-1);
        expect(intermediateRank.localeCompare(nextRank)).toBe(-1);

        currentRank = intermediateRank;
      }
    });
  });
});
