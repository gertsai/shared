// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/api-core/contracts
 *
 * Pure TypeScript types и pure functions для API contracts.
 * Zero side effects, zero peer deps на Moleculer/BullMQ/dotenv/GCP.
 * Safe для browser context, FastAPI clients, Rust ts-types.
 *
 * Includes:
 * - error: APIError, OIDCError, ResponseCode, ErrorCode
 * - apiResponse: OrchestraApiResponse и response envelope types
 * - envelope: response wrappers и type guards
 * - common: pure helpers (coercion, ip-utils, typia-params, types)
 * - diagnostics: pure types/registry/renderer
 */
export * from '../lib/error';
export * from '../lib/apiResponse';
export * from '../lib/envelope';
export * from '../lib/common';
export * from '../lib/diagnostics';
