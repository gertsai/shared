/**
 * Structured Output Utilities
 *
 * Converts Zod schemas to LiteLLM-compatible JSON Schema format
 * for structured output (guaranteed schema compliance).
 *
 * @module @gerts/core/llm/structured-output
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodType } from 'zod';

/**
 * LiteLLM JSON Schema format for structured output
 */
export interface LiteLLMJsonSchema {
  /** Schema name (required by OpenAI format) */
  name: string;
  /** JSON Schema definition */
  schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  /** Enable strict mode (default: true) */
  strict?: boolean;
}

/**
 * LiteLLM response_format parameter
 */
export type LiteLLMResponseFormat =
  | { type: 'text' }
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: LiteLLMJsonSchema };

/**
 * Options for Zod to LiteLLM schema conversion
 */
export interface ZodToLiteLLMOptions {
  /** Schema name for identification */
  name: string;
  /** Optional description */
  description?: string;
  /** Enable strict mode (default: true) */
  strict?: boolean;
}

/**
 * Convert a Zod schema to LiteLLM response_format parameter.
 *
 * Uses `json_schema` mode for guaranteed schema compliance.
 * The LLM will only return JSON that matches the schema structure.
 *
 * @param schema - Zod schema to convert
 * @param options - Conversion options
 * @returns LiteLLM response_format parameter
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { zodToResponseFormat } from '@gerts/core';
 *
 * const PersonSchema = z.object({
 *   name: z.string(),
 *   age: z.number(),
 *   email: z.string().email().optional(),
 * });
 *
 * const responseFormat = zodToResponseFormat(PersonSchema, {
 *   name: 'person',
 *   description: 'Person information',
 * });
 *
 * // Use in LLM call
 * const response = await llm.call(messages, {
 *   responseFormat,
 * });
 * ```
 */
export function zodToResponseFormat(
  schema: ZodType,
  options: ZodToLiteLLMOptions
): LiteLLMResponseFormat {
  // Convert Zod to JSON Schema with OpenAI-compatible settings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonSchema = zodToJsonSchema(schema as any, {
    name: options.name,
    $refStrategy: 'none',
  });

  // Extract the schema object (remove $schema and other metadata)
  const { $schema, definitions, ...schemaBody } = jsonSchema as Record<string, unknown>;

  return {
    type: 'json_schema',
    json_schema: {
      name: options.name,
      schema: schemaBody as LiteLLMJsonSchema['schema'],
      strict: options.strict ?? true,
    },
  };
}

/**
 * Convert a Zod schema to just the JSON Schema part.
 *
 * Useful when you need the schema but not the full response_format.
 *
 * @param schema - Zod schema to convert
 * @param name - Schema name
 * @returns LiteLLM JSON Schema object
 */
export function zodToJsonSchemaLiteLLM(
  schema: ZodType,
  name: string
): LiteLLMJsonSchema {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonSchema = zodToJsonSchema(schema as any, {
    name,
    $refStrategy: 'none',
  });

  const { $schema, definitions, ...schemaBody } = jsonSchema as Record<string, unknown>;

  return {
    name,
    schema: schemaBody as LiteLLMJsonSchema['schema'],
    strict: true,
  };
}

/**
 * Create a simple JSON mode response format.
 *
 * Use this when you want JSON output but don't need strict schema validation.
 * The LLM will return valid JSON, but structure is not guaranteed.
 *
 * @returns LiteLLM response_format for JSON mode
 */
export function jsonMode(): LiteLLMResponseFormat {
  return { type: 'json_object' };
}

/**
 * Create a text mode response format.
 *
 * Use this for regular text output (default behavior).
 *
 * @returns LiteLLM response_format for text mode
 */
export function textMode(): LiteLLMResponseFormat {
  return { type: 'text' };
}
