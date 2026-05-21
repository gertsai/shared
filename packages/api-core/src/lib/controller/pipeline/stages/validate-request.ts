// SPDX-License-Identifier: Apache-2.0
/**
 * Stage 5 — validate request params against the action's typia validator.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021 §Stage 5).
 *
 * PRESERVED VERBATIM from ApiController.class.ts:784-790.
 */

import { getValidator } from '../../../common';
import { APIError } from '../../../error';
import { ResponseCode } from '../../../apiResponse';
import type { PipelineContext, PipelineDeps } from '../types';

/**
 * Validate request params using the action's configured validator.
 *
 * Supports both legacy `TypiaValidator<T>` and the new `TypiaParamsWithSchema<T>`
 * format — `getValidator` handles both.
 *
 * On validation failure throws `APIError(BAD_REQUEST__INVALID_PARAMS, errors)`.
 *
 * PRESERVED VERBATIM from ApiController.class.ts:784-790.
 *
 * @param ctx  - Incoming pipeline context (must carry `params` — tenant-injected by stage 4)
 * @param deps - Pipeline dependencies (action accessed for params validator)
 * @returns Unchanged `PipelineContext` on success
 * @throws `APIError(BAD_REQUEST__INVALID_PARAMS)` when params fail validation
 */
export async function validateRequest(
  ctx: PipelineContext,
  deps: PipelineDeps,
): Promise<PipelineContext> {
  // Get validator (supports both legacy and new format)
  const validator = getValidator(deps.action.options.params);
  const requestIsValid = validator(ctx.params);

  if (!requestIsValid.success) {
    throw new APIError(ResponseCode.BAD_REQUEST__INVALID_PARAMS, requestIsValid.errors);
  }

  return ctx;
}
