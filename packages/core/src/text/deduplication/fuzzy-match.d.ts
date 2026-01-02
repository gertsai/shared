/**
 * @fileoverview Fuzzy match deduplication strategy using string similarity algorithms.
 * Implements Jaro-Winkler and Levenshtein distance for entity matching.
 *
 * @module @gerts/core/text/deduplication
 * @since Phase 23
 */
import { IDeduplicationStrategy, DuplicateGroup } from './strategy';
import { Entity } from '../extraction/schemas';
/**
 * Configuration for fuzzy match deduplication.
 *
 * @example
 * ```typescript
 * const config: FuzzyMatchConfig = {
 *   threshold: 0.85,
 *   algorithm: 'jaro-winkler'
 * };
 * ```
 */
export interface FuzzyMatchConfig {
    /**
     * Minimum similarity threshold for considering entities as duplicates.
     * Range: 0.0 (no similarity) to 1.0 (exact match).
     *
     * Recommended values:
     * - 0.85-0.95 for high precision (fewer false positives)
     * - 0.70-0.85 for balanced precision/recall
     * - Below 0.70 may produce many false positives
     *
     * @default 0.85
     */
    threshold: number;
    /**
     * String similarity algorithm to use.
     *
     * - 'levenshtein': Edit distance based (insertions, deletions, substitutions)
     *   - Good for catching typos and minor variations
     *   - Normalized to [0,1] by dividing by max string length
     *
     * - 'jaro-winkler': Position-based similarity with prefix bonus
     *   - Better for names (rewards common prefixes)
     *   - More lenient with character position changes
     *   - Industry standard for person/organization name matching
     *
     * @default 'jaro-winkler'
     */
    algorithm: 'levenshtein' | 'jaro-winkler';
}
/**
 * FuzzyMatchDeduplication - String similarity-based entity deduplication.
 *
 * Uses Jaro-Winkler or Levenshtein distance to find similar entity names.
 * Ideal for catching typos, abbreviations, and name variations.
 *
 * @example
 * ```typescript
 * const dedup = new FuzzyMatchDeduplication({
 *   threshold: 0.85,
 *   algorithm: 'jaro-winkler'
 * });
 *
 * const entities = [
 *   { name: 'John Smith', type: 'PERSON', ... },
 *   { name: 'J. Smith', type: 'PERSON', ... },
 *   { name: 'Jon Smith', type: 'PERSON', ... }
 * ];
 *
 * const groups = await dedup.findDuplicates(entities);
 * // Returns groups of similar entities based on name similarity
 *
 * const merged = dedup.merge(groups[0]);
 * // Returns single entity with combined data from all duplicates
 * ```
 *
 * @remarks
 * - Only compares entities of the same type (PERSON with PERSON, etc.)
 * - Uses case-insensitive comparison
 * - Optimized O(n²) pairwise comparison
 * - For large datasets (>10k entities), consider embedding-based deduplication
 */
