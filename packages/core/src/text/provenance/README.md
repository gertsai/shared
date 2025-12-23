# Provenance System

## Overview

The Provenance System provides transparent citation tracking from extracted entities back to source documents. This enables explainable Graph RAG responses by maintaining a complete audit trail of where information originated.

## Features

- **Citation Tracking**: Link entities to exact text positions in source chunks
- **Provenance Chains**: Track complete path from query to final answer
- **Graph Edges**: Maintain relationships between entities in knowledge graph
- **Confidence Scores**: Propagate confidence through extraction pipeline
- **Multi-mention Support**: Track multiple occurrences of the same entity

## Components

### 1. Citation

Links an entity back to its source chunk with exact character positions.

```typescript
import { Citation, CitationSchema } from '@gerts/core/text';

const citation: Citation = {
  id: 'citation-1',
  sourceDocument: {
    id: 'doc-1',
    path: '/docs/example.txt',
    name: 'example.txt',
  },
  chunk: {
    id: 'chunk-1',
    startIndex: 0,
    endIndex: 8,
    text: 'John Doe',
  },
  entity: {
    id: 'entity-1',
    name: 'John Doe',
    type: 'PERSON',
  },
  confidence: 0.9,
};

// Validate with Zod schema
CitationSchema.parse(citation);
```

### 2. ProvenanceChain

Complete audit trail from query to answer, including all retrieved chunks, extracted entities, graph traversal path, and final citations.

```typescript
import { ProvenanceChain, ProvenanceChainSchema } from '@gerts/core/text';

const chain: ProvenanceChain = {
  query: 'Who works at Acme Corp?',
  retrievedChunks: [/* TextNode[] */],
  extractedEntities: [/* Entity[] */],
  graphPath: [/* GraphEdge[] */],
  citations: [/* Citation[] */],
  createdAt: new Date().toISOString(),
  processingTimeMs: 1500,
};

// Validate with Zod schema
ProvenanceChainSchema.parse(chain);
```

### 3. GraphEdge

Represents a relationship in the knowledge graph.

```typescript
import { GraphEdge, GraphEdgeSchema } from '@gerts/core/text';

const edge: GraphEdge = {
  sourceId: 'entity-1', // John Doe
  targetId: 'entity-2', // Acme Corp
  type: 'WORKS_FOR',
  weight: 0.88, // Confidence
};
```

### 4. ProvenanceTracker

Main class for tracking provenance during entity extraction.

```typescript
import { ProvenanceTracker } from '@gerts/core/text';
import { createTextNode } from '@gerts/core/text';

const tracker = new ProvenanceTracker();

// Track chunks being processed
const chunk = createTextNode('John Doe works at Acme Corp', {
  chunk_index: 0,
  start_index: 0,
  doc_id: 'doc-1',
  doc_path: '/docs/example.txt',
});
tracker.trackChunk(chunk);

// Track extracted entities
const entity = {
  id: 'entity-1',
  name: 'John Doe',
  type: 'PERSON',
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
tracker.trackEntity(entity);

// Track relationships
const triplet = {
  subject: entity1,
  predicate: {
    type: 'WORKS_FOR',
    confidence: 0.88,
  },
  object: entity2,
  sourceChunkId: chunk.id,
  confidence: 0.88,
};
tracker.trackTriplet(triplet);

// Get citations for specific entity
const citations = tracker.getCitations('entity-1');
console.log(citations);
// [{
//   id: 'entity-1-citation-0',
//   sourceDocument: { id: 'doc-1', path: '/docs/example.txt' },
//   chunk: { id: 'chunk-1', startIndex: 0, endIndex: 8, text: 'John Doe' },
//   entity: { id: 'entity-1', name: 'John Doe', type: 'PERSON' },
//   confidence: 0.855 // 0.9 * 0.95
// }]

// Build complete provenance chain
const startTime = Date.now();
// ... do extraction ...
const chain = tracker.buildChain('Who works at Acme Corp?', startTime);

// Clear for next query
tracker.clear();
```

## Usage Example

Complete extraction pipeline with provenance tracking:

```typescript
import {
  ProvenanceTracker,
  RecursiveCharacterTextSplitter,
  createTextNode,
} from '@gerts/core/text';

async function extractWithProvenance(document: string) {
  const startTime = Date.now();
  const tracker = new ProvenanceTracker();

  // Step 1: Split document into chunks
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512,
    chunkOverlap: 50,
  });

  const chunks = splitter.splitText(document, {
    doc_id: 'doc-1',
    doc_path: '/path/to/doc.txt',
  });

  // Track all chunks
  chunks.forEach((chunk) => tracker.trackChunk(chunk));

  // Step 2: Extract entities (using LLM or other method)
  for (const chunk of chunks) {
    const entities = await extractEntitiesFromChunk(chunk);
    entities.forEach((entity) => tracker.trackEntity(entity));
  }

  // Step 3: Extract relationships
  const triplets = await extractRelationships(chunks);
  triplets.forEach((triplet) => tracker.trackTriplet(triplet));

  // Step 4: Build provenance chain
  const chain = tracker.buildChain('extraction', startTime);

  // Now you have complete audit trail
  console.log(`Processed ${chain.retrievedChunks.length} chunks`);
  console.log(`Extracted ${chain.extractedEntities.length} entities`);
  console.log(`Found ${chain.graphPath.length} relationships`);
  console.log(`Generated ${chain.citations.length} citations`);
  console.log(`Processing time: ${chain.processingTimeMs}ms`);

  return chain;
}
```

## API Reference

### ProvenanceTracker

#### Methods

- `trackChunk(chunk: TextNode): void` - Track a chunk being processed
- `trackEntity(entity: Entity): void` - Track an extracted entity
- `trackTriplet(triplet: Triplet): void` - Track a relationship triplet
- `getCitations(entityId: string): Citation[]` - Get all citations for an entity
- `buildChain(query: string, startTime: number): ProvenanceChain` - Build complete provenance chain
- `clear(): void` - Clear all tracked data

### Schemas

All schemas are Zod schemas and can be used for validation:

- `CitationSchema` - Validates Citation objects
- `GraphEdgeSchema` - Validates GraphEdge objects
- `ProvenanceChainSchema` - Validates ProvenanceChain objects

## Integration with Phase 11 (Graph RAG)

The provenance system is designed to integrate seamlessly with the Graph RAG pipeline:

1. **Chunk Retrieval**: Track which chunks were retrieved for a query
2. **Entity Extraction**: Track which entities were extracted from chunks
3. **Graph Traversal**: Track the path through the knowledge graph
4. **Citation Generation**: Generate citations linking final answer to sources

This enables:

- **Transparency**: Users can see exactly where information came from
- **Verification**: Users can verify claims by checking source text
- **Debugging**: Developers can trace extraction pipeline issues
- **Compliance**: Maintain audit trail for regulatory requirements

## Performance Considerations

- Uses `Map` for O(1) chunk/entity lookup
- Citations generated on-demand
- Minimal memory overhead (stores references, not copies)
- Efficient for typical document sizes (1000s of chunks)

## Testing

Comprehensive test suite with 29 tests covering:

- Schema validation
- Chunk tracking
- Entity tracking
- Triplet tracking
- Citation generation
- Provenance chain building
- Edge cases and error handling

Run tests:
```bash
pnpm --filter @gerts/core test provenance
```
