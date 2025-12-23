/**
 * @fileoverview Exact match deduplication strategy for entity deduplication.
 * Provides O(n) exact name matching using normalized keys (type + lowercase name).
 *
 * @module @gerts/core/text/deduplication
 * @since Phase 23
 */
/**
 * ExactMatchDeduplication - O(n) exact name matching deduplication strategy.
 *
 * This strategy identifies duplicate entities by comparing normalized entity keys.
 * A normalized key is constructed from entity type and lowercase, trimmed name.
 *
 * **Algorithm**: O(n) time complexity using Map for grouping
 * - Single pass to group entities by normalized key
 * - Returns groups with matchScore = 1.0 (perfect match)
 * - Only considers entities with exact same type and name (case-insensitive)
 *
 * **Use Cases**:
 * - Fast deduplication for large entity sets
 * - First-pass deduplication before fuzzy/embedding strategies
 * - Known entity formats with consistent naming
 *
 * **Limitations**:
 * - Does not handle typos or variations (use FuzzyMatchDeduplication)
 * - Does not handle semantic similarity (use EmbeddingDeduplication)
 * - Case-insensitive but whitespace-sensitive after trim
 *
 * @example
 * ```typescript
 * const strategy = new ExactMatchDeduplication();
 *
 * const entities = [
 *   { name: 'John Smith', type: 'PERSON', id: '1', ... },
 *   { name: 'john smith', type: 'PERSON', id: '2', ... }, // duplicate
 *   { name: 'John Smith ', type: 'PERSON', id: '3', ... }, // duplicate (trailing space trimmed)
 *   { name: 'Jane Doe', type: 'PERSON', id: '4', ... },
 * ];
 *
 * const groups = await strategy.findDuplicates(entities);
 * // Returns 1 group with 3 'John Smith' entities
 *
 * const merged = strategy.merge(groups[0]);
 * // Returns single entity with combined mentions, aliases, highest confidence
 * ```
 *
 * @example Incremental deduplication with existing entities
 * ```typescript
 * const newEntities = [
 *   { name: 'John Smith', type: 'PERSON', id: 'new-1', ... }
 * ];
 *
 * const existingEntities = [
 *   { name: 'john smith', type: 'PERSON', id: 'existing-1', ... }
 * ];
 *
 * const groups = await strategy.findDuplicates(newEntities, existingEntities);
 * // Returns 1 group combining new and existing 'John Smith' entities
 * ```
 */
