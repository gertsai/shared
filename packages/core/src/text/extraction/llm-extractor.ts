/**
 * LLM Entity Extractor Implementation
 * Phase 23: Entity Extraction
 *
 * Implements entity and relationship extraction using LLM providers.
 * Features:
 * - Structured output parsing with Typia compile-time validation
 * - Batch processing with configurable concurrency
 * - Retry logic for failed extractions
 * - Customizable prompt templates
 * - Automatic entity type normalization
 */

import typia from 'typia';
import type { IEntityExtractor, ExtractionOptions, BatchOptions } from './entity-extractor';
import type { ExtractionResult } from './types';
import type { Entity, Triplet } from './schemas';
import { normalizeEntityType } from './schemas';
import type { TextNode } from '../nodes/text-node';
import type { BaseLLM } from '../../llm/base';
import { TypiaOutputParser, type TypiaValidator } from '../parsers/typia-parser';
import { randomUUID } from 'crypto';

// ============================================================================
// LLM Extraction Response Types
// ============================================================================

/**
 * Single mention in LLM response.
 */
interface LLMMention {
  text: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Single entity in LLM response.
 */
interface LLMEntity {
  name: string;
  type: string;
  aliases?: string[];
  properties?: Record<string, unknown>;
  confidence: number;
  mentions: LLMMention[];
}

/**
 * Single relationship in LLM response.
 */
interface LLMRelationship {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  evidence?: string;
}

/**
 * LLM extraction response structure.
 */
export interface LLMExtractionResponse {
  entities: LLMEntity[];
  relationships: LLMRelationship[];
}

// ============================================================================
// Typia Validator
// ============================================================================

/**
 * Compile-time generated validator for LLM extraction response.
 */
export const validateLLMExtractionResponse: TypiaValidator<LLMExtractionResponse> =
  typia.createValidate<LLMExtractionResponse>();

/**
 * Legacy compatibility: LLMExtractionSchema with safeParse API.
 * @deprecated Use validateLLMExtractionResponse instead
 */
export const LLMExtractionSchema = {
  safeParse: (
    data: unknown,
  ): { success: true; data: LLMExtractionResponse } | { success: false; error: unknown } => {
    const result = validateLLMExtractionResponse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.errors };
  },
};

// ============================================================================
// Prompt Template
// ============================================================================

/**
 * Default extraction prompt template.
 * Uses simple {{placeholder}} syntax for variable substitution.
 */
export const DEFAULT_PROMPT_TEMPLATE = `You are an expert entity and relationship extractor.

Extract all named entities and their relationships from the following text.

For each entity, provide:
- name: The canonical name
- type: One of PERSON, ORGANIZATION, LOCATION, EVENT, CONCEPT, PRODUCT, DATE, QUANTITY, or CUSTOM
- aliases: Alternative names or abbreviations
- confidence: How confident you are (0.0 to 1.0)
- mentions: Where in the text this entity appears (with character indices)

For each relationship, provide:
- subject: The source entity name
- predicate: The relationship type (e.g., WORKS_FOR, LOCATED_IN, CREATED_BY)
- object: The target entity name
- confidence: How confident you are (0.0 to 1.0)
- evidence: The text that supports this relationship

{{#if domain}}
Domain context: {{domain}}
{{/if}}

{{#if entityTypes}}
Focus on these entity types: {{entityTypes}}
{{/if}}

TEXT:
"""
{{text}}
"""

Respond in JSON format matching this schema:
{
  "entities": [...],
  "relationships": [...]
}`.trim();

// ============================================================================
// LLM Entity Extractor
// ============================================================================

/**
 * LLMEntityExtractor - LLM-based entity extraction.
 *
 * Extracts entities and relationships using a language model with
 * structured output validation via Typia compile-time validators.
 *
 * @example
 * ```typescript
 * const llm = new OpenAIProvider({ model: 'gpt-4o' });
 * const extractor = new LLMEntityExtractor(llm, {
 *   minConfidence: 0.7,
 *   includeEvidence: true,
 * });
 *
 * const result = await extractor.extract(chunk);
 * console.log(`Extracted ${result.entities.length} entities`);
 * ```
 */
