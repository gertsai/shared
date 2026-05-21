// SPDX-License-Identifier: Apache-2.0
/**
 * Stage 8 — invoke the action's handler with assembled deps.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021 §Stage 8).
 *
 * PRESERVED VERBATIM from ApiController.class.ts:787-810.
 */

import type { PipelineContext, PipelineDeps } from '../types';
import { respond } from '../helpers';

/**
 * Stage 8 — invoke the action's handler with assembled deps.
 *
 * PRESERVED VERBATIM from ApiController.class.ts:787-810.
 *
 * Assembles the deps object and calls `action.options.handler.call(service, deps)`.
 * The `this` context is `deps.service` (the Moleculer service instance), preserving
 * the original closure's `action.options.handler.call(this, ...)` semantics.
 *
 * SPEC-021 I-4: `traceContext` is consumed here from `ctx.traceContext` (built once
 * in stage 7) and reused by the `addJob` wrapper; MUST NOT be rebuilt per call.
 *
 * The assembled deps shape matches `ActionHandlerCtx` from controller/types.ts:
 *   session, ctx, service, params, addJob, getQueue, files, call, logger, respond
 *
 * @param ctx  - Full pipeline context (must carry params, file, fileMeta, session, traceContext)
 * @param deps - Pipeline dependencies (action, service, logger)
 * @returns Updated `PipelineContext` with `result` populated from handler return value
 * @throws Any error thrown by the handler (passed through to translateError via runner)
 */
export async function invokeHandler(
  ctx: PipelineContext,
  deps: PipelineDeps,
): Promise<PipelineContext> {
  const { action, service, logger } = deps;
  const { traceContext, session, params, file, fileMeta } = ctx;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await action.options.handler.call(service, {
    session,
    // Raw Moleculer context (for broker.call, meta, etc.)
    ctx: ctx.ctx,
    // Typed service with custom context
    service,
    params,
    // Wrap addJob to auto-inject trace context (user can override)
    // SPEC-021 I-4: traceContext captured once from ctx (stage 7), not rebuilt here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addJob: (name: string, jobName: string, payload: any, opts: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).addJob(name, jobName, { _traceContext: traceContext, ...payload }, opts),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getQueue: (service as any).getQueue,
    files: file
      ? [
          {
            stream: file,
            meta: fileMeta,
          },
        ]
      : [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    call: (...args: [string, Record<string, any>]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.ctx.call(...args).then((res: any) => res.data),
    logger,
    respond,
  });

  return {
    ...ctx,
    result: result as { code?: import('../../../apiResponse').ResponseCode; message?: string; data: unknown; raw?: boolean },
  };
}