export class ExactMatchDeduplication {
    /**
     * Strategy identifier.
     * Used for logging, metrics, and strategy selection.
     */
    name = 'exact-match';
    /**
     * Find duplicate entities using exact name matching.
     *
     * Groups entities by normalized key (type:lowercase_name).
     * Returns only groups with 2+ entities.
     *
     * **Complexity**: O(n) where n = total entities
     * **Space**: O(n) for the grouping Map
     *
     * @param entities - New entities to deduplicate
     * @param existing - Optional existing entities to check against
     * @returns Promise resolving to duplicate groups with matchScore = 1.0
     *
     * @remarks
     * - Entities are grouped by `type:lowercase_trimmed_name`
     * - Groups with single entity are filtered out
     * - All groups have matchScore = 1.0 (perfect match)
     * - matchMethod = 'exact'
     * - First entity in each group becomes the canonical entity
     */
    async findDuplicates(entities, existing = []) {
        // Map: normalized key -> array of entities with that key
        const groups = new Map();
        // Combine new and existing entities for comprehensive deduplication
        const allEntities = [...entities, ...existing];
        // Single pass: group entities by normalized key (O(n))
        for (const entity of allEntities) {
            const key = this.normalizeKey(entity);
            const group = groups.get(key);
            if (group) {
                group.push(entity);
            }
            else {
                groups.set(key, [entity]);
            }
        }
        // Convert to DuplicateGroups, filtering single-entity groups
        const duplicateGroups = [];
        for (const duplicates of groups.values()) {
            // Only return groups with 2+ entities (actual duplicates)
            if (duplicates.length > 1) {
                duplicateGroups.push({
                    canonical: duplicates[0], // First entity becomes canonical
                    duplicates,
                    matchScore: 1.0, // Perfect match for exact strategy
                    matchMethod: 'exact',
                });
            }
        }
        return duplicateGroups;
    }
    /**
     * Merge a duplicate group into a single canonical entity.
     *
     * Merging strategy:
     * 1. Use first entity as base (canonical)
     * 2. Combine all mentions from all duplicates (preserves provenance)
     * 3. Merge aliases (deduplicated, excluding canonical name)
     * 4. Take highest confidence score
     * 5. Merge properties (later entities overwrite earlier ones)
     *
     * **Complexity**: O(m) where m = total duplicates
     *
     * @param group - Duplicate group to merge
     * @returns Merged entity with combined data
     *
     * @remarks
     * - All mentions are preserved for complete provenance
     * - Aliases are deduplicated using Set
     * - Canonical name is excluded from aliases array
     * - Highest confidence is selected (max)
     * - Properties are merged with last-write-wins strategy
     * - Original entity IDs are lost (canonical ID is kept)
     *
     * @example
     * ```typescript
     * const merged = strategy.merge({
     *   canonical: { id: '1', name: 'John Smith', ... },
     *   duplicates: [
     *     { id: '1', name: 'John Smith', confidence: 0.9, mentions: [m1], aliases: ['J.S.'], properties: { age: 30 } },
     *     { id: '2', name: 'john smith', confidence: 0.95, mentions: [m2], aliases: ['John'], properties: { city: 'NYC' } },
     *   ],
     *   matchScore: 1.0,
     *   matchMethod: 'exact'
     * });
     *
     * // Result:
     * // {
     * //   id: '1',
     * //   name: 'John Smith',
     * //   confidence: 0.95, // max(0.9, 0.95)
     * //   mentions: [m1, m2], // combined
     * //   aliases: ['J.S.', 'John', 'john smith'], // deduplicated, excluding 'John Smith'
     * //   properties: { age: 30, city: 'NYC' } // merged
     * // }
     * ```
     */
    merge(group) {
        const { duplicates } = group;
        // Edge case: single entity (shouldn't happen, but handle gracefully)
        if (duplicates.length === 0) {
            throw new Error('Cannot merge empty duplicate group');
        }
        if (duplicates.length === 1) {
            return duplicates[0];
        }
        // Base entity (first duplicate becomes canonical)
        const canonical = duplicates[0];
        // Step 1: Merge all mentions (O(m) where m = total duplicates)
        const allMentions = duplicates.flatMap((entity) => entity.mentions);
        // Step 2: Merge all aliases + original names, deduplicate
        // Add all entity names as potential aliases
        const aliasSet = new Set();
        for (const entity of duplicates) {
            // Add entity's original name as alias
            aliasSet.add(entity.name);
            // Add all existing aliases
            for (const alias of entity.aliases) {
                aliasSet.add(alias);
            }
        }
        // Remove canonical name from aliases (it's already in .name field)
        aliasSet.delete(canonical.name);
        // Convert to array
        const mergedAliases = Array.from(aliasSet);
        // Step 3: Take highest confidence
        const maxConfidence = Math.max(...duplicates.map((entity) => entity.confidence));
        // Step 4: Merge properties (last write wins)
        // Later entities in array overwrite earlier ones
        const mergedProperties = duplicates.reduce((acc, entity) => ({ ...acc, ...entity.properties }), {});
        // Step 5: Build merged entity
        return {
            ...canonical, // Use first entity as base
            aliases: mergedAliases,
            confidence: maxConfidence,
            mentions: allMentions,
            properties: mergedProperties,
        };
    }
    /**
     * Normalize entity to a unique key for grouping.
     *
     * Normalization strategy:
     * - Combine type and name for uniqueness
     * - Lowercase for case-insensitive matching
     * - Trim whitespace
     * - Format: `TYPE:normalized_name`
     *
     * **Examples**:
     * - `{ type: 'PERSON', name: 'John Smith' }` → `"PERSON:john smith"`
     * - `{ type: 'PERSON', name: 'john smith' }` → `"PERSON:john smith"`
     * - `{ type: 'PERSON', name: '  John Smith  ' }` → `"PERSON:john smith"`
     * - `{ type: 'ORGANIZATION', name: 'John Smith' }` → `"ORGANIZATION:john smith"` (different type!)
     *
     * @param entity - Entity to normalize
     * @returns Normalized key for grouping
     *
     * @private
     * @remarks
     * - Type is included to avoid cross-type collisions
     * - Case-insensitive: 'John' === 'john'
     * - Whitespace-insensitive: '  John  ' === 'John'
     * - Type-sensitive: PERSON:john !== ORGANIZATION:john
     */
    normalizeKey(entity) {
        return `${entity.type}:${entity.name.toLowerCase().trim()}`;
    }
}
