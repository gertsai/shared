// SPDX-License-Identifier: Apache-2.0
/**
 * PipelineRunner — sequential async stage executor.
 *
 * Wave 27 (PRD-065 / RFC-027):
 *   - PR-1: dormant infrastructure
 *   - PR-2: added runStagesSerially bridge helper (temporary)
 *   - PR-3: bridge extended to stages 6-8
 *   - PR-4: full PipelineRunner wired; runStagesSerially removed
 */

import { PipelineShortCircuit } from './types';
import type { PipelineContext, PipelineDeps, Stage } from './types';
import { translateError } from './stages/translate-error';
import { cleanup } from './stages/cleanup';
import { APIError } from '../../error';
import { ResponseCode } from '../../apiResponse';

/**
 * Executes a sequence of pipeline stages, threading `PipelineContext` through each.
 *
 * Runner semantics (per RFC-027 §Runner semantics):
 * - Stages run sequentially; each stage receives the output context of the previous.
 * - Any stage may throw `PipelineShortCircuit` to bypass remaining stages and return
 *   `shortCircuit.data` immediately (cleanup still runs; SPEC-021 I-3).
 * - Any other thrown value is translated to `APIError` via stage 12 (`translateError`)
 *   and re-thrown (cleanup still runs).
 * - `cleanup` (stage 13) always executes in the `finally` block regardless of outcome.
 *
 * Return value after stage 11 (wrapResponse):
 * - `ctx.result.code` is set by `wrapResponse` — runner adds `success: true` and
 *   returns the final `{ success, code, message, data }` envelope.
 *
 * @example
 * ```ts
 * const runner = new PipelineRunner(DEFAULT_STAGES);
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
   * @returns       The action result envelope (from `ctx.result` after wrapResponse)
   *                or a short-circuit value from `PipelineShortCircuit.data`
   */
  async run(initial: PipelineContext, deps: PipelineDeps): Promise<unknown> {
    let ctx: PipelineContext = initial;

    try {
      for (const stage of this.stages) {
        // Wave 33.C (EVID-083 W5): opt-in per-stage timeout. When
        // `deps.stageTimeoutMs` is set, race the stage promise against a
        // setTimeout that throws `APIError(REQUEST_TIMEOUT)`. The timer
        // handle is always cleared (success OR reject path) via the
        // `finally` block to prevent CWE-770 unreleased-resource leaks under
        // load. When the field is undefined, fall back to the original
        // un-raced call so existing consumers see zero behaviour change.
        if (deps.stageTimeoutMs !== undefined) {
          const timeoutMs = deps.stageTimeoutMs;
          let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
          try {
            ctx = await Promise.race<PipelineContext>([
              stage(ctx, deps),
              new Promise<never>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                  reject(
                    new APIError(
                      ResponseCode.REQUEST_TIMEOUT,
                      `pipeline stage exceeded ${timeoutMs}ms timeout`,
                    ),
                  );
                }, timeoutMs);
              }),
            ]);
          } finally {
            if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
          }
        } else {
          ctx = await stage(ctx, deps);
        }
      }

      // After stage 11 (wrapResponse), ctx.result contains { code, message, data }.
      // Runner adds the `success: true` field to produce the final observable envelope.
      // RFC-027 §Runner semantics: when code is set (wrapResponse guarantees this
      // for any run that reaches the end), return the full success envelope.
      if (ctx.result?.code !== undefined) {
        return {
          success: true,
          code: ctx.result.code,
          message: ctx.result.message,
          data: ctx.result.data,
        };
      }

      // Fallback for partial pipelines (e.g. empty stages list in tests)
      return ctx.result?.data;
    } catch (err: unknown) {
      if (err instanceof PipelineShortCircuit) {
        return err.data;
      }
      throw translateError(err, ctx, deps);
    } finally {
      // Wave 32.C (EVID-083 HIGH-2): cleanup must NEVER mask the original error.
      // JS finally-vs-catch semantics: a throw in finally replaces the in-flight
      // catch-rethrow, silently losing the diagnostic. Swallow cleanup errors here
      // and log via the structured logger — the original error (or normal return)
      // takes precedence.
      try {
        await cleanup(ctx, deps);
      } catch (cleanupErr) {
        deps.logger?.error(
          'PipelineRunner: cleanup threw — original error preserved',
          cleanupErr,
        );
      }
    }
  }
}
