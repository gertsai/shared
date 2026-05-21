// SPDX-License-Identifier: Apache-2.0
/**
 * Default stage list for the action pipeline.
 *
 * Wave 27 (PRD-065 / RFC-027): PR-1 placeholder — empty array.
 * PR-2/3/4 will fill stages 1-11 in order (extractParams → wrapResponse).
 * Stage 12 (translateError) and stage 13 (cleanup) are handled directly by
 * PipelineRunner and are NOT included here.
 */

import type { Stage } from './types';

/**
 * The ordered list of pipeline stages that `PipelineRunner` will execute.
 *
 * Currently empty (PR-1 dormant scaffolding).
 * Stages will be added in subsequent PRs:
 *   - PR-2: stages 1-5  (param extraction → request validation)
 *   - PR-3: stages 6-8  (auth session, trace context, handler invocation)
 *   - PR-4: stages 9-11 (raw shortcut, response validation, wrap response)
 */
export const DEFAULT_STAGES: readonly Stage[] = [];
