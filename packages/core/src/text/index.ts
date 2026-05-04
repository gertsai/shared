/**
 * @gertsai/core - Text Processing Core
 * Phase 22: Text Processing
 * Phase 23: Entity Extraction & Deduplication
 *
 * Exports:
 * - Document and TextNode types
 * - Metadata modes + filtering
 * - Relationship enums/types
 * - Text splitters
 * - Document reader interfaces + registry
 * - Output parsers (Zod)
 * - Entity extraction schemas and types
 * - Deduplication strategies
 * - Provenance tracking and citations
 */

export * from './nodes';
export * from './metadata';
export * from './relationships';
export * from './splitters';
export * from './readers';
export * from './parsers';
export * from './extraction/schemas';
export * from './deduplication';
export * from './provenance';

