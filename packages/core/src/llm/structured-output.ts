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

// =============================================================================
// Model Capabilities & Smart Fallback
// =============================================================================

/**
 * Model capabilities for structured output
 */
export interface StructuredOutputCapabilities {
  /** Supports native structured outputs (OpenAI, Anthropic 4.5+) */
  supportsNativeStructuredOutputs: boolean;
  /** Supports JSON schema format (Gemini, Llama) */
  supportsJsonSchemaOutputs: boolean;
  /** Supports basic JSON mode */
  supportsJsonMode: boolean;
}

/**
 * Known model capabilities for structured output.
 *
 * Based on research from agno, crewAI, and voltage frameworks.
 */
export const MODEL_STRUCTURED_OUTPUT_CAPABILITIES: Record<string, StructuredOutputCapabilities> = {
  // OpenAI - Full native support
  'gpt-4o': { supportsNativeStructuredOutputs: true, supportsJsonSchemaOutputs: true, supportsJsonMode: true },
  'gpt-4o-mini': { supportsNativeStructuredOutputs: true, supportsJsonSchemaOutputs: true, supportsJsonMode: true },
  'gpt-4-turbo': { supportsNativeStructuredOutputs: true, supportsJsonSchemaOutputs: true, supportsJsonMode: true },
  'gpt-3.5-turbo': { supportsNativeStructuredOutputs: false, supportsJsonSchemaOutputs: false, supportsJsonMode: true },

  // Anthropic - Native support in newer models
  'claude-3-5-sonnet': { supportsNativeStructuredOutputs: true, supportsJsonSchemaOutputs: true, supportsJsonMode: true },
  'claude-sonnet-4': { supportsNativeStructuredOutputs: true, supportsJsonSchemaOutputs: true, supportsJsonMode: true },
  'claude-3-opus': { supportsNativeStructuredOutputs: false, supportsJsonSchemaOutputs: false, supportsJsonMode: true },

  // Gemini - JSON schema support
  'gemini-3-flash': { supportsNativeStructuredOutputs: false, supportsJsonSchemaOutputs: true, supportsJsonMode: true },
  'gemini-3-pro': { supportsNativeStructuredOutputs: false, supportsJsonSchemaOutputs: true, supportsJsonMode: true },
  'gemini-2.0-flash': { supportsNativeStructuredOutputs: false, supportsJsonSchemaOutputs: true, supportsJsonMode: true },
  'gemini-flash': { supportsNativeStructuredOutputs: false, supportsJsonSchemaOutputs: true, supportsJsonMode: true },
  'gemini-pro': { supportsNativeStructuredOutputs: false, supportsJsonSchemaOutputs: true, supportsJsonMode: true },

  // Mistral - Native support
  'mistral-large': { supportsNativeStructuredOutputs: true, supportsJsonSchemaOutputs: true, supportsJsonMode: true },
  'mistral-medium': { supportsNativeStructuredOutputs: true, supportsJsonSchemaOutputs: true, supportsJsonMode: true },

  // Llama - JSON schema support
  'llama-3.1': { supportsNativeStructuredOutputs: false, supportsJsonSchemaOutputs: true, supportsJsonMode: true },
  'llama-3.2': { supportsNativeStructuredOutputs: false, supportsJsonSchemaOutputs: true, supportsJsonMode: true },

  // Default fallback
  'default': { supportsNativeStructuredOutputs: false, supportsJsonSchemaOutputs: false, supportsJsonMode: true },
};

/**
 * Get structured output capabilities for a model.
 *
 * @param model - Model name or ID
 * @returns Capabilities object
 */
export function getStructuredOutputCapabilities(model: string): StructuredOutputCapabilities {
  // Check exact match
  if (MODEL_STRUCTURED_OUTPUT_CAPABILITIES[model]) {
    return MODEL_STRUCTURED_OUTPUT_CAPABILITIES[model];
  }

  // Check prefix match (e.g., "gpt-4o-2024-08-06" → "gpt-4o")
  for (const [key, caps] of Object.entries(MODEL_STRUCTURED_OUTPUT_CAPABILITIES)) {
    if (model.startsWith(key) || model.includes(key)) {
      return caps;
    }
  }

  // Default fallback
  return MODEL_STRUCTURED_OUTPUT_CAPABILITIES['default'];
}

/**
 * Determine the best response format for a model and schema.
 *
 * Implements 3-tier fallback strategy (like agno):
 * 1. Native structured outputs (best - guaranteed schema)
 * 2. JSON schema outputs (good - schema hint)
 * 3. JSON mode (fallback - no schema guarantee)
 *
 * @param model - Model name
 * @param schema - Zod schema
 * @param schemaName - Name for the schema
 * @returns Best response format for the model
 */
export function getSmartResponseFormat(
  model: string,
  schema: ZodType,
  schemaName: string
): LiteLLMResponseFormat {
  const caps = getStructuredOutputCapabilities(model);

  // Tier 1: Native structured outputs
  if (caps.supportsNativeStructuredOutputs || caps.supportsJsonSchemaOutputs) {
    return zodToResponseFormat(schema, { name: schemaName });
  }

  // Tier 2: JSON mode (fallback)
  if (caps.supportsJsonMode) {
    return jsonMode();
  }

  // Tier 3: Text mode (last resort)
  return textMode();
}

// =============================================================================
// JSON Extraction Fallback
// =============================================================================

/** Regex pattern for extracting JSON from text */
const JSON_EXTRACTION_PATTERNS = [
  // JSON in code blocks
  /```(?:json)?\s*([\s\S]*?)```/,
  // Standalone JSON object
  /(\{[\s\S]*\})/,
  // Standalone JSON array
  /(\[[\s\S]*\])/,
];

/**
 * Extract JSON from text response.
 *
 * Useful as fallback when model doesn't support structured output.
 * Tries multiple patterns to find valid JSON.
 *
 * @param text - Raw text response from LLM
 * @returns Parsed JSON object or null if not found
 *
 * @example
 * ```typescript
 * const response = "Here's the data: ```json\n{\"name\": \"John\"}\n```";
 * const data = extractJsonFromText(response);
 * // { name: "John" }
 * ```
 */
export function extractJsonFromText(text: string): unknown | null {
  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch {
    // Continue to pattern matching
  }

  // Try extraction patterns
  for (const pattern of JSON_EXTRACTION_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch {
        // Try next pattern
      }
    }
  }

  return null;
}

/**
 * Parse and validate LLM response with smart fallback.
 *
 * 1. If JSON, validate against schema
 * 2. If text, extract JSON and validate
 * 3. If extraction fails, return null
 *
 * @param response - Raw LLM response content
 * @param schema - Zod schema for validation
 * @returns Validated data or null
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const PersonSchema = z.object({
 *   name: z.string(),
 *   age: z.number(),
 * });
 *
 * const result = parseStructuredResponse(
 *   '{"name": "John", "age": 30}',
 *   PersonSchema
 * );
 * // { name: "John", age: 30 }
 * ```
 */
export function parseStructuredResponse<T extends ZodType>(
  response: string,
  schema: T
): ReturnType<T['safeParse']>['data'] | null {
  // Try direct JSON parse
  let data: unknown;
  try {
    data = JSON.parse(response);
  } catch {
    // Try extraction
    data = extractJsonFromText(response);
  }

  if (data === null) {
    return null;
  }

  // Validate against schema
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  return null;
}
