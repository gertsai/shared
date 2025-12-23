import { ProvenanceChain } from './provenance-chain';
import { Citation } from './citation';
import { TextNode } from '../nodes/text-node';
import { Entity, Triplet } from '../extraction/types';
/**
 * ProvenanceTracker - tracks extraction provenance.
 * Enables transparent citation from extracted entities back to source chunks.
 */
export declare class ProvenanceTracker {
    private chunks;
    private entities;
    private triplets;
    private graphPath;
    /**
     * Track a chunk being processed.
     */
    trackChunk(chunk: TextNode): void;
    /**
     * Track an extracted entity.
     */
    trackEntity(entity: Entity): void;
    /**
     * Track an extracted triplet.
     */
    trackTriplet(triplet: Triplet): void;
    /**
     * Get citations for an entity.
     * Converts entity mentions into citations with source chunk info.
     */
    getCitations(entityId: string): Citation[];
    /**
     * Build complete provenance chain for a query.
     */
    buildChain(query: string, startTime: number): ProvenanceChain;
    /**
     * Clear tracked data.
     */
    clear(): void;
}
//# sourceMappingURL=tracker.d.ts.map