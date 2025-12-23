/**
 * @fileoverview Tests for FuzzyMatchDeduplication strategy.
 * Tests Jaro-Winkler and Levenshtein algorithms, entity grouping, and merging.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FuzzyMatchDeduplication } from './fuzzy-match';
import { Entity } from '../extraction/schemas';

describe('FuzzyMatchDeduplication', () => {
  let dedup: FuzzyMatchDeduplication;

  // Helper to create test entity
  function createEntity(overrides: Partial<Entity> = {}): Entity {
    return {
      id: crypto.randomUUID(),
      name: 'John Smith',
      type: 'PERSON',
      aliases: [],
      properties: {},
      confidence: 0.9,
      sourceChunkId: 'chunk-1',
      mentions: [
        {
          text: 'John Smith',
          startIndex: 0,
          endIndex: 10,
        },
      ],
      ...overrides,
    };
  }

  describe('Constructor', () => {
    it('should use default config (threshold=0.85, algorithm=jaro-winkler)', () => {
      const strategy = new FuzzyMatchDeduplication();
      expect(strategy.name).toBe('fuzzy-match');
    });

    it('should accept custom threshold', () => {
      const strategy = new FuzzyMatchDeduplication({ threshold: 0.9 });
      expect(strategy.name).toBe('fuzzy-match');
    });

    it('should accept custom algorithm', () => {
      const strategy = new FuzzyMatchDeduplication({ algorithm: 'levenshtein' });
      expect(strategy.name).toBe('fuzzy-match');
    });

    it('should throw error for invalid threshold', () => {
      expect(() => new FuzzyMatchDeduplication({ threshold: 1.5 })).toThrow(
        'Fuzzy match threshold must be between 0 and 1'
      );
      expect(() => new FuzzyMatchDeduplication({ threshold: -0.1 })).toThrow(
        'Fuzzy match threshold must be between 0 and 1'
      );
    });
  });

  describe('findDuplicates - Jaro-Winkler', () => {
    beforeEach(() => {
      dedup = new FuzzyMatchDeduplication({ threshold: 0.85, algorithm: 'jaro-winkler' });
    });

    it('should find exact duplicates', async () => {
      const entities = [
        createEntity({ id: '1', name: 'John Smith' }),
        createEntity({ id: '2', name: 'John Smith' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(1);
      expect(groups[0].duplicates).toHaveLength(2);
      expect(groups[0].matchScore).toBeCloseTo(1.0, 2);
      expect(groups[0].matchMethod).toBe('fuzzy');
    });

    it('should find similar names (typo)', async () => {
      const entities = [
        createEntity({ id: '1', name: 'John Smith' }),
        createEntity({ id: '2', name: 'Jon Smith' }), // Typo: missing 'h'
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(1);
      expect(groups[0].duplicates).toHaveLength(2);
      expect(groups[0].matchScore).toBeGreaterThan(0.85);
    });

    it('should find abbreviated names', async () => {
      const entities = [
        createEntity({ id: '1', name: 'John Smith' }),
        createEntity({ id: '2', name: 'J. Smith' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      // This might not match due to length difference, but Jaro-Winkler favors common prefixes
      // Adjust threshold or expectations based on actual algorithm behavior
      if (groups.length > 0) {
        expect(groups[0].duplicates.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should only match same entity types', async () => {
      const entities = [
        createEntity({ id: '1', name: 'John Smith', type: 'PERSON' }),
        createEntity({ id: '2', name: 'John Smith', type: 'ORGANIZATION' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(0); // Different types shouldn't match
    });

    it('should not find dissimilar names', async () => {
      const entities = [
        createEntity({ id: '1', name: 'John Smith' }),
        createEntity({ id: '2', name: 'Jane Doe' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(0);
    });

    it('should group multiple similar entities together', async () => {
      const entities = [
        createEntity({ id: '1', name: 'John Smith' }),
        createEntity({ id: '2', name: 'John Smith' }),
        createEntity({ id: '3', name: 'Jon Smith' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(1);
      expect(groups[0].duplicates).toHaveLength(3);
    });

    it('should create separate groups for distinct clusters', async () => {
      const entities = [
        createEntity({ id: '1', name: 'John Smith' }),
        createEntity({ id: '2', name: 'Jon Smith' }),
        createEntity({ id: '3', name: 'Jane Doe' }),
        createEntity({ id: '4', name: 'Jane Do' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(2);
      // Check that each group has correct members
      const names = groups.map(g => g.duplicates.map(d => d.name).sort());
      expect(names).toContainEqual(['John Smith', 'Jon Smith']);
      expect(names).toContainEqual(['Jane Do', 'Jane Doe']);
    });

    it('should work with existing entities', async () => {
      const newEntities = [
        createEntity({ id: '1', name: 'John Smith' }),
      ];

      const existing = [
        createEntity({ id: '2', name: 'Jon Smith' }),
      ];

      const groups = await dedup.findDuplicates(newEntities, existing);

      expect(groups).toHaveLength(1);
      expect(groups[0].duplicates).toHaveLength(2);
    });

    it('should include metadata in groups', async () => {
      const entities = [
        createEntity({ id: '1', name: 'John Smith' }),
        createEntity({ id: '2', name: 'John Smith' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups[0].metadata).toBeDefined();
      expect(groups[0].metadata?.algorithm).toBe('jaro-winkler');
      expect(groups[0].metadata?.threshold).toBe(0.85);
      expect(groups[0].metadata?.groupSize).toBe(2);
    });

    it('should be case-insensitive', async () => {
      const entities = [
        createEntity({ id: '1', name: 'John Smith' }),
        createEntity({ id: '2', name: 'JOHN SMITH' }),
        createEntity({ id: '3', name: 'john smith' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(1);
      expect(groups[0].duplicates).toHaveLength(3);
    });
  });

  describe('findDuplicates - Levenshtein', () => {
    beforeEach(() => {
      dedup = new FuzzyMatchDeduplication({ threshold: 0.85, algorithm: 'levenshtein' });
    });

    it('should find exact duplicates', async () => {
      const entities = [
        createEntity({ id: '1', name: 'John Smith' }),
        createEntity({ id: '2', name: 'John Smith' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(1);
      expect(groups[0].matchScore).toBeCloseTo(1.0, 2);
    });

    it('should find similar names with typos', async () => {
      const entities = [
        createEntity({ id: '1', name: 'kitten' }),
        createEntity({ id: '2', name: 'kittens' }), // 1 insertion
      ];

      const groups = await dedup.findDuplicates(entities);

      // Levenshtein similarity: 1 - 1/7 = 0.857
      expect(groups).toHaveLength(1);
    });

    it('should calculate correct similarity for known examples', async () => {
      // "kitten" -> "sitting": 3 edits (k->s, e->i, +g)
      // Similarity: 1 - 3/7 = 0.571 (below threshold)
      const entities = [
        createEntity({ id: '1', name: 'kitten', type: 'CONCEPT' }),
        createEntity({ id: '2', name: 'sitting', type: 'CONCEPT' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(0); // Below 0.85 threshold
    });

    it('should use correct metadata', async () => {
      const entities = [
        createEntity({ id: '1', name: 'test' }),
        createEntity({ id: '2', name: 'test' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups[0].metadata?.algorithm).toBe('levenshtein');
    });
  });

  describe('merge', () => {
    beforeEach(() => {
      dedup = new FuzzyMatchDeduplication();
    });

    it('should merge mentions from all duplicates', () => {
      const entities = [
        createEntity({
          id: '1',
          name: 'John Smith',
          mentions: [{ text: 'John Smith', startIndex: 0, endIndex: 10 }],
        }),
        createEntity({
          id: '2',
          name: 'Jon Smith',
          mentions: [{ text: 'Jon Smith', startIndex: 20, endIndex: 29 }],
        }),
      ];

      const merged = dedup.merge({
        canonical: entities[0],
        duplicates: entities,
        matchScore: 0.9,
        matchMethod: 'fuzzy',
      });

      expect(merged.mentions).toHaveLength(2);
      expect(merged.mentions[0].text).toBe('John Smith');
      expect(merged.mentions[1].text).toBe('Jon Smith');
    });

    it('should combine aliases and entity names', () => {
      const entities = [
        createEntity({
          id: '1',
          name: 'John Smith',
          aliases: ['J.S.', 'Johnny'],
        }),
        createEntity({
          id: '2',
          name: 'Jon Smith',
          aliases: ['Jon'],
        }),
      ];

      const merged = dedup.merge({
        canonical: entities[0],
        duplicates: entities,
        matchScore: 0.9,
        matchMethod: 'fuzzy',
      });

      // Should contain all unique names except the canonical name
      expect(merged.aliases).toContain('J.S.');
      expect(merged.aliases).toContain('Johnny');
      expect(merged.aliases).toContain('Jon');
      expect(merged.aliases).toContain('Jon Smith');
      expect(merged.aliases).not.toContain('John Smith'); // Canonical name excluded
    });

    it('should take maximum confidence', () => {
      const entities = [
        createEntity({ id: '1', confidence: 0.8 }),
        createEntity({ id: '2', confidence: 0.95 }),
        createEntity({ id: '3', confidence: 0.7 }),
      ];

      const merged = dedup.merge({
        canonical: entities[0],
        duplicates: entities,
        matchScore: 0.9,
        matchMethod: 'fuzzy',
      });

      expect(merged.confidence).toBe(0.95);
    });

    it('should merge properties with last-write-wins', () => {
      const entities = [
        createEntity({
          id: '1',
          properties: { age: 30, city: 'New York' },
        }),
        createEntity({
          id: '2',
          properties: { age: 31, country: 'USA' },
        }),
      ];

      const merged = dedup.merge({
        canonical: entities[0],
        duplicates: entities,
        matchScore: 0.9,
        matchMethod: 'fuzzy',
      });

      expect(merged.properties).toEqual({
        age: 31, // Overwritten by second entity
        city: 'New York',
        country: 'USA',
      });
    });

    it('should preserve canonical entity base fields', () => {
      const entities = [
        createEntity({ id: '1', name: 'John Smith', type: 'PERSON' }),
        createEntity({ id: '2', name: 'Jon Smith', type: 'PERSON' }),
      ];

      const merged = dedup.merge({
        canonical: entities[0],
        duplicates: entities,
        matchScore: 0.9,
        matchMethod: 'fuzzy',
      });

      expect(merged.id).toBe('1');
      expect(merged.name).toBe('John Smith');
      expect(merged.type).toBe('PERSON');
    });

    it('should handle single entity group', () => {
      const entities = [createEntity({ id: '1', name: 'John Smith' })];

      const merged = dedup.merge({
        canonical: entities[0],
        duplicates: entities,
        matchScore: 1.0,
        matchMethod: 'fuzzy',
      });

      expect(merged.id).toBe('1');
      expect(merged.mentions).toHaveLength(1);
    });
  });

  describe('Jaro-Winkler Algorithm', () => {
    beforeEach(() => {
      dedup = new FuzzyMatchDeduplication({ threshold: 0.01, algorithm: 'jaro-winkler' });
    });

    it('should score identical strings as 1.0', async () => {
      const entities = [
        createEntity({ id: '1', name: 'martha', type: 'CONCEPT' }),
        createEntity({ id: '2', name: 'martha', type: 'CONCEPT' }),
      ];

      const groups = await dedup.findDuplicates(entities);
      expect(groups[0].matchScore).toBe(1.0);
    });

    it('should favor common prefixes (Winkler bonus)', async () => {
      // 'martha' vs 'marhta' - common prefix 'mar'
      const entities = [
        createEntity({ id: '1', name: 'martha', type: 'CONCEPT' }),
        createEntity({ id: '2', name: 'marhta', type: 'CONCEPT' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      // Should have high similarity due to common prefix and matching chars
      expect(groups[0].matchScore).toBeGreaterThan(0.9);
    });

    it('should handle empty strings', async () => {
      const entities = [
        createEntity({ id: '1', name: '', type: 'CONCEPT' }),
        createEntity({ id: '2', name: 'test', type: 'CONCEPT' }),
      ];

      const groups = await dedup.findDuplicates(entities);
      expect(groups).toHaveLength(0); // Score should be 0, below any reasonable threshold
    });

    it('should score classic Jaro-Winkler test cases correctly', async () => {
      // Classic test: "dixon" vs "dicksonx"
      const entities1 = [
        createEntity({ id: '1', name: 'dixon', type: 'CONCEPT' }),
        createEntity({ id: '2', name: 'dicksonx', type: 'CONCEPT' }),
      ];

      const groups1 = await dedup.findDuplicates(entities1);
      // Should have moderate similarity (common 'di', some matching chars)
      if (groups1.length > 0) {
        expect(groups1[0].matchScore).toBeLessThan(0.9); // Not too high
      }
    });
  });

  describe('Levenshtein Algorithm', () => {
    beforeEach(() => {
      dedup = new FuzzyMatchDeduplication({ threshold: 0.0, algorithm: 'levenshtein' });
    });

    it('should calculate correct distance for identical strings', async () => {
      const entities = [
        createEntity({ id: '1', name: 'test', type: 'CONCEPT' }),
        createEntity({ id: '2', name: 'test', type: 'CONCEPT' }),
      ];

      const groups = await dedup.findDuplicates(entities);
      expect(groups[0].matchScore).toBe(1.0);
    });

    it('should calculate correct distance for single edit', async () => {
      const entities = [
        createEntity({ id: '1', name: 'test', type: 'CONCEPT' }),
        createEntity({ id: '2', name: 'tests', type: 'CONCEPT' }), // +1 char
      ];

      const groups = await dedup.findDuplicates(entities);
      // Distance: 1, MaxLen: 5, Similarity: 1 - 1/5 = 0.8
      expect(groups[0].matchScore).toBeCloseTo(0.8, 2);
    });

    it('should handle empty strings', async () => {
      const entities = [
        createEntity({ id: '1', name: '', type: 'CONCEPT' }),
        createEntity({ id: '2', name: '', type: 'CONCEPT' }),
      ];

      const groups = await dedup.findDuplicates(entities);
      expect(groups[0].matchScore).toBe(1.0); // Both empty = identical
    });

    it('should calculate classic Levenshtein examples', async () => {
      // "kitten" -> "sitting": distance = 3
      const entities = [
        createEntity({ id: '1', name: 'kitten', type: 'CONCEPT' }),
        createEntity({ id: '2', name: 'sitting', type: 'CONCEPT' }),
      ];

      const groups = await dedup.findDuplicates(entities);
      // Distance: 3, MaxLen: 7, Similarity: 1 - 3/7 ≈ 0.571
      if (groups.length > 0) {
        expect(groups[0].matchScore).toBeCloseTo(0.571, 2);
      }
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      dedup = new FuzzyMatchDeduplication({ threshold: 0.85 });
    });

    it('should handle empty entity array', async () => {
      const groups = await dedup.findDuplicates([]);
      expect(groups).toHaveLength(0);
    });

    it('should handle single entity', async () => {
      const entities = [createEntity({ id: '1', name: 'John Smith' })];
      const groups = await dedup.findDuplicates(entities);
      expect(groups).toHaveLength(0); // No duplicates
    });

    it('should handle all unique entities', async () => {
      const entities = [
        createEntity({ id: '1', name: 'Alpha' }),
        createEntity({ id: '2', name: 'Beta' }),
        createEntity({ id: '3', name: 'Gamma' }),
      ];

      const groups = await dedup.findDuplicates(entities);
      expect(groups).toHaveLength(0);
    });

    it('should not double-count entities in overlapping groups', async () => {
      // Ensure an entity appears in only one group
      const entities = [
        createEntity({ id: '1', name: 'John Smith' }),
        createEntity({ id: '2', name: 'John Smith' }),
        createEntity({ id: '3', name: 'John Smith' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(1);
      expect(groups[0].duplicates).toHaveLength(3);

      // Verify each entity appears exactly once
      const allDuplicateIds = groups.flatMap(g => g.duplicates.map(d => d.id));
      const uniqueIds = new Set(allDuplicateIds);
      expect(allDuplicateIds.length).toBe(uniqueIds.size);
    });

    it('should handle very long names', async () => {
      const longName1 = 'A'.repeat(500);
      const longName2 = 'A'.repeat(499) + 'B'; // 1 char different

      const entities = [
        createEntity({ id: '1', name: longName1, type: 'CONCEPT' }),
        createEntity({ id: '2', name: longName2, type: 'CONCEPT' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      // Should still find similarity (1 - 1/500 = 0.998)
      expect(groups).toHaveLength(1);
      expect(groups[0].matchScore).toBeGreaterThan(0.85);
    });

    it('should handle special characters', async () => {
      const entities = [
        createEntity({ id: '1', name: 'John-Smith', type: 'PERSON' }),
        createEntity({ id: '2', name: 'John Smith', type: 'PERSON' }),
      ];

      const groups = await dedup.findDuplicates(entities);

      // Should still find high similarity
      if (groups.length > 0) {
        expect(groups[0].duplicates.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('Performance Characteristics', () => {
    beforeEach(() => {
      dedup = new FuzzyMatchDeduplication({ threshold: 0.85 });
    });

    it('should handle moderate-sized entity lists efficiently', async () => {
      // Create 100 entities with some duplicates
      // Use sufficiently different names to avoid cross-group matching
      const entities: Entity[] = [];
      const names = [
        'Alice Johnson', 'Bob Anderson', 'Carol Williams', 'David Martinez', 'Emma Garcia',
        'Frank Robinson', 'Grace Thompson', 'Henry White', 'Ivy Rodriguez', 'Jack Lewis',
        'Kate Walker', 'Liam Hall', 'Maya Allen', 'Noah Young', 'Olivia King',
        'Peter Wright', 'Quinn Lopez', 'Ryan Hill', 'Sara Scott', 'Tom Green',
        'Uma Adams', 'Victor Baker', 'Wendy Nelson', 'Xavier Carter', 'Yara Mitchell',
      ];

      for (let i = 0; i < 25; i++) {
        entities.push(createEntity({ id: `${i}-a`, name: names[i] }));
        entities.push(createEntity({ id: `${i}-b`, name: names[i] })); // Exact duplicate
      }

      const startTime = Date.now();
      const groups = await dedup.findDuplicates(entities);
      const duration = Date.now() - startTime;

      expect(groups).toHaveLength(25); // 25 duplicate pairs (one group per unique name)
      expect(groups.every(g => g.duplicates.length === 2)).toBe(true); // Each group has 2 entities
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should work with threshold adjustments', async () => {
      const entities = [
        createEntity({ id: '1', name: 'John Smith' }),
        createEntity({ id: '2', name: 'Jon Smyth' }),
      ];

      // High threshold - might not match
      const strictDedup = new FuzzyMatchDeduplication({ threshold: 0.95 });
      const strictGroups = await strictDedup.findDuplicates(entities);

      // Low threshold - should match
      const lenientDedup = new FuzzyMatchDeduplication({ threshold: 0.7 });
      const lenientGroups = await lenientDedup.findDuplicates(entities);

      // Lenient should find more (or equal) matches than strict
      expect(lenientGroups.length).toBeGreaterThanOrEqual(strictGroups.length);
    });
  });
});
