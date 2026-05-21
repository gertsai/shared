// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/api-core/pipeline — public surface for the action pipeline.
 *
 * Wave 27 (PRD-065 / RFC-027):
 *   - PR-1: dormant scaffolding (types, runner, translate-error, cleanup)
 *   - PR-2: stages 1-5 + runStagesSerially bridge
 *   - PR-3: stages 6-8
 *   - PR-4: stages 9-11 + full PipelineRunner wired; runStagesSerially removed
 */

export type { PipelineContext, PipelineDeps, Stage, StageName } from './types';
export { PipelineShortCircuit } from './types';
export { PipelineRunner } from './runner';
export { DEFAULT_STAGES } from './default-stages';
export { translateError } from './stages/translate-error';
export { cleanup } from './stages/cleanup';
// PR-2: stages 1-5
export { extractParams } from './stages/extract-params';
export { mergeMultipart } from './stages/merge-multipart';
export { coerceQueryString } from './stages/coerce-query-string';
export { injectTenantId } from './stages/inject-tenant-id';
export { validateRequest } from './stages/validate-request';
// PR-3: stages 6-8
export { establishAuthSession } from './stages/establish-auth-session';
export { buildTraceContext } from './stages/build-trace-context';
export { invokeHandler } from './stages/invoke-handler';
// PR-4: stages 9-11
export { rawResponseShortcut } from './stages/raw-response-shortcut';
export { validateResponse } from './stages/validate-response';
export { wrapResponse } from './stages/wrap-response';
