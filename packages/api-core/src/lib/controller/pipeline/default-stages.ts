// SPDX-License-Identifier: Apache-2.0
/**
 * Default stage list for the action pipeline.
 *
 * Wave 27 (PRD-065 / RFC-027):
 *   - PR-1: empty placeholder
 *   - PR-2: stages 1-5  (param extraction → request validation)
 *   - PR-3: stages 6-8  (auth session, trace context, handler invocation)
 *   - PR-4: stages 9-11 (raw shortcut, response validation, wrap response)
 *   - PR-5: STAGE_NAMES exported for setStageOverride alignment
 *
 * Wave 35.A (EVID-087 arch-W1 + type-W1): consolidated `STAGE_NAMES` +
 * `DEFAULT_STAGES` (previously two parallel arrays kept in sync by manual
 * index alignment) into a single `STAGE_REGISTRY` tuple-array. Removes the
 * drift hazard + the `STAGE_NAMES[i]!` non-null assertion at the schema-build
 * call-site. The legacy `STAGE_NAMES` + `DEFAULT_STAGES` exports remain as
 * derived projections for backward compat with the `pipeline/index.ts`
 * re-export surface (and any downstream consumers).
 *
 * Stage 12 (translateError) and stage 13 (cleanup) are handled directly by
 * PipelineRunner and are NOT included here.
 */

import type { ComposableStageName, Stage, StageName } from './types';
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
 * Wave 35.A (EVID-087 arch-W1 + type-W1) — single source of truth for
 * composable stage order. Replaces the previous parallel `STAGE_NAMES` +
 * `DEFAULT_STAGES` arrays that required manual index alignment (drift hazard
 * + `STAGE_NAMES[i]!` non-null assertion).
 *
 * Each tuple entry pairs a `ComposableStageName` with its default `Stage`
 * implementation. `as const satisfies` validates each tuple entry without
 * widening the array element type to a generic `{ name; stage }`.
 *
 * Consumers should prefer iterating `STAGE_REGISTRY` directly via
 * destructuring (no `!` non-null assertion needed) over zipping the two
 * derived `STAGE_NAMES` + `DEFAULT_STAGES` arrays by index.
 */
export const STAGE_REGISTRY = [
  { name: 'extractParams', stage: extractParams },
  { name: 'mergeMultipart', stage: mergeMultipart },
  { name: 'coerceQueryString', stage: coerceQueryString },
  { name: 'injectTenantId', stage: injectTenantId },
  { name: 'validateRequest', stage: validateRequest },
  { name: 'establishAuthSession', stage: establishAuthSession },
  { name: 'buildTraceContext', stage: buildTraceContext },
  { name: 'invokeHandler', stage: invokeHandler },
  { name: 'rawResponseShortcut', stage: rawResponseShortcut },
  { name: 'validateResponse', stage: validateResponse },
  { name: 'wrapResponse', stage: wrapResponse },
] as const satisfies readonly { name: ComposableStageName; stage: Stage }[];

/**
 * Ordered canonical names for the 11 composable pipeline stages.
 *
 * Wave 35.A (EVID-087 arch-W1): derived projection of `STAGE_REGISTRY` —
 * preserved as a public export for backward compat with the
 * `pipeline/index.ts` re-export surface and downstream consumers.
 *
 * Wave 27 PR-5 (PRD-065 FR-3 / RFC-027 §PR-5).
 */
export const STAGE_NAMES: readonly StageName[] = STAGE_REGISTRY.map((s) => s.name);

/**
 * The ordered list of 11 pipeline stages that `PipelineRunner` will execute.
 *
 * Wave 35.A (EVID-087 arch-W1): derived projection of `STAGE_REGISTRY` —
 * preserved as a public export for backward compat. Stages 12 (translateError)
 * and 13 (cleanup) are hard-wired into the runner's catch/finally blocks
 * respectively and are NOT composable into this array.
 */
export const DEFAULT_STAGES: readonly Stage[] = STAGE_REGISTRY.map((s) => s.stage);
