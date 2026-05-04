/**
 * @fileoverview Tests for ExactMatchDeduplication strategy.
 * Validates O(n) exact name matching with case-insensitive comparison.
 */

import { describe, it, expect } from 'vitest';
import { ExactMatchDeduplication } from './exact-match';
import type { Entity } from '../extraction/schemas';

// Helper to create test entities
function createEntity(
  id: string,
  name: string,
  type: Entity['type'] = 'PERSON',
  confidence = 0.9,
  aliases: string[] = [],
  properties: Record<string, unknown> = {}
): Entity {
  return {
    id,
    name,
    type,
    confidence,
    aliases,
    properties,
    sourceChunkId: 'chunk-1',
    mentions: [{ text: name, startIndex: 0, endIndex: name.length }],
  };
}

describe('ExactMatchDeduplication', () => {
  describe('constructor and properties', () => {
    it('should have correct name', () => {
      const strategy = new ExactMatchDeduplication();
      expect(strategy.name).toBe('exact-match');
    });
  });

  describe('findDuplicates', () => {
    it('should find exact duplicates with same case', async () => {
      const strategy = new ExactMatchDeduplication();

      const entities = [
        createEntity('1', 'John Smith', 'PERSON'),
        createEntity('2', 'John Smith', 'PERSON'),
        createEntity('3', 'Jane Doe', 'PERSON'),
      ];

      const groups = await strategy.findDuplicates(entities);

      expect(groups).toHaveLength(1);
      expect(groups[0].duplicates).toHaveLength(2);
      expect(groups[0].matchScore).toBe(1.0);
      expect(groups[0].matchMethod).toBe('exact');
    });

    it('should find duplicates with different case', async () => {
      const strategy = new ExactMatchDeduplication();

      const entities = [
        createEntity('1', 'John Smith', 'PERSON'),
        createEntity('2', 'john smith', 'PERSON'),
        createEntity('3', 'JOHN SMITH', 'PERSON'),
      ];

      const groups = await strategy.findDuplicates(entities);

      expect(groups).toHaveLength(1);
      expect(groups[0].duplicates).toHaveLength(3);
    });

    it('should find duplicates with whitespace variations', async () => {
      const strategy = new ExactMatchDeduplication();

      const entities = [
        createEntity('1', 'John Smith', 'PERSON'),
        createEntity('2', '  John Smith  ', 'PERSON'),
        createEntity('3', 'John Smith', 'PERSON'),
      ];

      const groups = await strategy.findDuplicates(entities);

      expect(groups).toHaveLength(1);
      expect(groups[0].duplicates).toHaveLength(3);
    });

    it('should NOT match entities with different types', async () => {
      const strategy = new ExactMatchDeduplication();

      const entities = [
        createEntity('1', 'Smith Inc', 'ORGANIZATION'),
        createEntity('2', 'Smith Inc', 'PERSON'),
        createEntity('3', 'Smith Inc', 'LOCATION'),
      ];

      const groups = await strategy.findDuplicates(entities);

      // No duplicates - all different types
      expect(groups).toHaveLength(0);
    });

    it('should return empty array when no duplicates exist', async () => {
      const strategy = new ExactMatchDeduplication();

      const entities = [
        createEntity('1', 'John Smith', 'PERSON'),
        createEntity('2', 'Jane Doe', 'PERSON'),
        createEntity('3', 'Bob Johnson', 'PERSON'),
      ];

      const groups = await strategy.findDuplicates(entities);

      expect(groups).toHaveLength(0);
    });

    it('should return empty array for empty input', async () => {
      const strategy = new ExactMatchDeduplication();

      const groups = await strategy.findDuplicates([]);

      expect(groups).toHaveLength(0);
    });

    it('should return empty array for single entity', async () => {
      const strategy = new ExactMatchDeduplication();

      const entities = [createEntity('1', 'John Smith', 'PERSON')];

      const groups = await strategy.findDuplicates(entities);

      expect(groups).toHaveLength(0);
    });

    it('should handle existing entities parameter', async () => {
      const strategy = new ExactMatchDeduplication();

      const newEntities = [createEntity('1', 'John Smith', 'PERSON')];
      const existingEntities = [createEntity('2', 'john smith', 'PERSON')];

      const groups = await strategy.findDuplicates(newEntities, existingEntities);

      expect(groups).toHaveLength(1);
      expect(groups[0].duplicates).toHaveLength(2);
    });

    it('should find multiple duplicate groups', async () => {
      const strategy = new ExactMatchDeduplication();

      const entities = [
        createEntity('1', 'John Smith', 'PERSON'),
        createEntity('2', 'john smith', 'PERSON'),
        createEntity('3', 'Jane Doe', 'PERSON'),
        createEntity('4', 'jane doe', 'PERSON'),
        createEntity('5', 'Bob Johnson', 'PERSON'),
      ];

      const groups = await strategy.findDuplicates(entities);

      expect(groups).toHaveLength(2); // John Smith and Jane Doe groups
      expect(groups[0].duplicates).toHaveLength(2);
      expect(groups[1].duplicates).toHaveLength(2);
    });

    it('should use first entity as canonical', async () => {
      const strategy = new ExactMatchDeduplication();

      const entities = [
        createEntity('1', 'John Smith', 'PERSON'),
        createEntity('2', 'john smith', 'PERSON'),
      ];

      const groups = await strategy.findDuplicates(entities);

      expect(groups[0].canonical.id).toBe('1');
    });
  });

  describe('merge', () => {
    it('should merge mentions from all duplicates', () => {
      const strategy = new ExactMatchDeduplication();

      const entities = [
        {
          ...createEntity('1', 'John Smith', 'PERSON'),
          mentions: [{ text: 'John Smith', startIndex: 0, endIndex: 10 }],
        },
        {
          ...createEntity('2', 'john smith', 'PERSON'),
          mentions: [{ text: 'john smith', startIndex: 20, endIndex: 30 }],
        },
      ];

      const merged = strategy.merge({
        canonical: entities[0],
        duplicates: entities,
        matchScore: 1.0,
        matchMethod: 'exact',
      });

      expect(merged.mentions).toHaveLength(2);
      expect(merged.mentions[0].text).toBe('John Smith');
      expect(merged.mentions[1].text).toBe('john smith');
    });

    it('should merge aliases and deduplicate', () => {
      const strategy = new ExactMatchDeduplication();

      const entities = [
        createEntity('1', 'John Smith', 'PERSON', 0.9, ['J.S.', 'Johnny']),
        createEntity('2', 'john smith', 'PERSON', 0.85, ['John', 'J.S.']), // duplicate alias
      ];

      const merged = strategy.merge({
        canonical: entities[0],
        duplicates: entities,
        matchScore: 1.0,
        matchMethod: 'exact',
      });

      // Should have all unique aliases, excluding canonical name
      expect(merged.aliases).toContain('J.S.');
      expect(merged.aliases).toContain('Johnny');
      expect(merged.aliases).toContain('John');
      expect(merged.aliases).toContain('john smith'); // lowercase variant

      // Should NOT contain canonical name
      expect(merged.aliases).not.toContain('John Smith');

      // Should be deduplicated
      expect(merged.aliases.filter((a) => a === 'J.S.')).toHaveLength(1);
    });

    it('should take highest confidence', () => {
      const strategy = new ExactMatchDeduplication();

      const entities = [
        createEntity('1', 'John Smith', 'PERSON', 0.7),
        createEntity('2', 'john smith', 'PERSON', 0.95),
        createEntity('3', 'JOHN SMITH', 'PERSON', 0.8),
      ];

      const merged = strategy.merge({
        canonical: entities[0],
        duplicates: entities,
        matchScore: 1.0,
        matchMethod: 'exact',
      });

      expect(merged.confidence).toBe(0.95);
    });

    it('should merge properties with last-write-wins', () => {
      const strategy = new ExactMatchDeduplication();

      const entities = [
        createEntity('1', 'John Smith', 'PERSON', 0.9, [], { age: 30, city: 'NY' }),
        createEntity('2', 'john smith', 'PERSON', 0.85, [], { age: 31, country: 'USA' }),
      ];

      const merged = strategy.merge({
        canonical: entities[0],
        duplicates: entities,
        matchScore: 1.0,
        matchMethod: 'exact',
      });

      expect(merged.properties).toEqual({
        age: 31, // overwritten
        city: 'NY', // kept
        country: 'USA', // added
      });
    });

    it('should preserve canonical entity ID', () => {
      const strategy = new ExactMatchDeduplication();

      const entities = [
        createEntity('canonical-id', 'John Smith', 'PERSON'),
        createEntity('dup-id', 'john smith', 'PERSON'),
      ];

      const merged = strategy.merge({
        canonical: entities[0],
        duplicates: entities,
        matchScore: 1.0,
        matchMethod: 'exact',
      });

      expect(merged.id).toBe('canonical-id');
    });

    it('should handle single entity gracefully', () => {
      const strategy = new ExactMatchDeduplication();

      const entity = createEntity('1', 'John Smith', 'PERSON');

      const merged = strategy.merge({
        canonical: entity,
        duplicates: [entity],
        matchScore: 1.0,
        matchMethod: 'exact',
      });

      expect(merged).toEqual(entity);
    });

    it('should throw error for empty duplicates array', () => {
      const strategy = new ExactMatchDeduplication();

      expect(() =>
        strategy.merge({
          canonical: createEntity('1', 'John Smith', 'PERSON'),
          duplicates: [],
          matchScore: 1.0,
          matchMethod: 'exact',
        })
      ).toThrow('Cannot merge empty duplicate group');
    });
  });

  describe('integration: findDuplicates + merge', () => {
    it('should deduplicate and merge end-to-end', async () => {
      const strategy = new ExactMatchDeduplication();

      const entities = [
        createEntity('1', 'John Smith', 'PERSON', 0.9, ['J.S.'], { age: 30 }),
        createEntity('2', 'john smith', 'PERSON', 0.95, ['John'], { city: 'NYC' }),
        createEntity('3', 'Jane Doe', 'PERSON', 0.8),
      ];

      const groups = await strategy.findDuplicates(entities);

      expect(groups).toHaveLength(1);

      const merged = strategy.merge(groups[0]);

      expect(merged.id).toBe('1');
      expect(merged.confidence).toBe(0.95);
      expect(merged.mentions).toHaveLength(2);
      expect(merged.aliases).toContain('J.S.');
      expect(merged.aliases).toContain('John');
      expect(merged.aliases).toContain('john smith');
      expect(merged.properties).toEqual({ age: 30, city: 'NYC' });
    });
  });

  describe('O(n) complexity verification', () => {
    it('should handle large number of entities efficiently', async () => {
      const strategy = new ExactMatchDeduplication();

      // Create 1000 entities with 100 duplicate groups (10 entities per group)
      const entities: Entity[] = [];
      for (let i = 0; i < 100; i++) {
        for (let j = 0; j < 10; j++) {
          entities.push(
            createEntity(`${i}-${j}`, `Person ${i}`, 'PERSON', 0.9 + j * 0.01)
          );
        }
      }

      const startTime = Date.now();
      const groups = await strategy.findDuplicates(entities);
      const duration = Date.now() - startTime;

      expect(groups).toHaveLength(100); // 100 duplicate groups
      expect(groups[0].duplicates).toHaveLength(10); // 10 entities per group
      expect(duration).toBeLessThan(100); // Should be very fast (O(n))
    });
  });
});
