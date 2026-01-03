"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingDeduplication = void 0;
/**
 * EmbeddingDeduplication - Semantic similarity via embeddings.
 * Uses cosine similarity to find entities with similar meanings.
 *
 * Advantages:
 * - Captures semantic similarity (e.g., "NYC" vs "New York City")
 * - Language-agnostic
 * - Handles synonyms and paraphrases
 *
 * Performance: O(n^2) comparisons, but embeddings are cached.
 */
class EmbeddingDeduplication {
    config;
    name = 'embedding-match';
    constructor(config) {
        this.config = config;
    }
    /**
     * Find duplicate entities using embedding similarity.
     * Only compares entities of the same type.
     */
    async findDuplicates(entities, existing = []) {
        const allEntities = [...entities, ...existing];
        // Embed all entities (use existing embeddings if available)
        const embeddings = await Promise.all(allEntities.map(async (e) => {
            if (e.embedding && e.embedding.length > 0) {
                return e.embedding;
            }
            return this.config.embed(e.name);
        }));
        // Store embeddings back on entities for reuse
        allEntities.forEach((e, i) => {
            e.embedding = embeddings[i];
        });
        // Find similar pairs using cosine similarity
        const groups = [];
        const processed = new Set();
        for (let i = 0; i < allEntities.length; i++) {
            if (processed.has(allEntities[i].id))
                continue;
            const duplicates = [allEntities[i]];
            processed.add(allEntities[i].id);
            for (let j = i + 1; j < allEntities.length; j++) {
                if (processed.has(allEntities[j].id))
                    continue;
                // Only compare same type entities
                if (allEntities[i].type !== allEntities[j].type)
                    continue;
                const similarity = this.cosineSimilarity(embeddings[i], embeddings[j]);
                if (similarity >= this.config.threshold) {
                    duplicates.push(allEntities[j]);
                    processed.add(allEntities[j].id);
                }
            }
            if (duplicates.length > 1) {
                const duplicateIndices = duplicates.map((dup) => allEntities.indexOf(dup));
                const duplicateEmbeddings = duplicateIndices.map((idx) => embeddings[idx]);
                groups.push({
                    canonical: duplicates[0],
                    duplicates,
                    matchScore: this.averageCosineSimilarity(duplicateEmbeddings),
                    matchMethod: 'embedding',
                });
            }
        }
        return groups;
    }
    /**
     * Merge duplicate entities.
     * Combines mentions, aliases, properties, and averages embeddings.
     */
    merge(group) {
        const { duplicates } = group;
        // Merge all mentions
        const allMentions = duplicates.flatMap((e) => e.mentions);
        // Merge all aliases (including all entity names)
        const allAliases = new Set(duplicates.flatMap((e) => [e.name, ...e.aliases]));
        // Take highest confidence
        const maxConfidence = Math.max(...duplicates.map((e) => e.confidence));
        // Merge properties (later entities overwrite earlier ones)
        const mergedProperties = duplicates.reduce((acc, e) => ({ ...acc, ...e.properties }), {});
        // Average embeddings from all duplicates
        const validEmbeddings = duplicates
            .map((e) => e.embedding)
            .filter((emb) => emb !== undefined && emb.length > 0);
        const avgEmbedding = this.averageEmbedding(validEmbeddings);
        return {
            ...duplicates[0],
            aliases: Array.from(allAliases).filter((a) => a !== duplicates[0].name),
            confidence: maxConfidence,
            mentions: allMentions,
            properties: mergedProperties,
            embedding: avgEmbedding,
        };
    }
    /**
     * Calculate cosine similarity between two vectors.
     * Returns value between -1 (opposite) and 1 (identical).
     *
     * Formula: cos(θ) = (A · B) / (||A|| * ||B||)
     */
    cosineSimilarity(a, b) {
        if (a.length !== b.length) {
            throw new Error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
        }
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        // Handle zero vectors
        if (denominator === 0) {
            return 0;
        }
        return dotProduct / denominator;
    }
    /**
     * Calculate average cosine similarity across all pairs in a group.
     * Used as the match score for duplicate groups.
     */
    averageCosineSimilarity(embeddings) {
        if (embeddings.length <= 1)
            return 1;
        let totalSimilarity = 0;
        let comparisons = 0;
        for (let i = 0; i < embeddings.length; i++) {
            for (let j = i + 1; j < embeddings.length; j++) {
                totalSimilarity += this.cosineSimilarity(embeddings[i], embeddings[j]);
                comparisons++;
            }
        }
        return totalSimilarity / comparisons;
    }
    /**
     * Average multiple embedding vectors.
     * Used to create a canonical embedding for merged entities.
     *
     * @param embeddings Array of embedding vectors
     * @returns Average embedding vector
     */
    averageEmbedding(embeddings) {
        if (embeddings.length === 0)
            return [];
        if (embeddings.length === 1)
            return embeddings[0];
        const dimension = embeddings[0].length;
        const result = new Array(dimension).fill(0);
        // Sum all embeddings
        for (const embedding of embeddings) {
            if (embedding.length !== dimension) {
                throw new Error(`Embedding dimension mismatch: expected ${dimension}, got ${embedding.length}`);
            }
            for (let i = 0; i < dimension; i++) {
                result[i] += embedding[i];
            }
        }
        // Divide by count to get average
        return result.map((v) => v / embeddings.length);
    }
}
exports.EmbeddingDeduplication = EmbeddingDeduplication;
//# sourceMappingURL=embedding-match.js.map