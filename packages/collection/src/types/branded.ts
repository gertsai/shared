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
// Validation Error
// ============================================================================

/**
 * Thrown when a brand factory rejects its input.
 *
 * Branded type factories validate inputs at runtime; this error carries the
 * brand name and the offending value for diagnostics.
 */
export class BrandValidationError extends Error {
  override readonly name = 'BrandValidationError';
  readonly brand: string;
  readonly received: unknown;

  constructor(message: string, brand: string, received: unknown) {
    super(message);
    this.brand = brand;
    this.received = received;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a branded cache key from a non-empty string.
 *
 * @param key - The key string
 * @returns Branded CacheKey
 * @throws {BrandValidationError} If `key` is not a non-empty string.
 *
 * @example
 * ```typescript
 * const key = createCacheKey('user:123');
 * cache.set(key, value); // Type-safe
 * ```
 */
export function createCacheKey(key: string): CacheKey {
  if (typeof key !== 'string' || key.length === 0) {
    throw new BrandValidationError(
      `createCacheKey expects non-empty string, got ${typeof key}`,
      'CacheKey',
      key,
    );
  }
  return key as CacheKey;
}

/**
 * Create a branded collection ID.
 *
 * @param prefix - Optional non-empty prefix for the ID
 * @returns Unique CollectionId
 * @throws {BrandValidationError} If `prefix` is not a non-empty string.
 */
export function createCollectionId(prefix = 'col'): CollectionId {
  if (typeof prefix !== 'string' || prefix.length === 0) {
    throw new BrandValidationError(
      `createCollectionId expects non-empty string prefix, got ${typeof prefix}`,
      'CollectionId',
      prefix,
    );
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` as CollectionId;
}

/**
 * Create a branded Seq operation index.
 *
 * @param index - A non-negative integer
 * @returns Branded SeqOperationIndex
 * @throws {BrandValidationError} If `index` is not a non-negative integer.
 */
export function createSeqOperationIndex(index: number): SeqOperationIndex {
  if (!Number.isInteger(index) || index < 0) {
    throw new BrandValidationError(
      `createSeqOperationIndex expects non-negative integer, got ${String(index)}`,
      'SeqOperationIndex',
      index,
    );
  }
  return index as SeqOperationIndex;
}

/**
 * Create a branded hash code.
 *
 * @param hash - A finite numeric hash value
 * @returns Branded HashCode
 * @throws {BrandValidationError} If `hash` is not a finite number.
 */
export function createHashCode(hash: number): HashCode {
  if (typeof hash !== 'number' || !Number.isFinite(hash)) {
    throw new BrandValidationError(
      `createHashCode expects finite number, got ${String(hash)}`,
      'HashCode',
      hash,
    );
  }
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