export class LLMEntityExtractor implements IEntityExtractor {
  readonly name = 'llm-extractor';

  private promptTemplate: string = DEFAULT_PROMPT_TEMPLATE;
  private parser: TypiaOutputParser<LLMExtractionResponse>;

  constructor(
    private readonly llm: BaseLLM,
    private readonly defaultOptions: ExtractionOptions = {},
  ) {
    // Schema description for format instructions
    const schemaDescription = {
      entities: [
        {
          name: 'string',
          type: 'PERSON | ORGANIZATION | LOCATION | EVENT | CONCEPT | PRODUCT | DATE | QUANTITY | CUSTOM',
          aliases: ['string'],
          properties: {},
          confidence: 'number (0-1)',
          mentions: [{ text: 'string', startIndex: 'number', endIndex: 'number' }],
        },
      ],
      relationships: [
        {
          subject: 'string (entity name)',
          predicate: 'string (relationship type)',
          object: 'string (entity name)',
          confidence: 'number (0-1)',
          evidence: 'string (optional)',
        },
      ],
    };

    this.parser = new TypiaOutputParser(validateLLMExtractionResponse, schemaDescription);
  }

  /**
   * Extract entities from a single chunk.
   */
  async extract(chunk: TextNode, options?: ExtractionOptions): Promise<ExtractionResult> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();

    // Build prompt
    const prompt = this.buildPrompt(chunk.text, opts);

    // Call LLM
    const response = await this.llm.call([{ role: 'user', content: prompt }]);

    // Parse response
    const parsed = await this.parser.parse(response.content);

    // Convert to ExtractionResult
    const entities = this.convertEntities(parsed.entities, chunk.id, opts);
    const triplets = this.convertTriplets(parsed.relationships, entities, chunk.id, opts);

