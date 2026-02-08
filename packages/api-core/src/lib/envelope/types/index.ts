/**
 * RFC-030 Envelope Type Definitions
 *
 * Source of truth for all gerts.ai API envelope types.
 * Re-exported by @gerts/api-types for backwards compatibility.
 *
 * @packageDocumentation
 */
export * from './response';
export * from './error';
export * from './list';

// ============================================================================
// Combined Types
// ============================================================================

import type { GertsResponse } from './response';
import type { GertsErrorResponse } from './error';
import type { GertsListResponse } from './list';

/**
 * Any gerts.ai API response (success, error, or list).
 */
export type GertsAnyResponse<T = unknown> =
  | GertsResponse<T>
  | GertsErrorResponse
  | GertsListResponse<T>;

/**
 * Type guard for any successful response (regular or list).
 */
export function isAnySuccessResponse<T>(
  response: unknown,
): response is GertsResponse<T> | GertsListResponse<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    (response as { success: unknown }).success === true
  );
}
