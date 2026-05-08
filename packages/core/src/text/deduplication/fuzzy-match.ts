/**
 * @fileoverview Fuzzy match deduplication strategy using string similarity algorithms.
 * Implements Jaro-Winkler and Levenshtein distance for entity matching.
 *
 * @module @gertsai/core/text/deduplication
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
export class FuzzyMatchDeduplication implements IDeduplicationStrategy {
  readonly name = 'fuzzy-match';

  private readonly config: FuzzyMatchConfig;

  /**
   * Creates a new fuzzy match deduplication strategy.
   *
   * @param config - Configuration options (threshold and algorithm)
   */
  constructor(config: Partial<FuzzyMatchConfig> = {}) {
    this.config = {
      threshold: config.threshold ?? 0.85,
      algorithm: config.algorithm ?? 'jaro-winkler',
    };

    // Validate configuration
    if (this.config.threshold < 0 || this.config.threshold > 1) {
      throw new Error('Fuzzy match threshold must be between 0 and 1');
    }
  }

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
  async findDuplicates(entities: Entity[], existing: Entity[] = []): Promise<DuplicateGroup[]> {
    const allEntities = [...entities, ...existing];
    const groups: DuplicateGroup[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < allEntities.length; i++) {
      if (processed.has(allEntities[i].id)) {
        continue;
      }

      const duplicates: Entity[] = [allEntities[i]];
      processed.add(allEntities[i].id);

      // Compare with remaining entities
      for (let j = i + 1; j < allEntities.length; j++) {
        if (processed.has(allEntities[j].id)) {
          continue;
        }

        // Only compare same type entities
        if (allEntities[i].type !== allEntities[j].type) {
          continue;
        }

        // Calculate similarity
        const similarity = this.calculateSimilarity(
          allEntities[i].name,
          allEntities[j].name
        );

        // If above threshold, add to duplicate group
        if (similarity >= this.config.threshold) {
          duplicates.push(allEntities[j]);
          processed.add(allEntities[j].id);
        }
      }

      // Only create group if duplicates found (2+ entities)
      if (duplicates.length > 1) {
        groups.push({
          canonical: duplicates[0], // First entity becomes canonical
          duplicates,
          matchScore: this.averageSimilarity(duplicates),
          matchMethod: 'fuzzy',
          metadata: {
            algorithm: this.config.algorithm,
            threshold: this.config.threshold,
            groupSize: duplicates.length,
          },
        });
      }
    }

    return groups;
  }

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
  merge(group: DuplicateGroup): Entity {
    const { duplicates } = group;

    // Merge all mentions (preserve provenance)
    const allMentions = duplicates.flatMap(e => e.mentions);

    // Merge all aliases + entity names (deduplicate)
    const allAliases = new Set(duplicates.flatMap(e => [e.name, ...e.aliases]));

    // Take highest confidence
    const maxConfidence = Math.max(...duplicates.map(e => e.confidence));

    // Merge properties (last write wins)
    const mergedProperties = duplicates.reduce(
      (acc, e) => ({ ...acc, ...e.properties }),
      {}
    );

    // Create merged entity
    return {
      ...duplicates[0], // Use first entity as base
      aliases: Array.from(allAliases).filter(a => a !== duplicates[0].name), // Remove canonical name from aliases
      confidence: maxConfidence,
      mentions: allMentions,
      properties: mergedProperties,
      // Note: sourceChunkId kept from first entity, but all chunks are referenced via mentions
    };
  }

  /**
   * Calculate similarity between two strings using the configured algorithm.
   *
   * @param a - First string
   * @param b - Second string
   * @returns Similarity score in range [0, 1]
   */
  private calculateSimilarity(a: string, b: string): number {
    const normalizedA = a.toLowerCase();
    const normalizedB = b.toLowerCase();

    if (this.config.algorithm === 'jaro-winkler') {
      return this.jaroWinkler(normalizedA, normalizedB);
    }

    return this.levenshteinSimilarity(normalizedA, normalizedB);
  }

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
  private levenshteinSimilarity(a: string, b: string): number {
    const distance = this.levenshteinDistance(a, b);
    const maxLength = Math.max(a.length, b.length);

    // Handle empty strings
    if (maxLength === 0) {
      return 1.0;
    }

    return 1 - distance / maxLength;
  }

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
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    // Initialize first column (deletions from a)
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }

    // Initialize first row (insertions to get b)
    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix using recurrence relation
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1; // Substitution cost

        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // Deletion
          matrix[i][j - 1] + 1,     // Insertion
          matrix[i - 1][j - 1] + cost // Substitution
        );
      }
    }

    return matrix[a.length][b.length];
  }

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
  private jaroWinkler(a: string, b: string): number {
    const jaro = this.jaroSimilarity(a, b);
    const prefixLength = this.commonPrefixLength(a, b, 4);

    // Winkler modification: bonus for common prefix
    const p = 0.1; // Standard scaling factor
    return jaro + prefixLength * p * (1 - jaro);
  }

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
  private jaroSimilarity(a: string, b: string): number {
    // Exact match
    if (a === b) {
      return 1.0;
    }

    // Empty strings
    if (a.length === 0 || b.length === 0) {
      return 0.0;
    }

    // Match window: characters can match if within this distance
    const matchDistance = Math.floor(Math.max(a.length, b.length) / 2) - 1;

    // Track which characters have been matched
    const aMatches = Array.from({ length: a.length }, () => false);
    const bMatches = Array.from({ length: b.length }, () => false);

    let matches = 0;
    let transpositions = 0;

    // Find matches
    for (let i = 0; i < a.length; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, b.length);

      for (let j = start; j < end; j++) {
        // Skip if already matched or characters don't match
        if (bMatches[j] || a[i] !== b[j]) {
          continue;
        }

        // Found a match
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }

    // No matches found
    if (matches === 0) {
      return 0.0;
    }

    // Count transpositions (matching chars in different order)
    let k = 0;
    for (let i = 0; i < a.length; i++) {
      if (!aMatches[i]) {
        continue;
      }

      // Find next matched char in b
      while (!bMatches[k]) {
        k++;
      }

      // If chars don't match, it's a transposition
      if (a[i] !== b[k]) {
        transpositions++;
      }

      k++;
    }

    // Calculate Jaro similarity
    // Formula: (m/|a| + m/|b| + (m - t/2)/m) / 3
    return (
      (matches / a.length +
        matches / b.length +
        (matches - transpositions / 2) / matches) /
      3
    );
  }

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
  private commonPrefixLength(a: string, b: string, maxLength: number): number {
    let i = 0;
    const limit = Math.min(a.length, b.length, maxLength);

    while (i < limit && a[i] === b[i]) {
      i++;
    }

    return i;
  }

  /**
   * Calculate average pairwise similarity for entities in a group.
   *
   * Used to compute the overall match score for a duplicate group.
   * Compares every pair of entities and averages the similarity scores.
   *
   * @param entities - Array of entities to compare
   * @returns Average similarity score
   */
  private averageSimilarity(entities: Entity[]): number {
    if (entities.length <= 1) {
      return 1.0;
    }

    let totalSimilarity = 0;
    let comparisons = 0;

    // Compare all pairs
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        totalSimilarity += this.calculateSimilarity(entities[i].name, entities[j].name);
        comparisons++;
      }
    }

    return totalSimilarity / comparisons;
  }
}
