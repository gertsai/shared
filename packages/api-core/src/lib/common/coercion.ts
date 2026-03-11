/**
 * Query Parameter Coercion Utilities
 *
 * HTTP query parameters always arrive as strings.
 * These functions coerce them to the correct types based on schema metadata.
 *
 * @module api-core/common/coercion
 * @see RFC-065-TYPIA-VALIDATOR-MOLECULER.md
 */

/**
 * Coerce string values to numbers for specified fields.
 * Mutates the params object in-place.
 *
 * @param params - Request parameters object
 * @param fields - Field names to coerce
 *
 * @example
 * ```typescript
 * const params = { limit: '10', offset: '0', name: 'test' };
 * coerceNumericFields(params, ['limit', 'offset']);
 * // params = { limit: 10, offset: 0, name: 'test' }
 * ```
 */
export function coerceNumericFields(params: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    const value = params[field];
    if (typeof value === 'string') {
      const num = Number(value);
      if (!isNaN(num)) {
        params[field] = num;
      }
    }
  }
}

/**
 * Coerce string values to booleans for specified fields.
 * Supports: "true", "false", "1", "0", "yes", "no"
 * Mutates the params object in-place.
 *
 * @param params - Request parameters object
 * @param fields - Field names to coerce
 *
 * @example
 * ```typescript
 * const params = { active: 'true', deleted: 'false', enabled: '1' };
 * coerceBooleanFields(params, ['active', 'deleted', 'enabled']);
 * // params = { active: true, deleted: false, enabled: true }
 * ```
 */
export function coerceBooleanFields(params: Record<string, unknown>, fields: string[]): void {
  const trueValues = new Set(['true', '1', 'yes']);
  const falseValues = new Set(['false', '0', 'no']);

  for (const field of fields) {
    const value = params[field];
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (trueValues.has(lower)) {
        params[field] = true;
      } else if (falseValues.has(lower)) {
        params[field] = false;
      }
    }
  }
}

/**
 * Coerce comma-separated strings to arrays for specified fields.
 * Supports both ?a=1&a=2 (already array) and ?a=1,2 (comma-separated).
 * Mutates the params object in-place.
 *
 * @param params - Request parameters object
 * @param fields - Field names to coerce
 *
 * @example
 * ```typescript
 * const params = { tags: 'a,b,c', states: 'pending' };
 * coerceArrayFields(params, ['tags', 'states']);
 * // params = { tags: ['a', 'b', 'c'], states: 'pending' }
 * ```
 */
export function coerceArrayFields(params: Record<string, unknown>, fields: string[]): void {
  for (const field of fields) {
    const value = params[field];
    if (typeof value === 'string' && value.includes(',')) {
      params[field] = value
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    }
  }
}

/**
 * Schema metadata for smart coercion
 */
export interface CoercionSchema {
  /** Fields to coerce from string to number */
  numericFields?: string[];
  /** Fields to coerce from string to boolean */
  booleanFields?: string[];
  /** Fields to coerce from comma-separated string to array */
  arrayFields?: string[];
}

/**
 * Smart coercion based on schema metadata.
 * Applies all coercions in correct order: arrays first, then primitives.
 *
 * @param params - Request parameters object
 * @param schema - Coercion schema with field lists
 *
 * @example
 * ```typescript
 * const params = { limit: '10', active: 'true', tags: 'a,b' };
 * smartCoerce(params, {
 *   numericFields: ['limit'],
 *   booleanFields: ['active'],
 *   arrayFields: ['tags'],
 * });
 * // params = { limit: 10, active: true, tags: ['a', 'b'] }
 * ```
 */
export function smartCoerce(params: Record<string, unknown>, schema: CoercionSchema): void {
  // Order matters: arrays first, then primitives
  if (schema.arrayFields?.length) {
    coerceArrayFields(params, schema.arrayFields);
  }
  if (schema.numericFields?.length) {
    coerceNumericFields(params, schema.numericFields);
  }
  if (schema.booleanFields?.length) {
    coerceBooleanFields(params, schema.booleanFields);
  }
}

// ============================================================
// Legacy support - keep for backward compatibility
// ============================================================

/**
 * Legacy coercion with hard-coded field list.
 * Use smartCoerce with schema instead for new code.
 *
 * @deprecated Use smartCoerce with schema instead
 */
export function coerceQueryParams(params: Record<string, unknown>): void {
  const numericParams = [
    // Pagination
    'limit',
    'offset',
    'page',
    'pageSize',
    'take',
    'skip',
    // Graph/Vector
    'level',
    'topK',
    'maxResults',
    'minScore',
    'maxCandidates',
    // LLM
    'maxTokens',
    'temperature',
    // Queue/Scheduler
    'priority',
    'timeout',
    'delayMs',
    'attempt',
    'concurrency',
    // Files
    'keepVersions',
    'expiresInSeconds',
    'versionNum',
    // Observe/Analytics
    'days',
    // Generic
    'version',
  ];

  const booleanParams = [
    // Flags
    'sync',
    'recursive',
    'permanent',
    'force',
    'detailed',
    'verbose',
    // Purge/Ingest
    'includeFiles',
    'includeVectors',
    'includeGraph',
    // Files
    'includeMeta',
    'includeContent',
    // Generic
    'active',
    'enabled',
    'withChildren',
    'showArchived',
    'showSubprojects',
    'includeMuted',
    'includeSystem',
    'isBuiltIn',
    'isVisible',
    'mfaRequired',
    'useOntology',
  ];

  coerceNumericFields(params, numericParams);
  coerceBooleanFields(params, booleanParams);
}
