/**
 * Typia Params Helper Functions
 *
 * Creates typia validators with auto-generated JSON Schema for:
 * - REPL introspection
 * - Automatic query param coercion
 * - Type-safe validation
 *
 * @module api-core/common/typia-params
 * @see RFC-065-TYPIA-VALIDATOR-MOLECULER.md
 */

import type { TypiaValidator } from './types';

/**
 * Property metadata for REPL introspection
 */
export interface PropertyMeta {
  type: string;
  optional: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  enum?: string[];
  description?: string;
}

/**
 * Extended params with schema metadata.
 * Contains validator function plus auto-generated schema info.
 */
export interface TypiaParamsWithSchema<T> {
  /** Typia validator function for runtime validation */
  validate: TypiaValidator<T>;

  /** JSON Schema for introspection (auto-generated from TypeScript type) */
  schema: Record<string, unknown>;

  /** Fields that should be coerced from string to number (auto-detected) */
  numericFields: string[];

  /** Fields that should be coerced from string to boolean (auto-detected) */
  booleanFields: string[];

  /** Array fields that should be split from comma-separated string (auto-detected) */
  arrayFields: string[];

  /** Properties for Moleculer REPL introspection */
  properties: Record<string, PropertyMeta>;

  /**
   * Marker indicating this is an extended params object.
   * Used by type guards.
   */
  readonly __typia_params_with_schema__: true;
}

/**
 * Union type for action params.
 * Supports both legacy (function only) and new (with schema) formats.
 */
export type ActionParams<T> = TypiaValidator<T> | TypiaParamsWithSchema<T>;

// ============================================================
// Helper functions
// ============================================================

/**
 * Extract fields by JSON Schema type from schema properties.
 *
 * @internal
 */
function extractFieldsByType(schema: Record<string, unknown>, targetTypes: string[]): string[] {
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return [];

  return Object.entries(props)
    .filter(([_, prop]) => targetTypes.includes(prop.type as string))
    .map(([key]) => key);
}

/**
 * Build properties object for Moleculer REPL introspection.
 *
 * @internal
 */
function buildProperties(schema: Record<string, unknown>): Record<string, PropertyMeta> {
  const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return {};

  const required = (schema.required as string[]) ?? [];
  const result: Record<string, PropertyMeta> = {};

  for (const [key, prop] of Object.entries(props)) {
    result[key] = {
      type: prop.type as string,
      optional: !required.includes(key),
      // Include constraints if present
      ...(prop.minimum !== undefined && { minimum: prop.minimum as number }),
      ...(prop.maximum !== undefined && { maximum: prop.maximum as number }),
      ...(prop.minLength !== undefined && { minLength: prop.minLength as number }),
      ...(prop.maxLength !== undefined && { maxLength: prop.maxLength as number }),
      ...(prop.pattern !== undefined && { pattern: prop.pattern as string }),
      ...(prop.format !== undefined && { format: prop.format as string }),
      ...(prop.enum !== undefined && { enum: prop.enum as string[] }),
      ...(prop.description !== undefined && { description: prop.description as string }),
    };
  }

  return result;
}

/**
 * Create typia params with schema for REPL introspection
 * and automatic coercion field detection.
 *
 * NOTE: Due to typia's compile-time nature, you must pass pre-created
 * validator and schema. Use the helper pattern below.
 *
 * @example
 * ```typescript
 * interface ListUsersParams {
 *   tenantId: string;
 *   limit?: number;
 *   offset?: number;
 *   active?: boolean;
 * }
 *
 * // In action file (compile-time creation):
 * const listUsersValidator = typia.createValidate<ListUsersParams>();
 * const listUsersSchema = typia.json.schemas<[ListUsersParams]>();
 *
 * // In action definition:
 * params: createTypiaParams(listUsersValidator, listUsersSchema)
 *
 * // Automatically detects from schema:
 * // - numericFields: ['limit', 'offset']
 * // - booleanFields: ['active']
 * // - properties for REPL display
 * ```
 *
 * @param validate - Typia validator function (typia.createValidate<T>())
 * @param schemaCollection - Typia JSON schema (typia.json.schemas<[T]>())
 * @returns TypiaParamsWithSchema<T> with validator and schema metadata
 */
