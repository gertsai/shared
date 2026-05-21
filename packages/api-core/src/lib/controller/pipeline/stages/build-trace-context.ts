// SPDX-License-Identifier: Apache-2.0
/**
 * Stage 7 — build W3C trace context for downstream job injection.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021 §Stage 7).
 *
 * PRESERVED VERBATIM from ApiController.class.ts:780-785.
 */

import { buildTraceparent } from '@gertsai/otel/moleculer';
import type { PipelineContext, PipelineDeps } from '../types';

/**
 * Stage 7 — build W3C trace context for downstream job injection.
 *
 * PRESERVED VERBATIM from ApiController.class.ts:780-785.
 *
 * Spreads optional `ctx.requestID`, `ctx.id`, `ctx.parentID`, `ctx.tracing`
 * into `buildTraceparent` (which returns `undefined` if none are present or
 * the resulting traceId/spanId are zero — non-zero enforcement is delegated
 * to `@gertsai/otel`).
 *
 * PRD-052 FR-004: W3C traceparent format `00-traceId-spanId-01`.
 *
 * SPEC-021 I-4: `traceContext` is built once per request (here) and reused by
 * `addJob` (stage 8); MUST NOT be rebuilt per `addJob` call.
 *
 * @param ctx   - Incoming pipeline context (Moleculer ctx carries tracing fields)
 * @param _deps - Pipeline dependencies (unused by this stage)
 * @returns Updated `PipelineContext` with `traceContext` populated (may be `undefined`)
 */
export async function buildTraceContext(
  ctx: PipelineContext,
  _deps: PipelineDeps,
): Promise<PipelineContext> {
  const molCtx = ctx.ctx;

  // Wave 33.C (EVID-083 W7): dropped `as QueueTraceContext | undefined` cast.
  // `BuiltTraceparent` is structurally assignable to `QueueTraceContext`:
  // both carry the same field names with compatible variance — every property
  // on `BuiltTraceparent` is at-most-as-restrictive as its `QueueTraceContext`
  // counterpart (`traceparent` is required-string in the former, optional
  // string in the latter). TS narrows the assignment in
  // `PipelineContext.traceContext` (which is `QueueTraceContext | undefined`)
  // via structural subtyping — no cast needed.
  const traceContext = buildTraceparent({
    ...(molCtx.requestID !== undefined && { requestID: molCtx.requestID }),
    ...(molCtx.id !== undefined && { id: molCtx.id }),
    ...(molCtx.parentID !== undefined && { parentID: molCtx.parentID }),
    ...(molCtx.tracing !== undefined && { tracing: molCtx.tracing }),
  });

  // exactOptionalPropertyTypes: only include traceContext key when defined.
  if (traceContext !== undefined) {
    return { ...ctx, traceContext };
  }
  return ctx;
}
