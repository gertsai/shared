/**
 * Entity Extraction Schemas
 *
 * TypeScript interfaces with Typia compile-time validation.
 * Includes legacy Zod schemas for backward compatibility during migration.
 *
 * NEW CODE: Use TypeScript interfaces + Typia validators
 * LEGACY CODE: Can still use Zod schemas (will be deprecated)
 */

import { z } from 'zod';
import typia, { tags } from 'typia';
import type { IValidation } from 'typia';

// ============================================================================
// Typia Validator Type (internal)
// ============================================================================

type TypiaValidator<T> = (input: unknown) => IValidation<T>;

// ============================================================================
// ENTITY TYPES
// ============================================================================

/**
 * Entity types for Graph RAG.
 * Extensible via CUSTOM type.
 */
export type EntityType =
  | 'PERSON'
  | 'ORGANIZATION'
  | 'LOCATION'
  | 'EVENT'
  | 'CONCEPT'
  | 'PRODUCT'
  | 'DATE'
  | 'QUANTITY'
  | 'CUSTOM';

/**
 * Valid entity types array for runtime validation.
 */
export const VALID_ENTITY_TYPES: readonly EntityType[] = [
  'PERSON',
  'ORGANIZATION',
  'LOCATION',
  'EVENT',
  'CONCEPT',
  'PRODUCT',
  'DATE',
  'QUANTITY',
  'CUSTOM',
] as const;

// ============================================================================
// TYPIA INTERFACES (NEW - use for new code)
// ============================================================================

/**
 * Mention - where entity appears in source text.
 * Enables citations and provenance tracking.
 */
export interface Mention {
  /** Exact text of mention */
  text: string;

  /** Character start in chunk (>= 0) */
  startIndex: number & tags.Type<'int32'> & tags.Minimum<0>;

  /** Character end in chunk (>= 0) */
  endIndex: number & tags.Type<'int32'> & tags.Minimum<0>;

  /** Confidence of this specific mention (0-1) */
  confidence?: number & tags.Minimum<0> & tags.Maximum<1>;
}

/**
 * Entity - extracted named entity.
 * Core building block for knowledge graphs.
 */
export interface Entity {
  /** Unique ID (UUID) */
  id: string & tags.Format<'uuid'>;

  /** Canonical name (1-500 chars) */
  name: string & tags.MinLength<1> & tags.MaxLength<500>;

  /** Entity type */
  type: EntityType;

  /** Custom type if type === 'CUSTOM' */
  customType?: string;

  /** Alternative names (aliases, abbreviations) */
  aliases: string[];

  /** Structured properties (domain-specific metadata) */
  properties: Record<string, unknown>;

  /** Extraction confidence (0-1) */
  confidence: number & tags.Minimum<0> & tags.Maximum<1>;

  /** Source chunk ID for provenance */
  sourceChunkId: string;

  /** All mentions in source text (at least 1) */
  mentions: Mention[] & tags.MinItems<1>;

  /** Optional embedding vector for semantic deduplication */
  embedding?: number[];
}

/**
 * Predicate - relationship type between entities.
 * Represents edges in the knowledge graph.
 */
export interface Predicate {
  /** Relationship type (e.g., 'WORKS_FOR', 'LOCATED_IN') (1-100 chars) */
  type: string & tags.MinLength<1> & tags.MaxLength<100>;

  /** Relationship properties (metadata, temporal info) */
  properties: Record<string, unknown>;

  /** Confidence of relationship (0-1) */
  confidence: number & tags.Minimum<0> & tags.Maximum<1>;

  /** Evidence text from source supporting this relationship */
  evidence?: string;

  /** Optional direction hint for asymmetric relationships */
  direction?: 'forward' | 'backward' | 'bidirectional';
}

/**
 * Triplet - subject-predicate-object relationship.
 * Complete knowledge graph edge with nodes.
 */
export interface Triplet {
  /** Subject entity (source) */
  subject: Entity;

  /** Relationship (edge) */
  predicate: Predicate;

  /** Object entity (target) */
  object: Entity;

  /** Source chunk ID for provenance */
  sourceChunkId: string;

  /** Overall confidence (product of entity + predicate confidence) (0-1) */
  confidence: number & tags.Minimum<0> & tags.Maximum<1>;
}

// ============================================================================
// TYPIA VALIDATORS (NEW - use for new code)
// ============================================================================

/**
 * Validate Mention at runtime.
 * Generated at compile-time by Typia transformer.
 */
export const validateMention: TypiaValidator<Mention> = typia.createValidate<Mention>();

/**
 * Validate Entity at runtime.
 * Generated at compile-time by Typia transformer.
 */
export const validateEntity: TypiaValidator<Entity> = typia.createValidate<Entity>();

/**
 * Validate Predicate at runtime.
 * Generated at compile-time by Typia transformer.
 */
export const validatePredicate: TypiaValidator<Predicate> = typia.createValidate<Predicate>();

/**
 * Validate Triplet at runtime.
 * Generated at compile-time by Typia transformer.
 */
export const validateTriplet: TypiaValidator<Triplet> = typia.createValidate<Triplet>();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a string is a valid EntityType.
 */
export function isValidEntityType(type: string): type is EntityType {
  return VALID_ENTITY_TYPES.includes(type as EntityType);
}

/**
 * Normalize entity type string to EntityType.
 * Returns 'CUSTOM' for unknown types.
 */
export function normalizeEntityType(type: string): EntityType {
  const normalized = type.toUpperCase();
  return isValidEntityType(normalized) ? normalized : 'CUSTOM';
}

// ============================================================================
// ZOD SCHEMAS (LEGACY - for backward compatibility)
// Will be deprecated after full migration
// ============================================================================

/**
 * @deprecated Use EntityType type instead
 */
export const EntityTypeSchema = z.enum([
  'PERSON',
  'ORGANIZATION',
  'LOCATION',
  'EVENT',
  'CONCEPT',
  'PRODUCT',
  'DATE',
  'QUANTITY',
  'CUSTOM',
]);

/**
 * @deprecated Use Mention interface + validateMention instead
 */
export const MentionSchema = z.object({
  text: z.string(),
  startIndex: z.number().int().min(0),
  endIndex: z.number().int().min(0),
  confidence: z.number().min(0).max(1).optional(),
});

/**
 * @deprecated Use Entity interface + validateEntity instead
 */
export const EntitySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(500),
  type: EntityTypeSchema,
  customType: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  properties: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
  sourceChunkId: z.string(),
  mentions: z.array(MentionSchema).min(1),
  embedding: z.array(z.number()).optional(),
});

/**
 * @deprecated Use Predicate interface + validatePredicate instead
 */
export const PredicateSchema = z.object({
  type: z.string().min(1).max(100),
  properties: z.record(z.string(), z.unknown()).default({}),
  confidence: z.number().min(0).max(1),
  evidence: z.string().optional(),
  direction: z.enum(['forward', 'backward', 'bidirectional']).optional(),
});

/**
 * @deprecated Use Triplet interface + validateTriplet instead
 */
export const TripletSchema = z.object({
  subject: EntitySchema,
  predicate: PredicateSchema,
  object: EntitySchema,
  sourceChunkId: z.string(),
  confidence: z.number().min(0).max(1),
});
