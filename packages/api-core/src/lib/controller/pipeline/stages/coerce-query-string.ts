// SPDX-License-Identifier: Apache-2.0
/**
 * Stage 3 — coerce query-string params for GET / DELETE endpoints.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021 §Stage 3).
 *
 * PRESERVED VERBATIM from ApiController.class.ts:752-774.
 */

import { coerceQueryParams, smartCoerce, isTypiaParamsWithSchema } from '../../../common';
import type { PipelineContext, PipelineDeps } from '../types';

/**
 * Coerce query-string parameters for endpoints that receive params via URL
 * query string (GET and DELETE — both use query strings, not request body).
 *
 * Detection logic:
 *   - String REST config:  starts with `'GET '` or `'DELETE '`
 *   - Object REST config:  `method === 'GET'` or `method === 'DELETE'`
 *
 * Coercion strategy:
 *   - New format (`isTypiaParamsWithSchema`): schema-based `smartCoerce`
 *   - Legacy format: hard-coded `coerceQueryParams` for backward compat
 *
 * No-op for non-query-string endpoints.
 *
 * PRESERVED VERBATIM from ApiController.class.ts:752-774.
 *
 * @param ctx  - Incoming pipeline context (must carry `params` set by stage 1)
 * @param deps - Pipeline dependencies (action accessed for rest config + params schema)
 * @returns Same `PipelineContext` reference (params mutated in-place per original)
 */
export async function coerceQueryString(
  ctx: PipelineContext,
  deps: PipelineDeps,
): Promise<PipelineContext> {
  // Coerce query params for endpoints that receive params via URL query string
  // (GET and DELETE — both use query strings, not request body)
  const restConfig = deps.action.options.rest;
  const isQueryStringEndpoint =
    typeof restConfig === 'string'
      ? restConfig.startsWith('GET ') || restConfig.startsWith('DELETE ')
      : restConfig?.method === 'GET' || restConfig?.method === 'DELETE';

  if (isQueryStringEndpoint) {
    const actionParams = deps.action.options.params;

    if (isTypiaParamsWithSchema(actionParams)) {
      // New format: use schema-based smart coercion
      smartCoerce(ctx.params as Record<string, unknown>, {
        numericFields: actionParams.numericFields,
        booleanFields: actionParams.booleanFields,
        arrayFields: actionParams.arrayFields,
      });
    } else {
      // Legacy format: use hard-coded list for backward compatibility
      coerceQueryParams(ctx.params as Record<string, unknown>);
    }
  }

  return ctx;
}
