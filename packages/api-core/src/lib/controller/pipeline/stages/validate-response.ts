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
 * `ApiController._config.strictResponseValidation` at schema-build time) as an
 * explicit narrowly-typed field, avoiding any circular-import footgun.
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

  // Wave 33.C (EVID-083 W6): drop redundant `as { success; errors? }` cast —
  // `action.options.response` is `TypiaValidator<ResponseType>` which is
  // `ReturnType<typeof typia.createValidate<T>>` and that already returns
  // `IValidation` (`{ success: boolean; errors: IValidation.IError[] }`).
  // The cast was a leftover from an earlier untyped intermediate; structural
  // inference already gives us the same shape with full type-safety.
  const responseIsValid = action.options.response(data);

  if (!responseIsValid.success) {
    if (
      action.options.strictResponseValidation === true ||
      strictResponseValidation === true
    ) {
      throw new APIError(ResponseCode.BAD_REQUEST__INVALID_RESPONSE, responseIsValid.errors);
    } else {
      // Wave 33.C (EVID-083 W8): strip `value` field from logged errors —
      // typia's `IValidation.IError` includes the offending input value which
      // may contain PII / secrets (passwords, tokens, PHI). In loose-mode
      // (non-strict) we still want diagnostic visibility, but only the
      // structural metadata (`path` + `expected`), never the raw value.
      const safeErrors = responseIsValid.errors.map((e) => ({
        path: e.path,
        expected: e.expected,
        // intentionally omit `value` — see Wave 33.C (EVID-083 W8) above.
      }));
      logger?.error(action.name, 'Response validation failed', safeErrors);
    }
  }

  return ctx;
}