export function createTypiaParams<T>(
  validate: TypiaValidator<T>,
  schemaCollection: { components?: { schemas?: Record<string, unknown> } },
): TypiaParamsWithSchema<T> {
  // Extract first schema from collection
  const schemas = schemaCollection.components?.schemas as
    | Record<string, Record<string, unknown>>
    | undefined;
  const schemaNames = Object.keys(schemas ?? {});
  const typeName = schemaNames[0];
  const schema = typeName !== undefined ? (schemas?.[typeName] ?? {}) : {};

  return {
    validate,
    schema,
    numericFields: extractFieldsByType(schema, ['number', 'integer']),
    booleanFields: extractFieldsByType(schema, ['boolean']),
    arrayFields: extractFieldsByType(schema, ['array']),
    properties: buildProperties(schema),
    __typia_params_with_schema__: true,
  };
}

/**
 * Create typia params for GET endpoints with query string coercion.
 * Alias for createTypiaParams - all coercion fields are detected.
 *
 * @example
 * ```typescript
 * const validator = typia.createValidate<ListEntitiesParams>();
 * const schema = typia.json.schemas<[ListEntitiesParams]>();
 *
 * // For GET endpoints where all params come from query string
 * params: createQueryParams(validator, schema)
 * ```
 */
export function createQueryParams<T>(
  validate: TypiaValidator<T>,
  schemaCollection: { components?: { schemas?: Record<string, unknown> } },
): TypiaParamsWithSchema<T> {
  return createTypiaParams(validate, schemaCollection);
}

/**
 * Create typia params for POST endpoints (JSON body).
 * Coercion fields are cleared since JSON body has correct types.
 *
 * @example
 * ```typescript
 * const validator = typia.createValidate<CreateUserParams>();
 * const schema = typia.json.schemas<[CreateUserParams]>();
 *
 * // For POST endpoints with JSON body
 * params: createBodyParams(validator, schema)
 * ```
 */
export function createBodyParams<T>(
  validate: TypiaValidator<T>,
  schemaCollection: { components?: { schemas?: Record<string, unknown> } },
): TypiaParamsWithSchema<T> {
  const paramsWithSchema = createTypiaParams(validate, schemaCollection);
  // Clear coercion fields - JSON body doesn't need coercion
  return {
    ...paramsWithSchema,
    numericFields: [],
    booleanFields: [],
    arrayFields: [],
  };
}

// ============================================================
// Type guards
// ============================================================

/**
 * Check if params is a TypiaParamsWithSchema (new format with schema).
 *
 * @param params - Action params (validator function or schema object)
 * @returns true if params has schema metadata
 */
export function isTypiaParamsWithSchema<T>(
  params: ActionParams<T>,
): params is TypiaParamsWithSchema<T> {
  return (
    typeof params === 'object' &&
    params !== null &&
    '__typia_params_with_schema__' in params &&
    params.__typia_params_with_schema__ === true
  );
}

/**
 * Check if params is a TypiaValidator function (legacy format).
 *
 * @param params - Action params (validator function or schema object)
 * @returns true if params is a validator function
 */
export function isTypiaValidator<T>(params: ActionParams<T>): params is TypiaValidator<T> {
  return typeof params === 'function';
}

/**
 * Get validator function from either format.
 *
 * @param params - Action params (validator function or schema object)
 * @returns The typia validator function
 */
export function getValidator<T>(params: ActionParams<T>): TypiaValidator<T> {
  if (isTypiaParamsWithSchema(params)) {
    return params.validate;
  }
  return params;
}

/**
 * Get numeric fields for coercion (empty if legacy format).
 *
 * @param params - Action params (validator function or schema object)
 * @returns Array of field names to coerce to number
 */
export function getNumericFields<T>(params: ActionParams<T>): string[] {
  if (isTypiaParamsWithSchema(params)) {
    return params.numericFields;
  }
  return [];
}

/**
 * Get boolean fields for coercion (empty if legacy format).
 *
 * @param params - Action params (validator function or schema object)
 * @returns Array of field names to coerce to boolean
 */
export function getBooleanFields<T>(params: ActionParams<T>): string[] {
  if (isTypiaParamsWithSchema(params)) {
    return params.booleanFields;
  }
  return [];
}

/**
 * Get array fields for coercion (empty if legacy format).
 *
 * @param params - Action params (validator function or schema object)
 * @returns Array of field names to coerce to array
 */
export function getArrayFields<T>(params: ActionParams<T>): string[] {
  if (isTypiaParamsWithSchema(params)) {
    return params.arrayFields;
  }
  return [];
}

/**
 * Get properties for REPL introspection (empty if legacy format).
 *
 * @param params - Action params (validator function or schema object)
 * @returns Properties object for Moleculer REPL
 */
export function getProperties<T>(params: ActionParams<T>): Record<string, PropertyMeta> {
  if (isTypiaParamsWithSchema(params)) {
    return params.properties;
  }
  return {};
}
