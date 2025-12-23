/**
 * Entity deduplication strategies.
 * Provides multiple approaches for finding and merging duplicate entities.
 *
 * @module text/deduplication
 */
export * from './strategy';
export * from './exact-match';
export * from './fuzzy-match';
export * from './embedding-match';
