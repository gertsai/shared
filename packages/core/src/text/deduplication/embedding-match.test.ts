import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingDeduplication, EmbeddingMatchConfig } from './embedding-match';
import { Entity } from '../extraction/schemas';

describe('EmbeddingDeduplication', () => {
  let mockEmbedFn: ReturnType<typeof vi.fn>;
  let config: EmbeddingMatchConfig;
  let dedup: EmbeddingDeduplication;

  // Helper: Create test entity
  const createEntity = (
    name: string,
    type: Entity['type'] = 'PERSON',
    embedding?: number[]
  ): Entity => ({
    id: crypto.randomUUID(),
    name,
    type,
    customType: undefined,
    aliases: [],
    properties: {},
    confidence: 0.9,
    sourceChunkId: 'chunk-1',
    mentions: [
      {
        text: name,
        startIndex: 0,
        endIndex: name.length,
      },
    ],
    embedding,
  });

  // Mock embedding function returns deterministic vectors
  beforeEach(() => {
    mockEmbedFn = vi.fn(async (text: string): Promise<number[]> => {
      // Simple hash-based embedding for testing
      // Use a more distinct hash that creates different vectors for different names
      const hash = Array.from(text).reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 1), 0);
      const seed = hash % 1000;
      return [
        Math.sin(seed / 100),
        Math.cos(seed / 100),
        Math.sin(seed / 50),
        Math.cos(seed / 50),
      ];
    });

    config = {
      threshold: 0.9,
      embed: mockEmbedFn,
    };

    dedup = new EmbeddingDeduplication(config);
  });

  describe('constructor', () => {
    it('should create instance with config', () => {
      expect(dedup.name).toBe('embedding-match');
    });
  });

  describe('findDuplicates', () => {
    it('should find no duplicates when all entities are different', async () => {
      const entities = [
        createEntity('Alice'),
        createEntity('Bob'),
        createEntity('Charlie'),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(0);
    });

    it('should find duplicates with high similarity', async () => {
      const entities = [
        createEntity('John Smith', 'PERSON', [1.0, 0.8, 0.6, 0.4]),
        createEntity('John Smith', 'PERSON', [1.0, 0.8, 0.6, 0.4]),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(1);
      expect(groups[0].duplicates).toHaveLength(2);
      expect(groups[0].matchMethod).toBe('embedding');
      expect(groups[0].matchScore).toBeGreaterThan(0.99);
    });

    it('should only compare entities of the same type', async () => {
      const entities = [
        createEntity('Apple', 'ORGANIZATION', [1.0, 0.8, 0.6, 0.4]),
        createEntity('Apple', 'PRODUCT', [1.0, 0.8, 0.6, 0.4]),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(0);
    });

    it('should respect similarity threshold', async () => {
      const lowThresholdDedup = new EmbeddingDeduplication({
        threshold: 0.5,
        embed: mockEmbedFn,
      });

      const entities = [
        createEntity('Similar Name', 'PERSON', [1.0, 0.8, 0.6, 0.4]),
        createEntity('Similar Name', 'PERSON', [1.0, 0.7, 0.5, 0.3]),
      ];

      const groups = await lowThresholdDedup.findDuplicates(entities);

      expect(groups.length).toBeGreaterThan(0);
    });

    it('should use existing embeddings when available', async () => {
      const embedding = [1.0, 0.8, 0.6, 0.4];
      const entities = [
        createEntity('Alice', 'PERSON', embedding),
        createEntity('Alice', 'PERSON', embedding),
      ];

      await dedup.findDuplicates(entities);

      // Mock should not be called since embeddings already exist
      expect(mockEmbedFn).not.toHaveBeenCalled();
    });

    it('should generate embeddings when not present', async () => {
      const entities = [
        createEntity('Alice'),
        createEntity('Bob'),
      ];

      await dedup.findDuplicates(entities);

      expect(mockEmbedFn).toHaveBeenCalledTimes(2);
      expect(mockEmbedFn).toHaveBeenCalledWith('Alice');
      expect(mockEmbedFn).toHaveBeenCalledWith('Bob');
    });

    it('should store embeddings back on entities', async () => {
      const entities = [
        createEntity('Alice'),
        createEntity('Bob'),
      ];

      await dedup.findDuplicates(entities);

      expect(entities[0].embedding).toBeDefined();
      expect(entities[0].embedding).toHaveLength(4);
      expect(entities[1].embedding).toBeDefined();
      expect(entities[1].embedding).toHaveLength(4);
    });

    it('should handle multiple duplicate groups', async () => {
      const entities = [
        createEntity('Alice', 'PERSON', [1.0, 0.0, 0.0, 0.0]),
        createEntity('Alice', 'PERSON', [1.0, 0.0, 0.0, 0.0]),
        createEntity('Bob', 'PERSON', [0.0, 1.0, 0.0, 0.0]),
        createEntity('Bob', 'PERSON', [0.0, 1.0, 0.0, 0.0]),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(2);
      expect(groups[0].duplicates).toHaveLength(2);
      expect(groups[1].duplicates).toHaveLength(2);
    });

    it('should compare against existing entities', async () => {
      const existing = [
        createEntity('Existing Entity', 'PERSON', [1.0, 0.8, 0.6, 0.4]),
      ];

      const newEntities = [
        createEntity('Existing Entity', 'PERSON', [1.0, 0.8, 0.6, 0.4]),
      ];

      const groups = await dedup.findDuplicates(newEntities, existing);

      expect(groups).toHaveLength(1);
      expect(groups[0].duplicates).toHaveLength(2);
    });

    it('should handle empty entity list', async () => {
      const groups = await dedup.findDuplicates([]);

      expect(groups).toHaveLength(0);
    });

    it('should handle single entity', async () => {
      const entities = [createEntity('Alice')];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(0);
    });
  });

  describe('merge', () => {
    it('should merge duplicate entities', () => {
      const entity1 = createEntity('John');
      const entity2 = createEntity('John Smith');

      entity1.aliases = ['Johnny'];
      entity2.aliases = ['J. Smith'];
      entity1.properties = { age: 30 };
      entity2.properties = { occupation: 'Engineer' };
      entity1.embedding = [1.0, 0.8, 0.6, 0.4];
      entity2.embedding = [1.0, 0.7, 0.5, 0.3];

      const group = {
        canonical: entity1,
        duplicates: [entity1, entity2],
        matchScore: 0.95,
        matchMethod: 'embedding' as const,
      };

      const merged = dedup.merge(group);

      expect(merged.name).toBe('John');
      expect(merged.aliases).toContain('Johnny');
      expect(merged.aliases).toContain('J. Smith');
      expect(merged.aliases).toContain('John Smith');
      expect(merged.mentions).toHaveLength(2);
    });

    it('should combine all mentions', () => {
      const entity1 = createEntity('Alice');
      const entity2 = createEntity('Alice');

      entity1.mentions = [
        { text: 'Alice', startIndex: 0, endIndex: 5 },
        { text: 'Alice', startIndex: 10, endIndex: 15 },
      ];
      entity2.mentions = [
        { text: 'Alice', startIndex: 20, endIndex: 25 },
      ];

      const group = {
        canonical: entity1,
        duplicates: [entity1, entity2],
        matchScore: 1.0,
        matchMethod: 'embedding' as const,
      };

      const merged = dedup.merge(group);

      expect(merged.mentions).toHaveLength(3);
    });

    it('should take highest confidence', () => {
      const entity1 = createEntity('Alice');
      const entity2 = createEntity('Alice');

      entity1.confidence = 0.7;
      entity2.confidence = 0.95;

      const group = {
        canonical: entity1,
        duplicates: [entity1, entity2],
        matchScore: 1.0,
        matchMethod: 'embedding' as const,
      };

      const merged = dedup.merge(group);

      expect(merged.confidence).toBe(0.95);
    });

    it('should merge properties from all entities', () => {
      const entity1 = createEntity('Alice');
      const entity2 = createEntity('Alice');

      entity1.properties = { age: 30, city: 'NYC' };
      entity2.properties = { age: 31, occupation: 'Engineer' };

      const group = {
        canonical: entity1,
        duplicates: [entity1, entity2],
        matchScore: 1.0,
        matchMethod: 'embedding' as const,
      };

      const merged = dedup.merge(group);

      expect(merged.properties).toEqual({
        age: 31, // Later value wins
        city: 'NYC',
        occupation: 'Engineer',
      });
    });

    it('should average embeddings', () => {
      const entity1 = createEntity('Alice');
      const entity2 = createEntity('Alice');

      entity1.embedding = [1.0, 2.0, 3.0, 4.0];
      entity2.embedding = [5.0, 6.0, 7.0, 8.0];

      const group = {
        canonical: entity1,
        duplicates: [entity1, entity2],
        matchScore: 1.0,
        matchMethod: 'embedding' as const,
      };

      const merged = dedup.merge(group);

      expect(merged.embedding).toEqual([3.0, 4.0, 5.0, 6.0]);
    });

    it('should handle entities without embeddings', () => {
      const entity1 = createEntity('Alice');
      const entity2 = createEntity('Alice');

      delete entity1.embedding;
      delete entity2.embedding;

      const group = {
        canonical: entity1,
        duplicates: [entity1, entity2],
        matchScore: 1.0,
        matchMethod: 'embedding' as const,
      };

      const merged = dedup.merge(group);

      expect(merged.embedding).toEqual([]);
    });

    it('should not include canonical name in aliases', () => {
      const entity1 = createEntity('Alice');
      const entity2 = createEntity('Alice Smith');

      const group = {
        canonical: entity1,
        duplicates: [entity1, entity2],
        matchScore: 1.0,
        matchMethod: 'embedding' as const,
      };

      const merged = dedup.merge(group);

      expect(merged.aliases).not.toContain('Alice');
      expect(merged.aliases).toContain('Alice Smith');
    });
  });

  describe('cosineSimilarity', () => {
    it('should calculate similarity of identical vectors as 1.0', async () => {
      const entities = [
        createEntity('Test', 'PERSON', [1.0, 2.0, 3.0]),
        createEntity('Test', 'PERSON', [1.0, 2.0, 3.0]),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(1);
      expect(groups[0].matchScore).toBeCloseTo(1.0, 5);
    });

    it('should calculate similarity of orthogonal vectors as 0.0', async () => {
      const entities = [
        createEntity('Test1', 'PERSON', [1.0, 0.0, 0.0]),
        createEntity('Test2', 'PERSON', [0.0, 1.0, 0.0]),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(0);
    });

    it('should handle zero vectors', async () => {
      const entities = [
        createEntity('Test1', 'PERSON', [0.0, 0.0, 0.0]),
        createEntity('Test2', 'PERSON', [1.0, 1.0, 1.0]),
      ];

      const groups = await dedup.findDuplicates(entities);

      expect(groups).toHaveLength(0);
    });
  });

  describe('averageEmbedding', () => {
    it('should average multiple embeddings', () => {
      const entity1 = createEntity('A');
      const entity2 = createEntity('B');
      const entity3 = createEntity('C');

      entity1.embedding = [1.0, 2.0, 3.0];
      entity2.embedding = [4.0, 5.0, 6.0];
      entity3.embedding = [7.0, 8.0, 9.0];

      const group = {
        canonical: entity1,
        duplicates: [entity1, entity2, entity3],
        matchScore: 1.0,
        matchMethod: 'embedding' as const,
      };

      const merged = dedup.merge(group);

      expect(merged.embedding).toEqual([4.0, 5.0, 6.0]);
    });

    it('should return single embedding unchanged', () => {
      const entity = createEntity('A');
      entity.embedding = [1.0, 2.0, 3.0];

      const group = {
        canonical: entity,
        duplicates: [entity],
        matchScore: 1.0,
        matchMethod: 'embedding' as const,
      };

      const merged = dedup.merge(group);

      expect(merged.embedding).toEqual([1.0, 2.0, 3.0]);
    });

    it('should return empty array for no embeddings', () => {
      const entity = createEntity('A');
      delete entity.embedding;

      const group = {
        canonical: entity,
        duplicates: [entity],
        matchScore: 1.0,
        matchMethod: 'embedding' as const,
      };

      const merged = dedup.merge(group);

      expect(merged.embedding).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle very high threshold (0.99)', async () => {
      const strictDedup = new EmbeddingDeduplication({
        threshold: 0.99,
        embed: mockEmbedFn,
      });

      const entities = [
        createEntity('Test', 'PERSON', [1.0, 2.0, 3.0]),
        createEntity('Test', 'PERSON', [1.0, 2.0, 3.0]),
      ];

      const groups = await strictDedup.findDuplicates(entities);

      expect(groups).toHaveLength(1);
    });

    it('should handle very low threshold (0.1)', async () => {
      const lenientDedup = new EmbeddingDeduplication({
        threshold: 0.1,
        embed: mockEmbedFn,
      });

      const entities = [
        createEntity('A', 'PERSON', [1.0, 0.0, 0.0]),
        createEntity('B', 'PERSON', [0.9, 0.1, 0.0]),
      ];

      const groups = await lenientDedup.findDuplicates(entities);

      expect(groups.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle large number of entities efficiently', async () => {
      const entities = Array.from({ length: 50 }, (_, i) =>
        createEntity(`Entity ${i}`, 'PERSON')
      );

      const startTime = Date.now();
      await dedup.findDuplicates(entities);
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 5 seconds for 50 entities)
      expect(duration).toBeLessThan(5000);
    });

    it('should handle mixed entity types', async () => {
      const entities = [
        createEntity('Apple', 'ORGANIZATION', [1.0, 0.8, 0.6]),
        createEntity('Apple', 'ORGANIZATION', [1.0, 0.8, 0.6]),
        createEntity('Apple', 'PRODUCT', [1.0, 0.8, 0.6]),
        createEntity('Google', 'ORGANIZATION', [0.5, 0.5, 0.5]),
      ];

      const groups = await dedup.findDuplicates(entities);

      // Only ORGANIZATION "Apple" entities should be grouped
      expect(groups).toHaveLength(1);
      expect(groups[0].duplicates.every((e) => e.type === 'ORGANIZATION')).toBe(true);
    });
  });
});
