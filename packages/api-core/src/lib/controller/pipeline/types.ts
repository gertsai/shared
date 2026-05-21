// SPDX-License-Identifier: Apache-2.0
/**
 * Pipeline types for ApiController action pipeline extraction.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021): Dormant infrastructure, PR-1.
 * No behaviour change to ApiController — runner is not wired yet.
 */

import type Moleculer from 'moleculer';
import type { LoggerInstance } from 'moleculer';
import type { OrchestraSession, UserType } from '@gertsai/core';

import type { ContextMeta } from '../../common';
import type { ResponseCode } from '../../apiResponse';
import type { QueueTraceContext } from '../types';
import type { ApiControllerRegisteredAction } from '../types';

// =============================================================================
// PipelineDeps — external services injected into every stage
// =============================================================================

/**
 * External dependencies injected into every stage call.
 * Stages MUST NOT hold mutable state — all state lives in PipelineContext.
 *
 * Wave 32.C (EVID-083 HIGH-5): the previously-exposed `controller: AnyApiController`
 * field was dropped — no stage referenced it, and keeping a `{} | object`-typed
 * back-reference invited future implicit-any drift and circular-dep footguns.
 * Controller-scoped state (e.g. `strictResponseValidation`) is now passed
 * through explicit, narrowly-typed fields below.
 */
export interface PipelineDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly action: ApiControllerRegisteredAction<any, any, any, any, any, any>;
  readonly service: Moleculer.Service;
  readonly logger: LoggerInstance | undefined;
  /**
   * Session factory captured from ApiController._config at schema-build time.
   * Passed here to avoid a circular import from stage files back into ApiController.
   *
   * Added in PR-3 for Stage 6 (establishAuthSession). Optional so PR-1/PR-2
   * tests and stages that don't need session creation (extractParams,
   * mergeMultipart, coerceQueryString, injectTenantId, validateRequest,
   * buildTraceContext, translateError, cleanup) can omit it without TS error.
   *
   * Stage 6 (establishAuthSession) throws a runtime error if the factory
   * is missing AND `action.options.auth` is `'required' | 'optional'`.
   */
  readonly sessionFactory?: (user_uuid: string, user_type: UserType) => OrchestraSession;
  /**
   * Controller-level strict response validation flag, captured from
   * `ApiController._config.strictResponseValidation` at schema-build time.
   *
   * Added in PR-4 for Stage 10 (validateResponse). Avoids a circular import
   * from the stage file back into ApiController. Optional — when absent,
   * stage 10 falls back to `action.options.strictResponseValidation` only.
   *
   * SPEC-021 §Stage 10: when either this flag OR `action.options.strictResponseValidation`
   * is `true`, an invalid response throws `APIError(BAD_REQUEST__INVALID_RESPONSE)`.
   */
  readonly strictResponseValidation?: boolean;
}

// =============================================================================
// PipelineContext — immutable request/response bag flowing through stages
// =============================================================================

/**
 * Immutable context bag threaded through each pipeline stage.
 * Each stage returns a new (or same) PipelineContext value.
 *
 * Fields are all optional to allow stages to be composed incrementally —
 * each stage narrows the type it needs via runtime checks.
 */
export interface PipelineContext {
  readonly ctx: Moleculer.Context<unknown, ContextMeta>;
  readonly params?: unknown;
  readonly file?: unknown;
  readonly fileMeta?: object;
  readonly session?: OrchestraSession;
  readonly traceContext?: QueueTraceContext;
  readonly result?: {
    code?: ResponseCode;
    message?: string;
    data: unknown;
    raw?: boolean;
  };
}

// =============================================================================
// Stage — a single composable pipeline step
// =============================================================================

/**
 * A single pipeline stage.
 *
 * TIn/TOut default to PipelineContext so the `DEFAULT_STAGES` array type
 * (`readonly Stage[]`) stays assignable without explicit generics.
 *
 * Stages should be pure async functions. Side-effects are permitted only
 * for logging and I/O implied by the stage's concern.
 */
export type Stage<
  TIn extends PipelineContext = PipelineContext,
  TOut extends PipelineContext = PipelineContext,
> = (ctx: TIn, deps: PipelineDeps) => Promise<TOut>;

// =============================================================================
// PipelineShortCircuit — escape hatch for early-success returns
// =============================================================================

/**
 * Throw this from any stage to short-circuit the remaining pipeline stages
 * and immediately return `data` as the action result.
 *
 * Used for raw-response mode (stage 9) and similar fast-path returns.
 * PipelineRunner catches this in its main try/catch, NOT in the error path.
 */
export class PipelineShortCircuit extends Error {
  constructor(public readonly data: unknown) {
    super('pipeline short-circuit');
    this.name = 'PipelineShortCircuit';
    // Maintain proper prototype chain for instanceof checks across CJS/ESM.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// =============================================================================
// StageName — canonical 13-stage names per SPEC-021
// =============================================================================

/**
 * Canonical stage names per SPEC-021 §Stage Contract.
 * Used for observability, override maps, and stage-level logging.
 */
export type StageName =
  | 'extractParams'
  | 'mergeMultipart'
  | 'coerceQueryString'
  | 'injectTenantId'
  | 'validateRequest'
  | 'establishAuthSession'
  | 'buildTraceContext'
  | 'invokeHandler'
  | 'rawResponseShortcut'
  | 'validateResponse'
  | 'wrapResponse'
  | 'translateError'
  | 'cleanup';
