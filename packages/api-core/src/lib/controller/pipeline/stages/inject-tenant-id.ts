// SPDX-License-Identifier: Apache-2.0
/**
 * Stage 4 — auto-inject tenantId from meta into params.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021 §Stage 4).
 *
 * PRESERVED VERBATIM from ApiController.class.ts:776-782.
 */

import type { PipelineContext, PipelineDeps } from '../types';

/**
 * Auto-inject `tenantId` from `ctx.meta` into `params` for REST calls.
 *
 * OpenAPI generator omits tenantId from the public spec (clients never send it),
 * but Typia validators require it. Inject from meta so validation passes.
 *
 * Condition: `ctx.meta.tenantId` is truthy AND `params.tenantId` is falsy.
 * Otherwise: no-op.
 *
 * PRESERVED VERBATIM from ApiController.class.ts:776-782.
 *
 * @param ctx  - Incoming pipeline context (must carry `params` set by stage 1)
 * @param _deps - Pipeline dependencies (unused by this stage)
 * @returns Same `PipelineContext` reference (params mutated in-place per original)
 */
export async function injectTenantId(
  ctx: PipelineContext,
  _deps: PipelineDeps,
): Promise<PipelineContext> {
  const meta = ctx.ctx.meta as Record<string, unknown>;
  if (meta?.tenantId && !(ctx.params as Record<string, unknown>).tenantId) {
    (ctx.params as Record<string, unknown>).tenantId = meta.tenantId;
  }

  return ctx;
}
