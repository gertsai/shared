import { describe, it, expect, beforeEach } from 'vitest';
import { ProvenanceTracker } from './tracker';
import { CitationSchema } from './citation';
import { GraphEdgeSchema, ProvenanceChainSchema } from './provenance-chain';
import { createTextNode } from '../nodes/text-node';
import type { Entity, Triplet } from '../extraction/types';

describe('Provenance System', () => {
  describe('CitationSchema', () => {
    it('validates correct citation', () => {
      const citation = {
        id: 'citation-1',
        sourceDocument: {
          id: 'doc-1',
          path: '/path/to/doc.txt',
          name: 'doc.txt',
        },
        chunk: {
          id: 'chunk-1',
          startIndex: 0,
          endIndex: 100,
          text: 'Sample text',
        },
        entity: {
          id: 'entity-1',
          name: 'John Doe',
          type: 'PERSON',
        },
        confidence: 0.9,
      };

      expect(() => CitationSchema.parse(citation)).not.toThrow();
    });

    it('validates citation without entity', () => {
      const citation = {
        id: 'citation-1',
        sourceDocument: {
          id: 'doc-1',
        },
        chunk: {
          id: 'chunk-1',
          startIndex: 0,
          endIndex: 100,
          text: 'Sample text',
        },
        confidence: 0.9,
      };

      expect(() => CitationSchema.parse(citation)).not.toThrow();
    });

    it('validates citation with URL source', () => {
      const citation = {
        id: 'citation-1',
        sourceDocument: {
          id: 'doc-1',
          url: 'https://example.com/doc',
        },
        chunk: {
          id: 'chunk-1',
          startIndex: 0,
          endIndex: 100,
          text: 'Sample text',
        },
        confidence: 0.8,
      };

      expect(() => CitationSchema.parse(citation)).not.toThrow();
    });

    it('rejects invalid confidence values', () => {
      const citation = {
        id: 'citation-1',
        sourceDocument: { id: 'doc-1' },
        chunk: { id: 'chunk-1', startIndex: 0, endIndex: 100, text: 'text' },
        confidence: 1.5,
      };

      expect(() => CitationSchema.parse(citation)).toThrow();
    });

    it('rejects invalid URL', () => {
      const citation = {
        id: 'citation-1',
        sourceDocument: {
          id: 'doc-1',
          url: 'not-a-url',
        },
        chunk: { id: 'chunk-1', startIndex: 0, endIndex: 100, text: 'text' },
        confidence: 0.8,
      };

      expect(() => CitationSchema.parse(citation)).toThrow();
    });
  });

  describe('GraphEdgeSchema', () => {
    it('validates graph edge with weight', () => {
      const edge = {
        sourceId: 'entity-1',
        targetId: 'entity-2',
        type: 'WORKS_FOR',
        weight: 0.85,
      };

      expect(() => GraphEdgeSchema.parse(edge)).not.toThrow();
    });

    it('validates graph edge without weight', () => {
      const edge = {
        sourceId: 'entity-1',
        targetId: 'entity-2',
        type: 'LOCATED_IN',
      };

      expect(() => GraphEdgeSchema.parse(edge)).not.toThrow();
    });
  });

  describe('ProvenanceChainSchema', () => {
    it('validates complete provenance chain', () => {
      const chain = {
        query: 'test query',
        retrievedChunks: [
          {
            id: 'chunk-1',
            text: 'sample text',
            metadata: {
              chunk_index: 0,
              start_index: 0,
              doc_id: 'doc-1',
            },
          },
        ],
        extractedEntities: [],
        graphPath: [],
        citations: [],
        createdAt: new Date().toISOString(),
        processingTimeMs: 100,
      };

      expect(() => ProvenanceChainSchema.parse(chain)).not.toThrow();
    });

    it('rejects invalid datetime format', () => {
      const chain = {
        query: 'test query',
        retrievedChunks: [],
        extractedEntities: [],
        graphPath: [],
        citations: [],
        createdAt: 'invalid-date',
        processingTimeMs: 100,
      };

      expect(() => ProvenanceChainSchema.parse(chain)).toThrow();
    });
  });

  describe('ProvenanceTracker', () => {
    let tracker: ProvenanceTracker;

    beforeEach(() => {
      tracker = new ProvenanceTracker();
    });

    describe('trackChunk', () => {
      it('tracks a single chunk', () => {
        const chunk = createTextNode('Sample text', {
          chunk_index: 0,
          start_index: 0,
          doc_id: 'doc-1',
          doc_path: '/path/to/doc.txt',
        });

        tracker.trackChunk(chunk);

        const chain = tracker.buildChain('test query', Date.now());
        expect(chain.retrievedChunks).toHaveLength(1);
        expect(chain.retrievedChunks[0].id).toBe(chunk.id);
      });

      it('tracks multiple chunks', () => {
        const chunk1 = createTextNode('Text 1', {
          chunk_index: 0,
          start_index: 0,
          doc_id: 'doc-1',
        });

        const chunk2 = createTextNode('Text 2', {
          chunk_index: 1,
          start_index: 100,
          doc_id: 'doc-1',
        });

        tracker.trackChunk(chunk1);
        tracker.trackChunk(chunk2);

        const chain = tracker.buildChain('test query', Date.now());
        expect(chain.retrievedChunks).toHaveLength(2);
      });

      it('overwrites duplicate chunks by ID', () => {
        const chunk1 = createTextNode('Text 1', {
          chunk_index: 0,
          start_index: 0,
          doc_id: 'doc-1',
        });

        // Create chunk with same ID but different text
        const chunk2 = { ...chunk1, text: 'Updated text' };

        tracker.trackChunk(chunk1);
        tracker.trackChunk(chunk2);

        const chain = tracker.buildChain('test query', Date.now());
        expect(chain.retrievedChunks).toHaveLength(1);
        expect(chain.retrievedChunks[0].text).toBe('Updated text');
      });
    });

    describe('trackEntity', () => {
      it('tracks a single entity', () => {
        const entity: Entity = {
          id: 'entity-1',
          name: 'John Doe',
          type: 'PERSON',
          aliases: [],
          properties: {},
          confidence: 0.9,
          sourceChunkId: 'chunk-1',
          mentions: [
            {
              text: 'John Doe',
              startIndex: 0,
              endIndex: 8,
            },
          ],
        };

        tracker.trackEntity(entity);

        const chain = tracker.buildChain('test query', Date.now());
        expect(chain.extractedEntities).toHaveLength(1);
        expect(chain.extractedEntities[0].name).toBe('John Doe');
      });

      it('tracks multiple entities', () => {
        const entity1: Entity = {
          id: 'entity-1',
          name: 'John Doe',
          type: 'PERSON',
          aliases: [],
          properties: {},
          confidence: 0.9,
          sourceChunkId: 'chunk-1',
          mentions: [{ text: 'John Doe', startIndex: 0, endIndex: 8 }],
        };

        const entity2: Entity = {
          id: 'entity-2',
          name: 'Acme Corp',
          type: 'ORGANIZATION',
          aliases: [],
          properties: {},
          confidence: 0.85,
          sourceChunkId: 'chunk-1',
          mentions: [{ text: 'Acme Corp', startIndex: 20, endIndex: 29 }],
        };

        tracker.trackEntity(entity1);
        tracker.trackEntity(entity2);

        const chain = tracker.buildChain('test query', Date.now());
        expect(chain.extractedEntities).toHaveLength(2);
      });
    });

    describe('trackTriplet', () => {
      it('tracks triplet and creates graph edge', () => {
        const subject: Entity = {
          id: 'entity-1',
          name: 'John Doe',
          type: 'PERSON',
          aliases: [],
          properties: {},
          confidence: 0.9,
          sourceChunkId: 'chunk-1',
          mentions: [{ text: 'John Doe', startIndex: 0, endIndex: 8 }],
        };

        const object: Entity = {
          id: 'entity-2',
          name: 'Acme Corp',
          type: 'ORGANIZATION',
          aliases: [],
          properties: {},
          confidence: 0.85,
          sourceChunkId: 'chunk-1',
          mentions: [{ text: 'Acme Corp', startIndex: 20, endIndex: 29 }],
        };

        const triplet: Triplet = {
          subject,
          predicate: {
            type: 'WORKS_FOR',
            properties: {},
            confidence: 0.88,
          },
          object,
          sourceChunkId: 'chunk-1',
          confidence: 0.88,
        };

        tracker.trackTriplet(triplet);

        const chain = tracker.buildChain('test query', Date.now());
        expect(chain.graphPath).toHaveLength(1);
        expect(chain.graphPath[0]).toEqual({
          sourceId: 'entity-1',
          targetId: 'entity-2',
          type: 'WORKS_FOR',
          weight: 0.88,
        });
      });

      it('tracks multiple triplets', () => {
        const entity1: Entity = {
          id: 'entity-1',
          name: 'John Doe',
          type: 'PERSON',
          aliases: [],
          properties: {},
          confidence: 0.9,
          sourceChunkId: 'chunk-1',
          mentions: [{ text: 'John', startIndex: 0, endIndex: 4 }],
        };

        const entity2: Entity = {
          id: 'entity-2',
          name: 'Acme Corp',
          type: 'ORGANIZATION',
          aliases: [],
          properties: {},
          confidence: 0.85,
          sourceChunkId: 'chunk-1',
          mentions: [{ text: 'Acme', startIndex: 10, endIndex: 14 }],
        };

        const entity3: Entity = {
          id: 'entity-3',
          name: 'New York',
          type: 'LOCATION',
          aliases: [],
          properties: {},
          confidence: 0.92,
          sourceChunkId: 'chunk-1',
          mentions: [{ text: 'New York', startIndex: 20, endIndex: 28 }],
        };

        const triplet1: Triplet = {
          subject: entity1,
          predicate: { type: 'WORKS_FOR', properties: {}, confidence: 0.88 },
          object: entity2,
          sourceChunkId: 'chunk-1',
          confidence: 0.88,
        };

        const triplet2: Triplet = {
          subject: entity2,
          predicate: { type: 'LOCATED_IN', properties: {}, confidence: 0.9 },
          object: entity3,
          sourceChunkId: 'chunk-1',
          confidence: 0.9,
        };

        tracker.trackTriplet(triplet1);
        tracker.trackTriplet(triplet2);

        const chain = tracker.buildChain('test query', Date.now());
        expect(chain.graphPath).toHaveLength(2);
      });
    });

    describe('getCitations', () => {
      it('generates citations from entity mentions', () => {
        const chunk = createTextNode('John Doe works at Acme Corp', {
          chunk_index: 0,
          start_index: 0,
          startCharIdx: 0,
          doc_id: 'doc-1',
          doc_path: '/path/to/doc.txt',
        });

        const entity: Entity = {
          id: 'entity-1',
          name: 'John Doe',
          type: 'PERSON',
          aliases: [],
          properties: {},
          confidence: 0.9,
          sourceChunkId: chunk.id,
          mentions: [
            {
              text: 'John Doe',
              startIndex: 0,
              endIndex: 8,
              confidence: 0.95,
            },
          ],
        };

        tracker.trackChunk(chunk);
        tracker.trackEntity(entity);

        const citations = tracker.getCitations('entity-1');

        expect(citations).toHaveLength(1);
        expect(citations[0]).toMatchObject({
          id: 'entity-1-citation-0',
          sourceDocument: {
            id: 'doc-1',
            path: '/path/to/doc.txt',
          },
          chunk: {
            id: chunk.id,
            startIndex: 0,
            endIndex: 8,
            text: 'John Doe',
          },
          entity: {
            id: 'entity-1',
            name: 'John Doe',
            type: 'PERSON',
          },
          confidence: 0.855, // 0.9 * 0.95
        });
      });

      it('generates multiple citations for multiple mentions', () => {
        const chunk = createTextNode(
          'John Doe is a developer. John is skilled at TypeScript.',
          {
            chunk_index: 0,
            start_index: 0,
            startCharIdx: 100,
            doc_id: 'doc-1',
          }
        );

        const entity: Entity = {
          id: 'entity-1',
          name: 'John Doe',
          type: 'PERSON',
          aliases: ['John'],
          properties: {},
          confidence: 0.9,
          sourceChunkId: chunk.id,
          mentions: [
            { text: 'John Doe', startIndex: 0, endIndex: 8 },
            { text: 'John', startIndex: 25, endIndex: 29 },
          ],
        };

        tracker.trackChunk(chunk);
        tracker.trackEntity(entity);

        const citations = tracker.getCitations('entity-1');

        expect(citations).toHaveLength(2);
        expect(citations[0].chunk.text).toBe('John Doe');
        expect(citations[1].chunk.text).toBe('John');
        // Verify offset from chunk startCharIdx
        expect(citations[0].chunk.startIndex).toBe(100);
        expect(citations[1].chunk.startIndex).toBe(125);
      });

      it('returns empty array for non-existent entity', () => {
        const citations = tracker.getCitations('non-existent');
        expect(citations).toEqual([]);
      });

      it('returns empty array when chunk not tracked', () => {
        const entity: Entity = {
          id: 'entity-1',
          name: 'John Doe',
          type: 'PERSON',
          aliases: [],
          properties: {},
          confidence: 0.9,
          sourceChunkId: 'missing-chunk',
          mentions: [{ text: 'John Doe', startIndex: 0, endIndex: 8 }],
        };

        tracker.trackEntity(entity);

        const citations = tracker.getCitations('entity-1');
        expect(citations).toEqual([]);
      });

      it('handles missing startCharIdx in chunk metadata', () => {
        const chunk = createTextNode('John Doe works here', {
          chunk_index: 0,
          start_index: 0,
          doc_id: 'doc-1',
        });

        const entity: Entity = {
          id: 'entity-1',
          name: 'John Doe',
          type: 'PERSON',
          aliases: [],
          properties: {},
          confidence: 0.9,
          sourceChunkId: chunk.id,
          mentions: [{ text: 'John Doe', startIndex: 0, endIndex: 8 }],
        };

        tracker.trackChunk(chunk);
        tracker.trackEntity(entity);

        const citations = tracker.getCitations('entity-1');

        expect(citations).toHaveLength(1);
        expect(citations[0].chunk.startIndex).toBe(0);
      });

      it('calculates confidence correctly with mention confidence', () => {
        const chunk = createTextNode('text', {
          chunk_index: 0,
          start_index: 0,
          doc_id: 'doc-1',
        });

        const entity: Entity = {
          id: 'entity-1',
          name: 'Test',
          type: 'PERSON',
          aliases: [],
          properties: {},
          confidence: 0.8,
          sourceChunkId: chunk.id,
          mentions: [{ text: 'Test', startIndex: 0, endIndex: 4, confidence: 0.9 }],
        };

        tracker.trackChunk(chunk);
        tracker.trackEntity(entity);

        const citations = tracker.getCitations('entity-1');
        expect(citations[0].confidence).toBeCloseTo(0.72, 10); // 0.8 * 0.9
      });

      it('uses entity confidence when mention has no confidence', () => {
        const chunk = createTextNode('text', {
          chunk_index: 0,
          start_index: 0,
          doc_id: 'doc-1',
        });

        const entity: Entity = {
          id: 'entity-1',
          name: 'Test',
          type: 'PERSON',
          aliases: [],
          properties: {},
          confidence: 0.85,
          sourceChunkId: chunk.id,
          mentions: [{ text: 'Test', startIndex: 0, endIndex: 4 }],
        };

        tracker.trackChunk(chunk);
        tracker.trackEntity(entity);

        const citations = tracker.getCitations('entity-1');
        expect(citations[0].confidence).toBe(0.85);
      });
    });

    describe('buildChain', () => {
      it('builds complete provenance chain', () => {
        const startTime = Date.now();

        const chunk = createTextNode('John Doe works at Acme Corp in New York', {
          chunk_index: 0,
          start_index: 0,
          doc_id: 'doc-1',
        });

        const entity1: Entity = {
          id: 'entity-1',
          name: 'John Doe',
          type: 'PERSON',
          aliases: [],
          properties: {},
          confidence: 0.9,
          sourceChunkId: chunk.id,
          mentions: [{ text: 'John Doe', startIndex: 0, endIndex: 8 }],
        };

        const entity2: Entity = {
          id: 'entity-2',
          name: 'Acme Corp',
          type: 'ORGANIZATION',
          aliases: [],
          properties: {},
          confidence: 0.85,
          sourceChunkId: chunk.id,
          mentions: [{ text: 'Acme Corp', startIndex: 18, endIndex: 27 }],
        };

        tracker.trackChunk(chunk);
        tracker.trackEntity(entity1);
        tracker.trackEntity(entity2);

        const triplet: Triplet = {
          subject: entity1,
          predicate: { type: 'WORKS_FOR', properties: {}, confidence: 0.88 },
          object: entity2,
          sourceChunkId: chunk.id,
          confidence: 0.88,
        };

        tracker.trackTriplet(triplet);

        const chain = tracker.buildChain('test query', startTime);

        expect(chain.query).toBe('test query');
        expect(chain.retrievedChunks).toHaveLength(1);
        expect(chain.extractedEntities).toHaveLength(2);
        expect(chain.graphPath).toHaveLength(1);
        expect(chain.citations).toHaveLength(2); // One citation per entity
        expect(chain.processingTimeMs).toBeGreaterThanOrEqual(0);
        expect(chain.createdAt).toBeTruthy();
      });

      it('handles empty tracking data', () => {
        const startTime = Date.now();
        const chain = tracker.buildChain('empty query', startTime);

        expect(chain.query).toBe('empty query');
        expect(chain.retrievedChunks).toEqual([]);
        expect(chain.extractedEntities).toEqual([]);
        expect(chain.graphPath).toEqual([]);
        expect(chain.citations).toEqual([]);
      });

      it('calculates processing time correctly', () => {
        const startTime = Date.now() - 500; // 500ms ago
        const chain = tracker.buildChain('query', startTime);

        expect(chain.processingTimeMs).toBeGreaterThanOrEqual(500);
        expect(chain.processingTimeMs).toBeLessThan(600);
      });

      it('validates chain against schema', () => {
        const startTime = Date.now();

        const chunk = createTextNode('text', {
          chunk_index: 0,
          start_index: 0,
          doc_id: 'doc-1',
        });

        tracker.trackChunk(chunk);

        const chain = tracker.buildChain('query', startTime);

        expect(() => ProvenanceChainSchema.parse(chain)).not.toThrow();
      });
    });

    describe('clear', () => {
      it('clears all tracked data', () => {
        const chunk = createTextNode('text', {
          chunk_index: 0,
          start_index: 0,
          doc_id: 'doc-1',
        });

        const entity: Entity = {
          id: 'entity-1',
          name: 'Test',
          type: 'PERSON',
          aliases: [],
          properties: {},
          confidence: 0.9,
          sourceChunkId: chunk.id,
          mentions: [{ text: 'Test', startIndex: 0, endIndex: 4 }],
        };

        tracker.trackChunk(chunk);
        tracker.trackEntity(entity);

        tracker.clear();

        const chain = tracker.buildChain('query', Date.now());
        expect(chain.retrievedChunks).toEqual([]);
        expect(chain.extractedEntities).toEqual([]);
        expect(chain.graphPath).toEqual([]);
        expect(chain.citations).toEqual([]);
      });

      it('allows tracking after clear', () => {
        const chunk1 = createTextNode('text 1', {
          chunk_index: 0,
          start_index: 0,
          doc_id: 'doc-1',
        });

        tracker.trackChunk(chunk1);
        tracker.clear();

        const chunk2 = createTextNode('text 2', {
          chunk_index: 0,
          start_index: 0,
          doc_id: 'doc-2',
        });

        tracker.trackChunk(chunk2);

        const chain = tracker.buildChain('query', Date.now());
        expect(chain.retrievedChunks).toHaveLength(1);
        expect(chain.retrievedChunks[0].text).toBe('text 2');
      });
    });
  });
});
