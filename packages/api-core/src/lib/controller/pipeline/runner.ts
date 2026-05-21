// SPDX-License-Identifier: Apache-2.0
/**
 * PipelineRunner — sequential async stage executor.
 *
 * Wave 27 (PRD-065 / RFC-027): Dormant infrastructure, PR-1.
 * Not wired to ApiController yet — wiring happens in PR-2 onwards.
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
