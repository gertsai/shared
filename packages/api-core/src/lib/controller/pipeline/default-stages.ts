// SPDX-License-Identifier: Apache-2.0
/**
 * Default stage list for the action pipeline.
 *
 * Wave 27 (PRD-065 / RFC-027):
 *   - PR-1: empty placeholder
 *   - PR-2: stages 1-5  (param extraction → request validation)
 *   - PR-3: stages 6-8  (auth session, trace context, handler invocation)
 *   - PR-4: stages 9-11 (raw shortcut, response validation, wrap response) — this PR
 *
 * Stage 12 (translateError) and stage 13 (cleanup) are handled directly by
 * PipelineRunner and are NOT included here.
 */

import type { Stage } from './types';
import { extractParams } from './stages/extract-params';
import { mergeMultipart } from './stages/merge-multipart';
import { coerceQueryString } from './stages/coerce-query-string';
import { injectTenantId } from './stages/inject-tenant-id';
import { validateRequest } from './stages/validate-request';
import { establishAuthSession } from './stages/establish-auth-session';
import { buildTraceContext } from './stages/build-trace-context';
import { invokeHandler } from './stages/invoke-handler';
import { rawResponseShortcut } from './stages/raw-response-shortcut';
import { validateResponse } from './stages/validate-response';
import { wrapResponse } from './stages/wrap-response';

/**
 * The ordered list of 11 pipeline stages that `PipelineRunner` will execute.
 *
 * Stages 12 (translateError) and 13 (cleanup) are hard-wired into the runner's
 * catch/finally blocks respectively and are NOT composable into this array.
 */
export const DEFAULT_STAGES: readonly Stage[] = [
  extractParams,
  mergeMultipart,
  coerceQueryString,
  injectTenantId,
  validateRequest,
  establishAuthSession,
  buildTraceContext,
  invokeHandler,
  rawResponseShortcut,
  validateResponse,
  wrapResponse,
] as const;
