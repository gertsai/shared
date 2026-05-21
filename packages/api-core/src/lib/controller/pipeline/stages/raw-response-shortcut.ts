// SPDX-License-Identifier: Apache-2.0
/**
 * Stage 9 — raw-mode short-circuit.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021 §Stage 9).
 *
 * PRESERVED VERBATIM from ApiController.class.ts:771-776 (post-PR-3 actual location).
 */

import { PipelineShortCircuit } from '../types';
import type { PipelineContext, PipelineDeps } from '../types';

/**
 * Stage 9 — raw-mode short-circuit.
 *
 * PRESERVED VERBATIM from ApiController.class.ts:771-776 (post-PR-3 actual location).
 *
 * If the handler returned `{ raw: true }`, log an info message and throw
 * `PipelineShortCircuit(result.data)`.  The runner catches this sentinel
 * OUTSIDE the `translateError` path and returns `data` directly — no
 * response-validation or wrapping occurs (SPEC-021 I-3).
 *
 * @param ctx  - Pipeline context carrying `result` from stage 8
 * @param deps - Pipeline dependencies (logger + action name)
 * @returns Unchanged `PipelineContext` when `raw` is falsy
 * @throws `PipelineShortCircuit` carrying the raw data when `raw === true`
 */
export async function rawResponseShortcut(
  ctx: PipelineContext,
  deps: PipelineDeps,
): Promise<PipelineContext> {
  if (ctx.result?.raw === true) {
    deps.logger?.info('Action returning raw response', deps.action.name);
    throw new PipelineShortCircuit(ctx.result.data);
  }
  return ctx;
}
