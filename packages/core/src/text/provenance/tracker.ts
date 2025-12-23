import { ProvenanceChain } from './provenance-chain';
import { Citation } from './citation';
import { GraphEdge } from './provenance-chain';
import { TextNode } from '../nodes/text-node';
import { Entity, Triplet } from '../extraction/types';

/**
 * ProvenanceTracker - tracks extraction provenance.
 * Enables transparent citation from extracted entities back to source chunks.
 */
export class ProvenanceTracker {
  private chunks: Map<string, TextNode> = new Map();
  private entities: Map<string, Entity> = new Map();
  private triplets: Triplet[] = [];
  private graphPath: GraphEdge[] = [];

  /**
   * Track a chunk being processed.
   */
  trackChunk(chunk: TextNode): void {
    this.chunks.set(chunk.id, chunk);
  }

  /**
   * Track an extracted entity.
   */
  trackEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
  }

  /**
   * Track an extracted triplet.
   */
  trackTriplet(triplet: Triplet): void {
    this.triplets.push(triplet);

    // Add to graph path
    this.graphPath.push({
      sourceId: triplet.subject.id,
      targetId: triplet.object.id,
      type: triplet.predicate.type,
      weight: triplet.confidence,
    });
  }

  /**
   * Get citations for an entity.
   * Converts entity mentions into citations with source chunk info.
   */
  getCitations(entityId: string): Citation[] {
    const entity = this.entities.get(entityId);
    if (!entity) return [];

    const chunk = this.chunks.get(entity.sourceChunkId);
    if (!chunk) return [];

    return entity.mentions.map((mention, idx) => ({
      id: `${entityId}-citation-${idx}`,
      sourceDocument: {
        id: chunk.metadata.doc_id,
        path: chunk.metadata.doc_path,
      },
      chunk: {
        id: chunk.id,
        startIndex: mention.startIndex + (chunk.metadata.startCharIdx ?? 0),
        endIndex: mention.endIndex + (chunk.metadata.startCharIdx ?? 0),
        text: mention.text,
      },
      entity: {
        id: entity.id,
        name: entity.name,
        type: entity.type,
      },
      confidence: entity.confidence * (mention.confidence ?? 1),
    }));
  }

  /**
   * Build complete provenance chain for a query.
   */
  buildChain(query: string, startTime: number): ProvenanceChain {
    const allCitations: Citation[] = [];

    for (const entityId of this.entities.keys()) {
      allCitations.push(...this.getCitations(entityId));
    }

    return {
      query,
      retrievedChunks: Array.from(this.chunks.values()),
      extractedEntities: Array.from(this.entities.values()),
      graphPath: this.graphPath,
      citations: allCitations,
      createdAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Clear tracked data.
   */
  clear(): void {
    this.chunks.clear();
    this.entities.clear();
    this.triplets = [];
    this.graphPath = [];
  }
}
