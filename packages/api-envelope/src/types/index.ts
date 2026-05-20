/**
 * RFC-030 Envelope Type Definitions
 *
 * Source of truth for all gerts.ai API envelope types.
 *
 * @packageDocumentation
 */
export * from './response';
export * from './error';
export * from './list';

// ============================================================================
// Combined Types
// ============================================================================

import type { ProblemDetails } from '@gertsai/errors/http';
import type { GertsResponse } from './response';
import type { GertsListResponse } from './list';

/**
 * Any gerts.ai API response (success, error, or list).
 *
 * Wave 14.6 (PRD-054 / EVID-057 §Error Envelope): the error arm is now
 * canonical RFC 9457 `ProblemDetails` from `@gertsai/errors/http`
 * (previously the RFC-030 hybrid `GertsErrorResponse`).
 */
export type GertsAnyResponse<T = unknown> =
  | GertsResponse<T>
  | ProblemDetails
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
