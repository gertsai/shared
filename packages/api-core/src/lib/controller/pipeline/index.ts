// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/api-core/pipeline — public surface for the action pipeline.
 *
 * Wave 27 (PRD-065 / RFC-027): PR-1 dormant scaffolding.
 * Exported types and classes are stable API; implementations will be wired
 * to ApiController in PR-2 onwards.
 */

export type { PipelineContext, PipelineDeps, Stage, StageName } from './types';
export { PipelineShortCircuit } from './types';
export { PipelineRunner } from './runner';
export { DEFAULT_STAGES } from './default-stages';
export { translateError } from './stages/translate-error';
export { cleanup } from './stages/cleanup';
