/**
 * @fileoverview Deduplication strategy interface for entity deduplication.
 * Provides abstract interface for different deduplication approaches (exact, fuzzy, embedding, LLM).
 *
 * @module @gertsai/core/text/deduplication
 * @since Phase 23
 */

import { Entity } from '../extraction/schemas';

/**
 * Match method used for entity deduplication.
 * Indicates the algorithm/strategy used to identify duplicates.
 */
export type MatchMethod = 'exact' | 'fuzzy' | 'embedding' | 'llm';

/**
 * DuplicateGroup - represents a group of duplicate entities that should be merged.
 *
 * The canonical entity is the representative entity after merging,
 * while duplicates contains all original entities that were identified as duplicates.
 *
 * @example
 * ```typescript
 * const group: DuplicateGroup = {
 *   canonical: { name: 'John Smith', ... },
 *   duplicates: [
 *     { name: 'John Smith', ... },
 *     { name: 'J. Smith', ... },
 *     { name: 'John A. Smith', ... }
 *   ],
 *   matchScore: 0.92,
 *   matchMethod: 'fuzzy',
 *   metadata: { algorithm: 'jaro-winkler', threshold: 0.85 }
 * };
 * ```
 */
export interface DuplicateGroup {
  /**
   * Canonical entity (merged result).
   * This is the representative entity that will be used in the knowledge graph.
   */
  canonical: Entity;

  /**
   * Original entities that were identified as duplicates.
   * Includes the canonical entity plus all its duplicates.
   * Minimum length is 2 (canonical + at least one duplicate).
   */
  duplicates: Entity[];

  /**
   * Match score indicating confidence that these entities are duplicates.
   * Range: 0.0 (no match) to 1.0 (perfect match).
   *
   * For exact matches, this is typically 1.0.
   * For fuzzy/embedding matches, this represents similarity score.
   */
  matchScore: number;

  /**
   * Method used for identifying duplicates.
   * - 'exact': Exact string matching (case-insensitive)
   * - 'fuzzy': String similarity algorithms (Levenshtein, Jaro-Winkler)
   * - 'embedding': Semantic similarity using vector embeddings
   * - 'llm': LLM-based verification
   */
  matchMethod: MatchMethod;

  /**
   * Optional metadata about the deduplication process.
   * Can include algorithm-specific details, configuration, or debug info.
   *
   * @example
   * ```typescript
   * metadata: {
   *   algorithm: 'jaro-winkler',
   *   threshold: 0.85,
   *   processingTimeMs: 123,
   *   pairwiseScores: { 'id1-id2': 0.92, 'id1-id3': 0.88 }
   * }
   * ```
   */
  metadata?: Record<string, unknown>;
}

/**
 * IDeduplicationStrategy - interface for entity deduplication strategies.
 *
 * Implementations can use different algorithms:
 * - Exact match: O(n) string comparison
 * - Fuzzy match: String similarity (Levenshtein, Jaro-Winkler)
 * - Embedding match: Cosine similarity on entity embeddings
 * - LLM verification: LLM-based duplicate detection
 *
 * @example
 * ```typescript
 * class ExactMatchDeduplication implements IDeduplicationStrategy {
 *   readonly name = 'exact-match';
 *
 *   async findDuplicates(entities: Entity[]): Promise<DuplicateGroup[]> {
 *     // Group by normalized name
 *     const groups = new Map<string, Entity[]>();
 *     for (const entity of entities) {
 *       const key = `${entity.type}:${entity.name.toLowerCase().trim()}`;
 *       if (!groups.has(key)) groups.set(key, []);
 *       groups.get(key)!.push(entity);
 *     }
 *
 *     // Return groups with 2+ entities
 *     return Array.from(groups.values())
 *       .filter(group => group.length > 1)
 *       .map(duplicates => ({
 *         canonical: duplicates[0],
 *         duplicates,
 *         matchScore: 1.0,
 *         matchMethod: 'exact'
 *       }));
 *   }
 *
 *   merge(group: DuplicateGroup): Entity {
 *     // Merge all mentions, aliases, properties
 *     return { ...group.canonical, ... };
 *   }
 * }
 * ```
 */
export interface IDeduplicationStrategy {
  /**
   * Strategy name for identification and logging.
   * Should be unique across all deduplication strategies.
   *
   * @example 'exact-match', 'fuzzy-jaro-winkler', 'embedding-cosine'
   */
  readonly name: string;

  /**
   * Find duplicate entities and group them together.
   *
   * This method should:
   * 1. Compare entities to find duplicates
   * 2. Group duplicates together
   * 3. Calculate match scores
   * 4. Return DuplicateGroups with canonical + duplicates
   *
   * @param entities - New entities to deduplicate among themselves
   * @param existing - Optional existing entities to check against (for incremental deduplication)
   * @returns Promise resolving to array of duplicate groups
   *
   * @remarks
   * - If `existing` is provided, should find duplicates between `entities` and `existing`,
   *   as well as within `entities` themselves
   * - Should only return groups with 2+ entities
   * - Entities should only appear in one group (no overlapping groups)
   * - Match scores should be in range [0, 1]
   *
   * @example
   * ```typescript
   * const newEntities = [
   *   { name: 'John Smith', type: 'PERSON', ... },
   *   { name: 'J. Smith', type: 'PERSON', ... }
   * ];
   *
   * const existingEntities = [
   *   { name: 'John A. Smith', type: 'PERSON', ... }
   * ];
   *
   * const groups = await strategy.findDuplicates(newEntities, existingEntities);
   * // Returns: [{ canonical: ..., duplicates: [all 3 entities], matchScore: 0.92, ... }]
   * ```
   */
  findDuplicates(entities: Entity[], existing?: Entity[]): Promise<DuplicateGroup[]>;

  /**
   * Merge a duplicate group into a single canonical entity.
   *
   * This method should:
   * 1. Choose or create a canonical entity (typically first in group)
   * 2. Merge all mentions from duplicates
   * 3. Combine aliases (deduplicated)
   * 4. Merge properties (last write wins or custom logic)
   * 5. Take highest confidence score
   * 6. Optionally merge embeddings (average, weighted, etc.)
   *
   * @param group - Duplicate group to merge
   * @returns Merged canonical entity with combined data from all duplicates
   *
   * @remarks
   * - Should preserve all mentions to maintain provenance
   * - Should deduplicate aliases (no duplicate names in array)
   * - Should prefer higher confidence values
   * - Should maintain all source chunk references
   *
   * @example
   * ```typescript
   * const merged = strategy.merge({
   *   canonical: entities[0],
   *   duplicates: [
   *     { name: 'John Smith', confidence: 0.9, mentions: [m1], aliases: ['J.S.'] },
   *     { name: 'J. Smith', confidence: 0.85, mentions: [m2], aliases: ['John'] }
   *   ],
   *   matchScore: 0.92,
   *   matchMethod: 'fuzzy'
   * });
   *
   * // Result: {
   * //   name: 'John Smith',
   * //   confidence: 0.9, // max
   * //   mentions: [m1, m2], // combined
   * //   aliases: ['J.S.', 'John', 'J. Smith'], // deduplicated
   * //   ...
   * // }
   * ```
   */
  merge(group: DuplicateGroup): Entity;
}
