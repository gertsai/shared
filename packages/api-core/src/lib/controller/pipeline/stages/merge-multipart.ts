// SPDX-License-Identifier: Apache-2.0
/**
 * Stage 2 — merge multipart fields into params.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021 §Stage 2).
 *
 * PRESERVED VERBATIM from ApiController.class.ts:748-750.
 */

import type { PipelineContext, PipelineDeps } from '../types';

/**
 * Merge `ctx.meta.$multipart` into `params` when present.
 *
 * This is the one stage that mutates `params` in-place via `Object.assign`
 * (preserves verbatim behaviour of the original closure).
 * No-op when `ctx.meta.$multipart` is falsy.
 *
 * PRESERVED VERBATIM from ApiController.class.ts:748-750.
 *
 * @param ctx  - Incoming pipeline context (must carry `params` set by stage 1)
 * @param _deps - Pipeline dependencies (unused by this stage)
 * @returns Same `PipelineContext` reference (params mutated in-place per original)
 */
export async function mergeMultipart(
  ctx: PipelineContext,
  _deps: PipelineDeps,
): Promise<PipelineContext> {
  if (ctx.ctx.meta.$multipart) {
    Object.assign(ctx.params as Record<string, unknown>, ctx.ctx.meta.$multipart);
  }

  return ctx;
}
