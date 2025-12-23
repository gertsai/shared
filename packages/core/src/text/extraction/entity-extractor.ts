/**
 * Entity Extractor Interface
 * Phase 23: Entity Extraction
 *
 * Defines the contract for extracting entities and relationships from text chunks.
 * Supports batch processing, custom prompts, and flexible extraction options.
 */

import type { TextNode } from '../nodes/text-node';
import type { ExtractionResult, Entity, Triplet } from './types';
import type { EntityType } from './schemas';

/**
 * Extraction options for single or batch extraction.
 */
export interface ExtractionOptions {
  /** Entity types to extract (default: all) */
  entityTypes?: EntityType[];

  /** Custom entity types beyond the standard set */
  customEntityTypes?: string[];

  /** Relationship types to extract (e.g., ['WORKS_FOR', 'LOCATED_IN']) */
  relationshipTypes?: string[];

  /** Minimum confidence threshold (0-1) for filtering results */
  minConfidence?: number;

  /** Maximum entities per chunk to prevent overwhelming results */
  maxEntitiesPerChunk?: number;

  /** Include evidence text in triplets for provenance */
  includeEvidence?: boolean;

  /** Domain hint for better extraction (e.g., 'medical', 'legal', 'technical') */
  domain?: string;

  /** Language hint for multilingual extraction */
  language?: string;
}

/**
 * Batch extraction options with concurrency and retry controls.
 */
export interface BatchOptions extends ExtractionOptions {
  /** Batch size for parallel processing */
  batchSize?: number;

  /** Max concurrent extractions */
  concurrency?: number;

  /** Retry failed extractions */
  retryOnFailure?: boolean;

  /** Max retries per chunk */
  maxRetries?: number;

  /** Progress callback */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * IEntityExtractor - interface for entity extraction.
 *
 * Implementations must:
 * - Extract entities from text chunks
 * - Support batch processing with concurrency
 * - Provide configurable prompt templates
 * - Return structured extraction results
 *
 * @example
 * ```typescript
 * const extractor = new LLMEntityExtractor(llm);
 * const result = await extractor.extract(chunk, {
 *   entityTypes: ['PERSON', 'ORGANIZATION'],
 *   minConfidence: 0.7,
 *   includeEvidence: true,
 * });
 * ```
 */
export interface IEntityExtractor {
  /** Extractor name for identification */
  readonly name: string;

  /**
   * Extract entities from a single chunk.
   *
   * @param chunk - Text chunk to process
   * @param options - Extraction options
   * @returns Extraction result with entities and triplets
   */
  extract(chunk: TextNode, options?: ExtractionOptions): Promise<ExtractionResult>;

  /**
   * Extract entities from multiple chunks.
   * More efficient than calling extract() in a loop.
   *
   * @param chunks - Array of text chunks
   * @param options - Batch extraction options
   * @returns Array of extraction results
   */
  extractBatch(chunks: TextNode[], options?: BatchOptions): Promise<ExtractionResult[]>;

  /**
   * Get the prompt template used for extraction.
   * Useful for debugging and customization.
   *
   * @returns Current prompt template string
   */
  getPromptTemplate(): string;

  /**
   * Set a custom prompt template.
   *
   * @param template - New prompt template with placeholders
   */
  setPromptTemplate(template: string): void;
}
