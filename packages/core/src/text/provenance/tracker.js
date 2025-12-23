/**
 * ProvenanceTracker - tracks extraction provenance.
 * Enables transparent citation from extracted entities back to source chunks.
 */
export class ProvenanceTracker {
    chunks = new Map();
    entities = new Map();
    triplets = [];
    graphPath = [];
    /**
     * Track a chunk being processed.
     */
    trackChunk(chunk) {
        this.chunks.set(chunk.id, chunk);
    }
    /**
     * Track an extracted entity.
     */
    trackEntity(entity) {
        this.entities.set(entity.id, entity);
    }
    /**
     * Track an extracted triplet.
     */
    trackTriplet(triplet) {
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
    getCitations(entityId) {
        const entity = this.entities.get(entityId);
        if (!entity)
            return [];
        const chunk = this.chunks.get(entity.sourceChunkId);
        if (!chunk)
            return [];
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
    buildChain(query, startTime) {
        const allCitations = [];
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
    clear() {
        this.chunks.clear();
        this.entities.clear();
        this.triplets = [];
        this.graphPath = [];
    }
}
