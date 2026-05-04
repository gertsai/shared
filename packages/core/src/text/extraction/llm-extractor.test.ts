/**
 * LLM Entity Extractor Tests
 * Phase 23: Entity Extraction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMEntityExtractor, DEFAULT_PROMPT_TEMPLATE, LLMExtractionSchema } from './llm-extractor';
import type { BaseLLM } from '../../llm/base';
import type { LLMResponse } from '../../llm/types';
import type { TextNode } from '../nodes/text-node';
import { createTextNode } from '../nodes/text-node';

// Mock LLM for testing
class MockLLM {
  readonly model = 'mock-gpt-4';
  readonly provider = 'mock';

  async call(): Promise<LLMResponse> {
    return {
      content: JSON.stringify({
        entities: [
          {
            name: 'John Doe',
            type: 'PERSON',
            aliases: ['John', 'JD'],
            properties: { role: 'developer' },
            confidence: 0.95,
            mentions: [
              { text: 'John Doe', startIndex: 0, endIndex: 8 },
              { text: 'John', startIndex: 30, endIndex: 34 },
            ],
          },
          {
            name: 'Acme Corp',
            type: 'ORGANIZATION',
            aliases: ['Acme'],
            properties: {},
            confidence: 0.90,
            mentions: [{ text: 'Acme Corp', startIndex: 50, endIndex: 59 }],
          },
        ],
        relationships: [
          {
            subject: 'John Doe',
            predicate: 'WORKS_FOR',
            object: 'Acme Corp',
            confidence: 0.85,
            evidence: 'John Doe works at Acme Corp',
          },
        ],
      }),
      usage: {
        totalTokens: 150,
        promptTokens: 100,
        completionTokens: 50,
      },
      model: 'mock-gpt-4',
      finishReason: 'stop',
    };
  }
}

describe('LLMEntityExtractor', () => {
  let extractor: LLMEntityExtractor;
  let mockLLM: MockLLM;
  let testChunk: TextNode;

  beforeEach(() => {
    mockLLM = new MockLLM();
    extractor = new LLMEntityExtractor(mockLLM as unknown as BaseLLM);

    testChunk = createTextNode(
      'John Doe is a developer. John works at Acme Corp, a technology company.',
      {
        chunk_index: 0,
        start_index: 0,
        doc_id: 'test-doc-1',
      }
    );
  });

  describe('extract()', () => {
    it('should extract entities from a text chunk', async () => {
      const result = await extractor.extract(testChunk);

      expect(result.entities).toHaveLength(2);
      expect(result.triplets).toHaveLength(1);
      expect(result.metadata.chunkId).toBe(testChunk.id);
    });

    it('should create entities with valid UUIDs', async () => {
      const result = await extractor.extract(testChunk);

      for (const entity of result.entities) {
        expect(entity.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );
      }
    });

    it('should extract entity details correctly', async () => {
      const result = await extractor.extract(testChunk);

      const person = result.entities.find((e) => e.type === 'PERSON');
      expect(person).toBeDefined();
      expect(person?.name).toBe('John Doe');
      expect(person?.aliases).toEqual(['John', 'JD']);
      expect(person?.confidence).toBe(0.95);
      expect(person?.mentions).toHaveLength(2);

      const org = result.entities.find((e) => e.type === 'ORGANIZATION');
      expect(org).toBeDefined();
      expect(org?.name).toBe('Acme Corp');
      expect(org?.confidence).toBe(0.90);
    });

    it('should extract relationships correctly', async () => {
      const result = await extractor.extract(testChunk, { includeEvidence: true });

      expect(result.triplets).toHaveLength(1);

      const triplet = result.triplets[0];
      expect(triplet.subject.name).toBe('John Doe');
      expect(triplet.predicate.type).toBe('WORKS_FOR');
      expect(triplet.object.name).toBe('Acme Corp');
      expect(triplet.predicate.evidence).toBe('John Doe works at Acme Corp');
    });

    it('should calculate triplet confidence correctly', async () => {
      const result = await extractor.extract(testChunk);

      const triplet = result.triplets[0];
      // confidence = rel_confidence * subject_confidence * object_confidence
      const expectedConfidence = 0.85 * 0.95 * 0.90;
      expect(triplet.confidence).toBeCloseTo(expectedConfidence, 5);
    });

    it('should filter by minimum confidence', async () => {
      const result = await extractor.extract(testChunk, { minConfidence: 0.92 });

      // Only person entity (0.95) should pass, org (0.90) should be filtered
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].type).toBe('PERSON');

      // Relationship should be filtered because object entity is missing
      expect(result.triplets).toHaveLength(0);
    });

    it('should limit entities per chunk', async () => {
      const result = await extractor.extract(testChunk, { maxEntitiesPerChunk: 1 });

      expect(result.entities).toHaveLength(1);
    });

    it('should not include evidence when disabled', async () => {
      const result = await extractor.extract(testChunk, { includeEvidence: false });

      expect(result.triplets[0].predicate.evidence).toBeUndefined();
    });

    it('should track processing metadata', async () => {
      const result = await extractor.extract(testChunk);

      expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.tokensUsed).toBe(150);
      expect(result.metadata.modelUsed).toBe('mock-gpt-4');
      expect(result.metadata.extractorVersion).toBe('1.0.0');
    });
  });

  describe('extractBatch()', () => {
    it('should extract from multiple chunks', async () => {
      const chunks = [
        testChunk,
        createTextNode('Alice Smith leads the engineering team.', {
          chunk_index: 1,
          start_index: 100,
          doc_id: 'test-doc-1',
        }),
      ];

      const results = await extractor.extractBatch(chunks);

      expect(results).toHaveLength(2);
      expect(results[0].entities.length).toBeGreaterThan(0);
      expect(results[1].entities.length).toBeGreaterThan(0);
    });

    it('should call progress callback', async () => {
      const chunks = [testChunk];
      const onProgress = vi.fn();

      await extractor.extractBatch(chunks, { onProgress });

      expect(onProgress).toHaveBeenCalledWith(1, 1);
    });

    it('should process batches with concurrency control', async () => {
      const chunks = Array(10)
        .fill(null)
        .map((_, i) =>
          createTextNode(`Test content ${i}`, {
            chunk_index: i,
            start_index: i * 100,
            doc_id: 'test-doc-1',
          })
        );

      const results = await extractor.extractBatch(chunks, {
        batchSize: 3,
        concurrency: 2,
      });

      expect(results).toHaveLength(10);
    });
  });

  describe('buildPrompt()', () => {
    it('should build prompt with text substitution', () => {
      const template = extractor.getPromptTemplate();
      expect(template).toContain('{{text}}');
      expect(template).toContain('PERSON');
      expect(template).toContain('ORGANIZATION');
    });

    it('should support custom prompt templates', () => {
      const customTemplate = 'Extract entities from: {{text}}';
      extractor.setPromptTemplate(customTemplate);

      const template = extractor.getPromptTemplate();
      expect(template).toBe(customTemplate);
    });
  });

  describe('normalizeEntityType()', () => {
    it('should normalize valid entity types', async () => {
      // Mock with lowercase type
      mockLLM.call = async () => ({
        content: JSON.stringify({
          entities: [
            {
              name: 'Test',
              type: 'person', // lowercase
              confidence: 0.9,
              mentions: [{ text: 'Test', startIndex: 0, endIndex: 4 }],
            },
          ],
          relationships: [],
        }),
        usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
        model: 'mock',
        finishReason: 'stop',
      });

      const result = await extractor.extract(testChunk);
      expect(result.entities[0].type).toBe('PERSON');
    });

    it('should map unknown types to CUSTOM', async () => {
      // Mock with invalid type
      mockLLM.call = async () => ({
        content: JSON.stringify({
          entities: [
            {
              name: 'Test',
              type: 'UNKNOWN_TYPE',
              confidence: 0.9,
              mentions: [{ text: 'Test', startIndex: 0, endIndex: 4 }],
            },
          ],
          relationships: [],
        }),
        usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
        model: 'mock',
        finishReason: 'stop',
      });

      const result = await extractor.extract(testChunk);
      expect(result.entities[0].type).toBe('CUSTOM');
      expect(result.entities[0].customType).toBe('UNKNOWN_TYPE');
    });
  });

  describe('error handling', () => {
    it('should handle LLM errors', async () => {
      mockLLM.call = async () => {
        throw new Error('LLM API error');
      };

      await expect(extractor.extract(testChunk)).rejects.toThrow('LLM API error');
    });

    it('should handle invalid JSON from LLM', async () => {
      mockLLM.call = async () => ({
        content: 'Invalid JSON {{{',
        usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
        model: 'mock',
        finishReason: 'stop',
      });

      await expect(extractor.extract(testChunk)).rejects.toThrow();
    });

    it('should retry failed extractions in batch mode', async () => {
      let callCount = 0;
      mockLLM.call = async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First attempt fails');
        }
        return {
          content: JSON.stringify({ entities: [], relationships: [] }),
          usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
          model: 'mock',
          finishReason: 'stop',
        };
      };

      const results = await extractor.extractBatch([testChunk], {
        retryOnFailure: true,
        maxRetries: 2,
      });

      expect(results).toHaveLength(1);
      expect(callCount).toBe(2); // One failure, one success
    });
  });

  describe('relationship filtering', () => {
    it('should filter by relationship types', async () => {
      const result = await extractor.extract(testChunk, {
        relationshipTypes: ['MANAGES'], // Not WORKS_FOR
      });

      // Relationship should be filtered out
      expect(result.triplets).toHaveLength(0);
    });

    it('should include only specified relationship types', async () => {
      const result = await extractor.extract(testChunk, {
        relationshipTypes: ['WORKS_FOR'],
      });

      expect(result.triplets).toHaveLength(1);
      expect(result.triplets[0].predicate.type).toBe('WORKS_FOR');
    });
  });

  describe('entity type filtering', () => {
    it('should filter by entity types in prompt', () => {
      const template = extractor.getPromptTemplate();
      extractor.setPromptTemplate(template);

      // This test just verifies the template accepts entity types
      expect(DEFAULT_PROMPT_TEMPLATE).toContain('{{entityTypes}}');
    });
  });

  describe('LLMExtractionSchema', () => {
    it('should validate correct LLM output', () => {
      const validOutput = {
        entities: [
          {
            name: 'Test Entity',
            type: 'PERSON',
            confidence: 0.9,
            mentions: [{ text: 'Test', startIndex: 0, endIndex: 4 }],
          },
        ],
        relationships: [],
      };

      const result = LLMExtractionSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid LLM output', () => {
      const invalidOutput = {
        entities: [
          {
            name: 'Test',
            // Missing required fields
          },
        ],
      };

      const result = LLMExtractionSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });
  });
});