export declare class FuzzyMatchDeduplication implements IDeduplicationStrategy {
    readonly name = "fuzzy-match";
    private readonly config;
    /**
     * Creates a new fuzzy match deduplication strategy.
     *
     * @param config - Configuration options (threshold and algorithm)
     */
    constructor(config?: Partial<FuzzyMatchConfig>);
    /**
     * Find duplicate entities using fuzzy string matching.
     *
     * Algorithm:
     * 1. Combine new entities and existing entities
     * 2. For each unprocessed entity, compare with all other unprocessed entities
     * 3. Calculate similarity score using configured algorithm
     * 4. If similarity >= threshold and types match, add to duplicate group
     * 5. Mark all entities in group as processed
     * 6. Return groups with 2+ entities
     *
     * Time complexity: O(n²) where n is total number of entities
     * Space complexity: O(n) for tracking processed entities
     *
     * @param entities - New entities to deduplicate among themselves
     * @param existing - Optional existing entities to check against
     * @returns Promise resolving to array of duplicate groups
     */
    findDuplicates(entities: Entity[], existing?: Entity[]): Promise<DuplicateGroup[]>;
    /**
     * Merge a duplicate group into a single canonical entity.
     *
     * Merging strategy:
     * 1. Use first entity as base (canonical)
     * 2. Combine all mentions from all duplicates (preserves provenance)
     * 3. Deduplicate aliases (all entity names become aliases)
     * 4. Take maximum confidence score across all duplicates
     * 5. Merge properties (later values overwrite earlier ones)
     * 6. Combine all source chunk IDs for complete provenance
     *
     * @param group - Duplicate group to merge
     * @returns Merged canonical entity with combined data
     */
    merge(group: DuplicateGroup): Entity;
    /**
     * Calculate similarity between two strings using the configured algorithm.
     *
     * @param a - First string
     * @param b - Second string
     * @returns Similarity score in range [0, 1]
     */
    private calculateSimilarity;
    /**
     * Calculate Levenshtein similarity (1 - distance / maxLength).
     *
     * Levenshtein distance is the minimum number of single-character edits
     * (insertions, deletions, substitutions) required to change one string into another.
     * We normalize by max length to get a similarity score in [0, 1].
     *
     * @param a - First string
     * @param b - Second string
     * @returns Similarity score in range [0, 1]
     *
     * @example
     * ```typescript
     * levenshteinSimilarity('kitten', 'sitting')
     * // Distance: 3, MaxLen: 7, Similarity: 1 - 3/7 = 0.571
     * ```
     */
    private levenshteinSimilarity;
    /**
     * Calculate Levenshtein distance between two strings.
     *
     * Uses dynamic programming with a 2D matrix.
     * Time complexity: O(m * n) where m, n are string lengths
     * Space complexity: O(m * n)
     *
     * @param a - First string
     * @param b - Second string
     * @returns Edit distance (number of operations)
     */
    private levenshteinDistance;
    /**
     * Calculate Jaro-Winkler similarity between two strings.
     *
     * Jaro-Winkler is a variation of Jaro distance that gives more weight
     * to strings with common prefixes. This makes it particularly effective
     * for person names and organization names.
     *
     * Formula: JW = Jaro + (prefixLen * p * (1 - Jaro))
     * Where:
     * - prefixLen = length of common prefix (max 4)
     * - p = scaling factor (0.1)
     *
     * @param a - First string
     * @param b - Second string
     * @returns Similarity score in range [0, 1]
     *
     * @example
     * ```typescript
     * jaroWinkler('Martha', 'Marhta')
     * // High score due to common prefix 'Mar'
     *
     * jaroWinkler('Dixon', 'Dicksonx')
     * // Lower score despite similar characters due to different prefix
     * ```
     */
    private jaroWinkler;
    /**
     * Calculate Jaro similarity between two strings.
     *
     * Jaro similarity considers:
     * 1. Number of matching characters
     * 2. Number of transpositions (matching chars in wrong order)
     * 3. Relative positions of matching characters
     *
     * Formula: Jaro = 1/3 * (m/|a| + m/|b| + (m-t)/m)
     * Where:
     * - m = number of matching characters
     * - t = number of transpositions / 2
     * - |a|, |b| = string lengths
     *
     * @param a - First string
     * @param b - Second string
     * @returns Similarity score in range [0, 1]
     */
    private jaroSimilarity;
    /**
     * Get the length of the common prefix between two strings.
     *
     * @param a - First string
     * @param b - Second string
     * @param maxLength - Maximum prefix length to check (typically 4 for Jaro-Winkler)
     * @returns Number of matching characters at the beginning
     *
     * @example
     * ```typescript
     * commonPrefixLength('Martha', 'Marhta', 4) // Returns 3 ('Mar')
     * commonPrefixLength('Dixon', 'Vixen', 4)   // Returns 0
     * ```
     */
    private commonPrefixLength;
    /**
     * Calculate average pairwise similarity for entities in a group.
     *
     * Used to compute the overall match score for a duplicate group.
     * Compares every pair of entities and averages the similarity scores.
     *
     * @param entities - Array of entities to compare
     * @returns Average similarity score
     */
    private averageSimilarity;
}
