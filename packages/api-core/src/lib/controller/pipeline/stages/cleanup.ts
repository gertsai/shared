// SPDX-License-Identifier: Apache-2.0
/**
 * Stage 13 — finally cleanup.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021 §Stage 13): Dormant infrastructure, PR-1.
 *
 * PRESERVED VERBATIM from ApiController.class.ts:903-906.
 */

import type { PipelineContext, PipelineDeps } from '../types';

/**
 * Unconditional cleanup stage — always runs in `PipelineRunner`'s `finally` block,
 * regardless of whether the pipeline succeeded or threw.
 *
 * Responsibilities (PRESERVED VERBATIM from ApiController.class.ts:903-906):
 * 1. Log `'Action finished'` with the action name
 * 2. Destroy the session (if one was established in stage 6)
 *
 * @param ctx  - Pipeline context at completion (may be partial if a stage threw early)
 * @param deps - Pipeline dependencies (logger + action metadata)
 */
export async function cleanup(ctx: PipelineContext, deps: PipelineDeps): Promise<void> {
  deps.logger?.info('Action finished', deps.action.name);
  ctx.session?.$destroy();
}
