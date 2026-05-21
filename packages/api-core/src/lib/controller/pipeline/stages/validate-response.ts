// SPDX-License-Identifier: Apache-2.0
/**
 * Stage 10 — response validation.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021 §Stage 10).
 *
 * PRESERVED VERBATIM from ApiController.class.ts:778-799 (post-PR-3 actual location).
 */

import { APIError } from '../../../error';
import { ResponseCode } from '../../../apiResponse';
import config from '../../../../config';
import type { PipelineContext, PipelineDeps } from '../types';

/**
 * Stage 10 — response validation (when `config.RESPONSE_VALIDATION === true`).
 *
 * PRESERVED VERBATIM from ApiController.class.ts:778-799 (post-PR-3 actual location).
 *
 * Behaviour (per SPEC-021 §Stage 10):
 * - No-op when `config.RESPONSE_VALIDATION !== true`.
 * - Calls `action.options.response(result.data)` to obtain a typia validation result.
 * - If validation succeeds: pass through unchanged.
 * - If validation fails:
 *   - If `action.options.strictResponseValidation === true` OR
 *     `deps.strictResponseValidation === true` (controller-level flag):
 *     throw `APIError(BAD_REQUEST__INVALID_RESPONSE, errors)`
 *   - Otherwise: log the errors via `deps.logger?.error` and pass through.
 *
 * The `strictResponseValidation` flag is passed via `PipelineDeps` (captured from
 * `ApiController._config.strictResponseValidation` at schema-build time) rather
 * than accessed through `deps.controller` to avoid a circular-import footgun.
 *
 * @param ctx  - Pipeline context carrying `result` from stage 8/9
 * @param deps - Pipeline dependencies (action, logger, strictResponseValidation)
 * @returns Unchanged `PipelineContext` when validation passes or is skipped
 * @throws `APIError(BAD_REQUEST__INVALID_RESPONSE)` in strict mode on invalid response
 */
export async function validateResponse(
  ctx: PipelineContext,
  deps: PipelineDeps,
): Promise<PipelineContext> {
  if (config.RESPONSE_VALIDATION !== true) {
    return ctx;
  }

  const { action, logger, strictResponseValidation } = deps;
  const data = ctx.result?.data;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const responseIsValid = action.options.response(data) as { success: boolean; errors?: unknown };

  if (!responseIsValid.success) {
    if (
      action.options.strictResponseValidation === true ||
      strictResponseValidation === true
    ) {
      throw new APIError(ResponseCode.BAD_REQUEST__INVALID_RESPONSE, responseIsValid.errors);
    } else {
      logger?.error(
        action.name,
        'Response validation failed',
        responseIsValid.errors,
      );
    }
  }

  return ctx;
}