    return {
      entities,
      triplets,
      metadata: {
        processingTimeMs: Date.now() - startTime,
        tokensUsed: response.usage?.totalTokens,
        modelUsed: response.model,
        chunkId: chunk.id,
        extractorVersion: '1.0.0',
      },
    };
  }

  /**
   * Extract entities from multiple chunks.
   * Processes chunks in batches with concurrency control.
   */
  async extractBatch(chunks: TextNode[], options?: BatchOptions): Promise<ExtractionResult[]> {
    const opts = {
      batchSize: 10,
      concurrency: 3,
      retryOnFailure: true,
      maxRetries: 3,
      ...options,
    };

    const results: ExtractionResult[] = [];

    // Process in batches
    for (let i = 0; i < chunks.length; i += opts.batchSize!) {
      const batch = chunks.slice(i, i + opts.batchSize!);

      // Process batch with concurrency limit
      const batchResults = await this.processBatchWithConcurrency(batch, opts);
      results.push(...batchResults);

      // Progress callback
      if (opts.onProgress) {
        opts.onProgress(results.length, chunks.length);
      }
    }

    return results;
  }

  /**
   * Get the prompt template used for extraction.
   */
  getPromptTemplate(): string {
    return this.promptTemplate;
  }

  /**
   * Set a custom prompt template.
   */
  setPromptTemplate(template: string): void {
    this.promptTemplate = template;
  }

  // ==================== Private Methods ====================

  /**
   * Build prompt from template with variable substitution.
   */
  private buildPrompt(text: string, options: ExtractionOptions): string {
    let prompt = this.promptTemplate;

    // Replace text placeholder
    prompt = prompt.replace('{{text}}', text);

    // Handle conditional blocks
    if (options.domain) {
      prompt = prompt.replace('{{#if domain}}', '');
      prompt = prompt.replace('{{/if}}', '');
      prompt = prompt.replace('{{domain}}', options.domain);
    } else {
      // Remove domain conditional block
      prompt = prompt.replace(/\{\{#if domain\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    }

    if (options.entityTypes && options.entityTypes.length > 0) {
      prompt = prompt.replace('{{#if entityTypes}}', '');
      prompt = prompt.replace('{{/if}}', '');
      prompt = prompt.replace('{{entityTypes}}', options.entityTypes.join(', '));
    } else {
      // Remove entityTypes conditional block
      prompt = prompt.replace(/\{\{#if entityTypes\}\}[\s\S]*?\{\{\/if\}\}/g, '');
    }

    return prompt.trim();
  }

  /**
   * Convert LLM entities to validated Entity objects.
   */
  private convertEntities(
    parsed: LLMEntity[],
    chunkId: string,
    options: ExtractionOptions,
  ): Entity[] {
    const minConfidence = options.minConfidence ?? 0;
    const maxEntities = options.maxEntitiesPerChunk ?? Infinity;

    return parsed
      .filter((e) => e.confidence >= minConfidence)
      .slice(0, maxEntities)
      .map((e) => {
        const entityType = normalizeEntityType(e.type);

        return {
          id: randomUUID(),
          name: e.name,
          type: entityType,
          customType: entityType === 'CUSTOM' ? e.type : undefined,
          aliases: e.aliases ?? [],
          properties: e.properties ?? {},
          confidence: e.confidence,
          sourceChunkId: chunkId,
          mentions: e.mentions,
        } as Entity;
      });
  }

  /**
   * Convert LLM relationships to validated Triplet objects.
   */
  private convertTriplets(
    parsed: LLMRelationship[],
    entities: Entity[],
    chunkId: string,
    options: ExtractionOptions,
  ): Triplet[] {
    const minConfidence = options.minConfidence ?? 0;

    // Build entity lookup by name (case-insensitive)
    const entityByName = new Map<string, Entity>();
    for (const entity of entities) {
      entityByName.set(entity.name.toLowerCase(), entity);
      // Also map aliases
      for (const alias of entity.aliases) {
        entityByName.set(alias.toLowerCase(), entity);
      }
    }

    const triplets: Triplet[] = [];

    for (const r of parsed) {
      if (r.confidence < minConfidence) continue;

      const subject = entityByName.get(r.subject.toLowerCase());
      const object = entityByName.get(r.object.toLowerCase());

      // Skip if entities not found
      if (!subject || !object) {
        continue;
      }

      // Filter by relationship types if specified
      if (
        options.relationshipTypes &&
        options.relationshipTypes.length > 0 &&
        !options.relationshipTypes.includes(r.predicate.toUpperCase())
      ) {
        continue;
      }

      const triplet: Triplet = {
        subject,
        predicate: {
          type: r.predicate.toUpperCase(),
          properties: {},
          confidence: r.confidence,
          evidence: options.includeEvidence ? r.evidence : undefined,
        },
        object,
        sourceChunkId: chunkId,
        confidence: r.confidence * subject.confidence * object.confidence,
      };

      triplets.push(triplet);
    }

    return triplets;
  }

  /**
   * Process batch with concurrency control and retry logic.
   */
  private async processBatchWithConcurrency(
    batch: TextNode[],
    options: BatchOptions,
  ): Promise<ExtractionResult[]> {
    const concurrency = options.concurrency ?? 3;
    const results: ExtractionResult[] = [];
    const queue = [...batch];

    // Create worker pool
    const workers = Array(Math.min(concurrency, queue.length))
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          const chunk = queue.shift()!;

          try {
            const result = await this.extractWithRetry(chunk, options);
            results.push(result);
          } catch (error) {
            // If retry is disabled or all retries failed, throw error
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to extract entities from chunk ${chunk.id}: ${errorMsg}`);
          }
        }
      });

    await Promise.all(workers);
    return results;
  }

  /**
   * Extract with retry logic.
   */
  private async extractWithRetry(
    chunk: TextNode,
    options: BatchOptions,
  ): Promise<ExtractionResult> {
    const maxRetries = options.retryOnFailure ? (options.maxRetries ?? 3) : 0;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.extract(chunk, options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry if it's the last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError ?? new Error('Extraction failed with unknown error');
  }
}
