/**
 * Entity Extraction Types
 *
 * TypeScript interfaces with Typia compile-time validation.
 * Includes legacy Zod schemas for backward compatibility during migration.
 */

import { z } from 'zod';
import typia from 'typia';
import type { IValidation } from 'typia';
import type { Entity, Triplet } from './schemas';
import { EntitySchema, TripletSchema } from './schemas';

// ============================================================================
// Typia Validator Type (internal)
// ============================================================================

type TypiaValidator<T> = (input: unknown) => IValidation<T>;

// ============================================================================
// TYPIA INTERFACES (NEW - use for new code)
// ============================================================================

/**
 * Processing metadata for extraction results.
 */
export interface ExtractionMetadata {
  /** Time to process (ms) */
  processingTimeMs: number;

  /** Tokens used (if LLM-based) */
  tokensUsed?: number;

  /** Model used (if LLM-based) */
  modelUsed?: string;

  /** Source chunk ID */
  chunkId: string;

  /** Extractor version */
  extractorVersion?: string;
}

/**
 * ExtractionResult - output of entity extraction.
 * Contains entities, relationships, and processing metadata.
 */
export interface ExtractionResult {
  /** Extracted entities */
  entities: Entity[];

  /** Extracted triplets (relationships) */
  triplets: Triplet[];

  /** Processing metadata */
  metadata: ExtractionMetadata;
}

// ============================================================================
// TYPIA VALIDATORS (NEW - use for new code)
// ============================================================================

/**
 * Validate ExtractionMetadata at runtime.
 */
export const validateExtractionMetadata: TypiaValidator<ExtractionMetadata> =
  typia.createValidate<ExtractionMetadata>();

/**
 * Validate ExtractionResult at runtime.
 */
export const validateExtractionResult: TypiaValidator<ExtractionResult> =
  typia.createValidate<ExtractionResult>();

// ============================================================================
// ZOD SCHEMAS (LEGACY - for backward compatibility)
// ============================================================================

/**
 * @deprecated Use ExtractionMetadata interface + validateExtractionMetadata instead
 */
export const ExtractionMetadataSchema = z.object({
  processingTimeMs: z.number(),
  tokensUsed: z.number().optional(),
  modelUsed: z.string().optional(),
  chunkId: z.string(),
  extractorVersion: z.string().optional(),
});

/**
 * @deprecated Use ExtractionResult interface + validateExtractionResult instead
 */
export const ExtractionResultSchema = z.object({
  entities: z.array(EntitySchema),
  triplets: z.array(TripletSchema),
  metadata: ExtractionMetadataSchema,
});

// Re-export types for convenience
export type { Entity, Triplet, Mention, EntityType, Predicate } from './schemas';
