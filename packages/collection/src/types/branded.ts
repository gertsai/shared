/**
 * Branded types for @gertsai/collection
 *
 * Branded types provide compile-time type safety for primitive values
 * that have semantic meaning (IDs, keys, indices, etc.)
 *
 * @example
 * ```typescript
 * const cacheKey = createCacheKey('user:123');
 * // cacheKey has type CacheKey, not just string
 * // Can't accidentally pass a regular string where CacheKey is expected
 * ```
 */

// ============================================================================
// Brand Symbols
// ============================================================================

declare const CacheKeyBrand: unique symbol;
declare const CollectionIdBrand: unique symbol;
declare const SeqOperationIndexBrand: unique symbol;
declare const HashCodeBrand: unique symbol;

// ============================================================================
// Branded Types
// ============================================================================

/**
 * Branded type for cache keys in memoization.
 * Prevents accidental use of arbitrary strings as cache keys.
 */
export type CacheKey = string & { readonly [CacheKeyBrand]: true };

/**
 * Branded type for collection instance identifiers.
 * Useful for tracking collection instances in debugging or logging.
 */
export type CollectionId = string & { readonly [CollectionIdBrand]: true };

/**
 * Branded type for Seq operation chain indices.
 * Ensures type-safe operation chain manipulation.
 */
export type SeqOperationIndex = number & {
  readonly [SeqOperationIndexBrand]: true;
};

/**
 * Branded type for hash codes.
 * Distinguishes computed hash values from regular numbers.
 */
export type HashCode = number & { readonly [HashCodeBrand]: true };

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a branded cache key from a string.
 *
 * @param key - The key string
 * @returns Branded CacheKey
 *
 * @example
 * ```typescript
 * const key = createCacheKey('user:123');
 * cache.set(key, value); // Type-safe
 * ```
 */
export function createCacheKey(key: string): CacheKey {
  return key as CacheKey;
}

/**
 * Create a branded collection ID.
 *
 * @param prefix - Optional prefix for the ID
 * @returns Unique CollectionId
 */
export function createCollectionId(prefix = 'col'): CollectionId {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` as CollectionId;
}

/**
 * Create a branded Seq operation index.
 *
 * @param index - The index number
 * @returns Branded SeqOperationIndex
 */
export function createSeqOperationIndex(index: number): SeqOperationIndex {
  return index as SeqOperationIndex;
}

/**
 * Create a branded hash code.
 *
 * @param hash - The hash value
 * @returns Branded HashCode
 */
export function createHashCode(hash: number): HashCode {
  return hash as HashCode;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a string is a valid CacheKey format.
 * Note: This is a runtime check, not a brand check.
 */
export function isValidCacheKeyFormat(key: string): boolean {
  return typeof key === 'string' && key.length > 0;
}

/**
 * Check if a string is a valid CollectionId format.
 * Format: prefix_timestamp_random
 */
export function isValidCollectionIdFormat(id: string): boolean {
  return /^[a-z]+_\d+_[a-z0-9]+$/.test(id);
}
