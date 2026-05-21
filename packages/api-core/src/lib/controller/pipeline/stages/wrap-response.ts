// SPDX-License-Identifier: Apache-2.0
/**
 * Stage 11 — wrap handler result in the response envelope.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021 §Stage 11).
 *
 * PRESERVED VERBATIM from ApiController.class.ts:801-808 (post-PR-3 actual location).
 */

import { ResponseCode } from '../../../apiResponse';
import type { PipelineContext, PipelineDeps } from '../types';

/**
 * Stage 11 — wrap the handler result into the `{ code, message, data }` envelope.
 *
 * PRESERVED VERBATIM from ApiController.class.ts:801-808 (post-PR-3 actual location).
 *
 * The `success: true` field is NOT added here — it is added by the runner when
 * it builds the final return value from `ctx.result` after all stages complete.
 * This keeps the responsibility boundary clean: stages accumulate context,
 * the runner produces the observable return value.
 *
 * Fallback chain for `code` (SPEC-021 §Stage 11):
 *   `result.code` → `action.options.responseCode` → `ResponseCode.SUCCESS`
 *
 * Fallback chain for `message`:
 *   `result.message` → `action.options.responseMessage`
 *
 * @param ctx  - Pipeline context carrying `result` from stages 8–10
 * @param deps - Pipeline dependencies (action options)
 * @returns Updated `PipelineContext` with `result` populated as the envelope
 * @throws Never — this stage has no failure path
 */
export async function wrapResponse(
  ctx: PipelineContext,
  deps: PipelineDeps,
): Promise<PipelineContext> {
  // Wave 32.C (EVID-083 HIGH-9): `setStageOverride('invokeHandler', ...)` lets a
  // consumer replace stage 8 with one that doesn't populate `ctx.result`. Without
  // this guard, the `!` would degrade to a `TypeError` at runtime — convert to a
  // clear diagnostic instead. TS narrows `ctx.result` to non-undefined below.
  if (!ctx.result) {
    throw new Error(
      'wrapResponse: ctx.result was not populated. ' +
        'A custom stage replaced `invokeHandler` (or another upstream stage) without setting ctx.result. ' +
        'Custom invokeHandler overrides MUST return a context with `result: { code?, message?, data, raw? }`.',
    );
  }
  const r = ctx.result;
  const finalCode = r.code ?? deps.action.options.responseCode ?? ResponseCode.SUCCESS;

  // Compute resolved message (verbatim fallback chain: result.message → action.responseMessage)
  // Use conditional spread to stay compatible with exactOptionalPropertyTypes — omit key
  // entirely when the resolved value is undefined rather than assigning undefined explicitly.
  const resolvedMessage = r.message ?? deps.action.options.responseMessage;

  return {
    ...ctx,
    result: {
      ...r,
      code: finalCode,
      ...(resolvedMessage !== undefined && { message: resolvedMessage }),
      data: r.data,
    },
  };
}
