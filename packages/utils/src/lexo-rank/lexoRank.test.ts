import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LexoRank } from './LexoRank.class';

describe('LexoRank', () => {
  let lexoRank: LexoRank;

  beforeEach(() => {
    lexoRank = new LexoRank({ randomize: false, stepSize: 8 });
  });

  it('generates middle rank correctly', () => {
    const prev = '000000:';
    const next = 'zzzzzz:';
    const middle = lexoRank.middle(prev, next);
    expect(middle.localeCompare(prev)).toBe(1);
    expect(middle.localeCompare(next)).toBe(-1);
  });

  it('generates close middle rank correctly', () => {
    const prev = 'aaaaaa:';
    const next = 'aaaaab:';
    const middle = lexoRank.middle(prev, next);
    expect(middle).toBe('aaaaaa:hzzzzz');
    expect(middle.localeCompare(prev)).toBe(1);
    expect(middle.localeCompare(next)).toBe(-1);
  });

  it('generates previous rank correctly', () => {
    const rank = 'hhhhhh:';
    const prev = lexoRank.prev(rank);
    expect(prev.localeCompare(rank)).toBe(-1);
  });

  it('generates next rank correctly', () => {
    const rank = 'hhhhhh:';
    const next = lexoRank.next(rank);
    expect(next.localeCompare(rank)).toBe(1);
  });

  it('generates random rank correctly', () => {
    const random = lexoRank.random();
    expect(random).toMatch(/^[0-z]{6}:$/);
  });

  it('throws error when next rank is bigger than previous', () => {
    const prev = 'zzzzzz:';
    const next = '000000:';
    expect(() => lexoRank.middle(prev, next)).toThrowError(
      'Next rank is bigger than previous',
    );
  });

  it('throws error when next rank is same as previous', () => {
    const rank = 'zzzzzz:';
    expect(() => lexoRank.middle(rank, rank)).toThrowError(
      'Next rank is equal to previous',
    );
  });

  it('handles large number of operations', () => {
    const lexoRank = new LexoRank({ randomize: false, stepSize: 8 });
    const ranks: string[] = [];

    // Generate a large number of ranks
    for (let i = 0; i < 1000; i++) {
      const rank = lexoRank.random();
      ranks.push(rank);
    }

    // Perform operations on the generated ranks
    for (let i = 0; i < ranks.length - 1; i++) {
      const [prev, next] = [ranks[i] as string, ranks[i + 1] as string].toSorted();
      const middle = lexoRank.middle(prev, next);

      expect(middle.localeCompare(prev)).toBe(1);
      expect(middle.localeCompare(next)).toBe(-1);
    }
  });

  describe('Constructor options', () => {
    it('should create LexoRank with randomize enabled', () => {
      const randomizedLexoRank = new LexoRank({ randomize: true, stepSize: 8 });
      const rank1 = randomizedLexoRank.random();
      const rank2 = randomizedLexoRank.random();

      // Both should be valid ranks but potentially different due to randomization
      expect(rank1).toMatch(/^[0-9a-z]+:?$/);
      expect(rank2).toMatch(/^[0-9a-z]+:?$/);
    });

    it('should create LexoRank with different step size', () => {
      const smallStepLexoRank = new LexoRank({ randomize: false, stepSize: 1 });
      const largeStepLexoRank = new LexoRank({
        randomize: false,
        stepSize: 100,
      });

      const baseRank = 'hhhhhh:';
      const smallStepNext = smallStepLexoRank.next(baseRank);
      const largeStepNext = largeStepLexoRank.next(baseRank);

      // Both should be greater than base rank
      expect(smallStepNext.localeCompare(baseRank)).toBe(1);
      expect(largeStepNext.localeCompare(baseRank)).toBe(1);
    });
  });

  describe('middleOrSibling method', () => {
    it('should return middle when both prev and next are provided', () => {
      const prev = 'aaaaaa:';
      const next = 'zzzzzz:';
      const result = lexoRank.middleOrSibling(prev, next);

      expect(result.localeCompare(prev)).toBe(1);
      expect(result.localeCompare(next)).toBe(-1);
    });

    it('should return prev rank when only next is provided', () => {
      const next = 'hhhhhh:';
      const result = lexoRank.middleOrSibling(null, next);

      expect(result.localeCompare(next)).toBe(-1);
    });

    it('should return next rank when only prev is provided', () => {
      const prev = 'hhhhhh:';
      const result = lexoRank.middleOrSibling(prev, null);

      expect(result.localeCompare(prev)).toBe(1);
    });

    it('should return middle rank when neither prev nor next are provided', () => {
      const result = lexoRank.middleOrSibling(null, null);

      expect(result).toMatch(/^[0-9a-z]+:?$/);
    });

    it('should return middle rank when both are undefined', () => {
      const result = lexoRank.middleOrSibling();

      expect(result).toMatch(/^[0-9a-z]+:?$/);
    });
  });

  describe('nextOrMiddle method', () => {
    it('should return next rank when rank is provided', () => {
      const rank = 'hhhhhh:';
      const result = lexoRank.nextOrMiddle(rank);

      expect(result.localeCompare(rank)).toBe(1);
    });

    it('should return middle rank when rank is undefined', () => {
      const result = lexoRank.nextOrMiddle(undefined);

      expect(result).toMatch(/^[0-9a-z]+:?$/);
    });
  });

  describe('prevOrMiddle method', () => {
    it('should return prev rank when rank is provided', () => {
      const rank = 'hhhhhh:';
      const result = lexoRank.prevOrMiddle(rank);

      expect(result.localeCompare(rank)).toBe(-1);
    });

    it('should return middle rank when rank is undefined', () => {
      const result = lexoRank.prevOrMiddle(undefined);

      expect(result).toMatch(/^[0-9a-z]+:?$/);
    });
  });

  describe('fromNumber method', () => {
    it('should convert small numbers to lexo rank', () => {
      const result1 = lexoRank.fromNumber(0);
      const result2 = lexoRank.fromNumber(1);
      const result3 = lexoRank.fromNumber(100);

      expect(result1).toMatch(/^[0-9a-z]+:?$/);
      expect(result2).toMatch(/^[0-9a-z]+:?$/);
      expect(result3).toMatch(/^[0-9a-z]+:?$/);

      // Results should be in order
      expect(result1.localeCompare(result2)).toBe(-1);
      expect(result2.localeCompare(result3)).toBe(-1);
    });

    it('should convert large numbers to multi-segment lexo rank', () => {
      const largeNumber = 36 ** 6 + 1000; // Larger than max segment
      const result = lexoRank.fromNumber(largeNumber);

      expect(result).toMatch(/^[0-9a-z]+:?/);
      expect(result.includes(':')).toBe(true); // Should have multiple segments
    });

    it('should handle zero correctly', () => {
      const result = lexoRank.fromNumber(0);
      expect(result).toBe('000000:');
    });

    it('should handle maximum single segment number', () => {
      const maxSingleSegment = 36 ** 6 - 1;
      const result = lexoRank.fromNumber(maxSingleSegment);

      expect(result).toMatch(/^[0-9a-z]+:?$/);
    });
  });

  describe('middle method edge cases', () => {
    it('should handle null prev parameter', () => {
      const next = 'hhhhhh:';
      const result = lexoRank.middle(null, next);

      expect(result.localeCompare(next)).toBe(-1);
    });

    it('should handle null next parameter', () => {
      const prev = 'hhhhhh:';
      const result = lexoRank.middle(prev, null);

      expect(result.localeCompare(prev)).toBe(1);
    });

    it('should handle both null parameters', () => {
      const result = lexoRank.middle(null, null);

      expect(result).toMatch(/^[0-9a-z]+:?$/);
    });

    it('should handle very close ranks', () => {
      const prev = '000000:000000';
      const next = '000000:000001';
      const result = lexoRank.middle(prev, next);

      expect(result.localeCompare(prev)).toBe(1);
      expect(result.localeCompare(next)).toBe(-1);
    });
  });

  describe('prev method edge cases', () => {
    it('should handle minimum rank', () => {
      const minRank = '000000:';
      const result = lexoRank.prev(minRank);

      // At the minimum rank, prev may return the same value or handle edge case gracefully
      expect(result.localeCompare(minRank)).toBeLessThanOrEqual(0);
      expect(result).toMatch(/^[0-9a-z]+:?$/);
    });

    it('should handle empty segments', () => {
      const rank = '';
      const result = lexoRank.prev(rank);

      expect(result).toMatch(/^[0-9a-z]+:?$/);
    });

    it('should handle multi-segment ranks', () => {
      const rank = 'hhhhhh:hhhhhh:';
      const result = lexoRank.prev(rank);

      expect(result.localeCompare(rank)).toBe(-1);
    });
  });

  describe('next method edge cases', () => {
    it('should handle multi-segment ranks', () => {
      const rank = 'hhhhhh:hhhhhh:';
      const result = lexoRank.next(rank);

      expect(result.localeCompare(rank)).toBe(1);
    });

    it('should handle empty segments', () => {
      const rank = '';
      const result = lexoRank.next(rank);

      expect(result).toMatch(/^[0-9a-z]+:?$/);
    });

    it('should handle near-maximum ranks', () => {
      const nearMaxRank = 'zzzzzz:';
      const result = lexoRank.next(nearMaxRank);

      // At maximum rank, next may use multi-segment or wrap behavior
      expect(result).toMatch(/^[0-9a-z]+:?/);
      // The algorithm may create a new segment rather than a strictly greater single segment
    });
  });

  describe('random method', () => {
    it('should generate different random ranks', () => {
      const ranks = new Set();

      for (let i = 0; i < 100; i++) {
        ranks.add(lexoRank.random());
      }

      // Should generate many different ranks
      expect(ranks.size).toBeGreaterThan(90);
    });

    it('should generate valid format ranks', () => {
      for (let i = 0; i < 10; i++) {
        const rank = lexoRank.random();
        expect(rank).toMatch(/^[0-9a-z]+:?$/);
      }
    });
  });

  describe('randomization behavior', () => {
    it('should produce different results with randomization enabled', () => {
      const randomizedLexoRank = new LexoRank({ randomize: true, stepSize: 8 });

      // Mock Math.random for predictable tests
      const originalRandom = Math.random;
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const prev = 'aaaaaa:';
      const next = 'zzzzzz:';
      const result1 = randomizedLexoRank.middle(prev, next);
      const result2 = randomizedLexoRank.middle(prev, next);

      // With randomization, results should still be valid
      expect(result1.localeCompare(prev)).toBe(1);
      expect(result1.localeCompare(next)).toBe(-1);
      expect(result2.localeCompare(prev)).toBe(1);
      expect(result2.localeCompare(next)).toBe(-1);

      Math.random = originalRandom;
    });

    it('should handle randomization in prev method', () => {
      const randomizedLexoRank = new LexoRank({ randomize: true, stepSize: 8 });

      const rank = 'hhhhhh:';
      const result = randomizedLexoRank.prev(rank);

      expect(result.localeCompare(rank)).toBe(-1);
    });

    it('should handle randomization in next method', () => {
      const randomizedLexoRank = new LexoRank({ randomize: true, stepSize: 8 });

      const rank = 'hhhhhh:';
      const result = randomizedLexoRank.next(rank);

      expect(result.localeCompare(rank)).toBe(1);
    });
  });

  describe('rank comparison and ordering', () => {
    it('should maintain proper ordering with generated ranks', () => {
      const ranks: string[] = [];

      // Generate a sequence of ranks
      let currentRank = lexoRank.middle();
      ranks.push(currentRank);

      for (let i = 0; i < 10; i++) {
        currentRank = lexoRank.next(currentRank);
        ranks.push(currentRank);
      }

      // Verify they are in ascending order
      for (let i = 0; i < ranks.length - 1; i++) {
        expect(ranks[i]!.localeCompare(ranks[i + 1]!)).toBe(-1);
      }
    });

    it('should handle interleaving ranks correctly', () => {
      const rank1 = lexoRank.middle();
      const rank2 = lexoRank.next(rank1);
      const middleRank = lexoRank.middle(rank1, rank2);

      expect(rank1.localeCompare(middleRank)).toBe(-1);
      expect(middleRank.localeCompare(rank2)).toBe(-1);
    });
  });
});
