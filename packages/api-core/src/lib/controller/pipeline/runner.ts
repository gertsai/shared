// SPDX-License-Identifier: Apache-2.0
/**
 * PipelineRunner — sequential async stage executor.
 *
 * Wave 27 (PRD-065 / RFC-027): Dormant infrastructure, PR-1.
 * Not wired to ApiController yet — wiring happens in PR-2 onwards.
 *
 * PR-2: adds `runStagesSerially` — temporary bridge helper used by
 * `ApiController._createActionSchema` to delegate stages 1-5 while the
 * remaining stages (6-13) stay inline. Removed in PR-4 once `PipelineRunner`
 * takes over the full closure.
 */

import { PipelineShortCircuit } from './types';
import type { PipelineContext, PipelineDeps, Stage } from './types';
import { translateError } from './stages/translate-error';
import { cleanup } from './stages/cleanup';

/**
 * Executes a sequence of pipeline stages, threading `PipelineContext` through each.
 *
 * Runner semantics (per RFC-027 §Runner semantics):
 * - Stages run sequentially; each stage receives the output context of the previous.
 * - Any stage may throw `PipelineShortCircuit` to bypass remaining stages and return
 *   `shortCircuit.data` immediately (cleanup still runs).
 * - Any other thrown value is translated to `APIError` via stage 12 (`translateError`)
 *   and re-thrown (cleanup still runs).
 * - `cleanup` (stage 13) always executes in the `finally` block regardless of outcome.
 *
 * @example
 * ```ts
 * const runner = new PipelineRunner([stageA, stageB, stageC]);
 * const result = await runner.run(initialCtx, deps);
 * ```
 */
/**
 * Temporary bridge helper used by `ApiController._createActionSchema` in PR-2.
 *
 * Executes a readonly list of pipeline stages sequentially, threading
 * `PipelineContext` through each, and returns the final context.
 * Does NOT apply `translateError` or `cleanup` — those remain the responsibility
 * of the surrounding `try/catch/finally` in `_createActionSchema`.
 *
 * This helper is intentionally simpler than `PipelineRunner.run()`: it has no
 * short-circuit detection, no error translation, and no cleanup — all of which
 * the existing closure already handles for stages 6-13.
 *
 * Removed in PR-4 when `PipelineRunner` takes over the full closure.
 *
 * @param stages  - Stages to execute in order
 * @param initial - Seed context
 * @param deps    - Shared dependencies injected into every stage
 * @returns       Final `PipelineContext` after all stages have run
 */
export async function runStagesSerially(
  stages: readonly Stage[],
  initial: PipelineContext,
  deps: PipelineDeps,
): Promise<PipelineContext> {
  let ctx = initial;
  for (const stage of stages) {
    ctx = await stage(ctx, deps);
  }
  return ctx;
}

export class PipelineRunner {
  constructor(private readonly stages: readonly Stage[]) {}

  /**
   * Execute all stages and return the final action result.
   *
   * @param initial - Seed context for the first stage
   * @param deps    - Shared dependencies injected into every stage
   * @returns       The action result data (from `ctx.result.data` or a short-circuit value)
   */
  async run(initial: PipelineContext, deps: PipelineDeps): Promise<unknown> {
    let ctx: PipelineContext = initial;

    try {
      for (const stage of this.stages) {
        ctx = await stage(ctx, deps);
      }

      // PR-1 placeholder: result wrapping is handled by the wrapResponse stage (PR-4).
      // Until then, return raw result data (or undefined if no result set).
      return ctx.result?.data;
    } catch (err: unknown) {
      if (err instanceof PipelineShortCircuit) {
        return err.data;
      }
      throw translateError(err, ctx, deps);
    } finally {
      await cleanup(ctx, deps);
    }
  }
}
