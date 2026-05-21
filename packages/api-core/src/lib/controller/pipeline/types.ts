// SPDX-License-Identifier: Apache-2.0
/**
 * Pipeline types for ApiController action pipeline extraction.
 *
 * Wave 27 (PRD-065 / RFC-027 / SPEC-021): Dormant infrastructure, PR-1.
 * No behaviour change to ApiController — runner is not wired yet.
 */

import type Moleculer from 'moleculer';
import type { LoggerInstance } from 'moleculer';
import type { OrchestraSession } from '@gertsai/core';

import type { ContextMeta } from '../../common';
import type { ResponseCode } from '../../apiResponse';
import type { QueueTraceContext } from '../types';
import type { ApiControllerRegisteredAction } from '../types';

// ApiController is referenced by type only — avoid circular dependency by
// importing the class type lazily. We narrow to `object` in PipelineDeps and
// let consumers cast. PR-5 wiring will tighten this.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyApiController = object;

// =============================================================================
// PipelineDeps — external services injected into every stage
// =============================================================================

/**
 * External dependencies injected into every stage call.
 * Stages MUST NOT hold mutable state — all state lives in PipelineContext.
 */
export interface PipelineDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly action: ApiControllerRegisteredAction<any, any, any, any, any, any>;
  readonly controller: AnyApiController;
  readonly service: Moleculer.Service;
  readonly logger: LoggerInstance | undefined;
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
