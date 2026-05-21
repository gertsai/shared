// SPDX-License-Identifier: Apache-2.0
/**
 * Stage 12 — translate any thrown error to APIError.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021 §Stage 12): Dormant infrastructure, PR-1.
 *
 * PRESERVED VERBATIM from ApiController.class.ts:885-903.
 */

import type { PipelineContext, PipelineDeps } from '../types';
import { APIError } from '../../../error';
import { ResponseCode } from '../../../apiResponse';

/**
 * Translate any thrown value into an `APIError`.
 *
 * Called from PipelineRunner's catch block. Returns an Error (does not throw)
 * so that the runner can re-throw after cleanup.
 *
 * Resolution order (PRESERVED VERBATIM from ApiController.class.ts:885-903):
 * 1. `APIError`             → rethrow as-is
 * 2. `__ORCHESTRA_ERROR__`  → `APIError.fromJSON` (cross-service serialised errors)
 * 3. `Error`                → `APIError.fromError`
 * 4. unknown                → `INTERNAL_ERROR`
 *
 * @param err  - The caught value (unknown type, may be non-Error)
 * @param _ctx - Pipeline context at time of failure (unused in stage 12, reserved for PR-4+)
 * @param deps - Pipeline dependencies (logger for unknown-error logging)
 * @returns    An `Error` (always `APIError`) to be re-thrown by the runner
 */
export function translateError(err: unknown, _ctx: PipelineContext, deps: PipelineDeps): Error {
  if (err instanceof APIError) {
    return err;
  }

  // @ts-ignore — duck-type check for Orchestra-flavoured cross-service errors;
  // these arrive as plain objects serialised over Moleculer transport, so they
  // are not instanceof anything useful.
  if (err && (err as { __ORCHESTRA_ERROR__?: boolean }).__ORCHESTRA_ERROR__ === true) {
    // @ts-ignore
    return APIError.fromJSON(err as Record<string, unknown>);
  }

  if (err instanceof Error) {
    return APIError.fromError(err);
  }

  deps.logger?.error('Unknown error occurred', err);
  return new APIError(ResponseCode.INTERNAL_ERROR);
}
