import { IDeduplicationStrategy, DuplicateGroup } from './strategy';
import { Entity } from '../extraction/schemas';
/**
 * Configuration for embedding-based deduplication.
 */
export interface EmbeddingMatchConfig {
    /** Cosine similarity threshold (0-1) for considering entities as duplicates */
    threshold: number;
    /** Embedding function to convert text to vectors */
    embed: (text: string) => Promise<number[]>;
}
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
export declare class EmbeddingDeduplication implements IDeduplicationStrategy {
    private readonly config;
    readonly name = "embedding-match";
    constructor(config: EmbeddingMatchConfig);
    /**
     * Find duplicate entities using embedding similarity.
     * Only compares entities of the same type.
     */
    findDuplicates(entities: Entity[], existing?: Entity[]): Promise<DuplicateGroup[]>;
    /**
     * Merge duplicate entities.
     * Combines mentions, aliases, properties, and averages embeddings.
     */
    merge(group: DuplicateGroup): Entity;
    /**
     * Calculate cosine similarity between two vectors.
     * Returns value between -1 (opposite) and 1 (identical).
     *
     * Formula: cos(θ) = (A · B) / (||A|| * ||B||)
     */
    private cosineSimilarity;
    /**
     * Calculate average cosine similarity across all pairs in a group.
     * Used as the match score for duplicate groups.
     */
    private averageCosineSimilarity;
    /**
     * Average multiple embedding vectors.
     * Used to create a canonical embedding for merged entities.
     *
     * @param embeddings Array of embedding vectors
     * @returns Average embedding vector
     */
    private averageEmbedding;
}
//# sourceMappingURL=embedding-match.d.ts.map