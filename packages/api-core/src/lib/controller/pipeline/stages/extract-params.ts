// SPDX-License-Identifier: Apache-2.0
/**
 * Stage 1 — extract params, file, and fileMeta from the Moleculer context.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021 §Stage 1).
 *
 * PRESERVED VERBATIM from ApiController.class.ts:730-746.
 */

import type { PipelineContext, PipelineDeps } from '../types';

/**
 * Extract request parameters, file, and file metadata from the Moleculer context.
 *
 * Multipart upload path (`ctx.meta.$params` is truthy):
 *   - `params`   ← `ctx.meta.$params`  (the serialised form fields)
 *   - `file`     ← `ctx.params`        (the raw upload stream)
 *   - `fileMeta` ← `{ fieldname, filename, mimetype, encoding }` from `ctx.meta`
 *
 * Normal path (`ctx.meta.$params` is falsy):
 *   - `params`   ← `ctx.params`
 *   - `file`     ← `null`
 *   - `fileMeta` ← `{}`
 *
 * PRESERVED VERBATIM from ApiController.class.ts:730-746.
 *
 * @param ctx  - Incoming pipeline context (must carry a populated `ctx.ctx`)
 * @param _deps - Pipeline dependencies (unused by this stage)
 * @returns Updated `PipelineContext` with `params`, `file`, and `fileMeta` set
 */
export async function extractParams(
  ctx: PipelineContext,
  _deps: PipelineDeps,
): Promise<PipelineContext> {
  const molCtx = ctx.ctx;

  const params = molCtx.meta.$params ? molCtx.meta.$params : molCtx.params;

  const file = molCtx.meta.$params ? molCtx.params : null;
  const fileMeta = molCtx.meta.$params
    ? {
        // @ts-ignore
        fieldname: molCtx.meta.fieldname,
        // @ts-ignore
        filename: molCtx.meta.filename,
        // @ts-ignore
        mimetype: molCtx.meta.mimetype,
        // @ts-ignore
        encoding: molCtx.meta.encoding,
      }
    : {};

  return { ...ctx, params, file, fileMeta };
}
