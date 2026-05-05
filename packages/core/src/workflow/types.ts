// SPDX-License-Identifier: Apache-2.0
/**
 * Language-neutral workflow contracts.
 *
 * Эти типы — single source of truth для всех runtime adapters
 * (Moleculer сейчас, FastAPI/Go/Rust позже). НЕ зависят от Moleculer
 * или конкретного workflow engine.
 *
 * Реализация Moleculer-specific живёт в `@gertsai/api-core/moleculer/workflow/`.
 */

/**
 * Workflow definition — declarative blueprint, который runtime
 * может instantiate как run.
 */
export interface WorkflowDefinition<TInput = unknown, TOutput = unknown> {
  /** Unique workflow name (e.g. "ingest.process") */
  readonly name: string;
  /** Schema version для compatibility tracking */
  readonly version: number;
  /**
   * Optional fastestValidator-compatible schema literal for input validation in
   * @moleculer/workflows runtime adapter. Language-neutral (plain record) so
   * non-Moleculer adapters can ignore or translate it. Consumers commonly write
   * the schema as an `as const` object literal; `Readonly<Record<string, unknown>>`
   * is a structural supertype of those literals and stays compatible.
   * Additive and non-breaking — older definitions remain valid.
   */
  readonly params?: Readonly<Record<string, unknown>>;
  /** Handler — pure function от input + signal до output */
  readonly handler: (input: TInput, signal: WorkflowSignal) => Promise<TOutput>;
}

/**
 * Workflow run — instance of a definition, scheduled by runtime.
 */
export interface WorkflowRun<TInput = unknown> {
  readonly runId: string;
  readonly workflowName: string;
  readonly input: TInput;
  readonly startedAt: Date;
  readonly state: WorkflowState;
}

/**
 * Workflow state machine. Runtime updates this как run progresses.
 */
export type WorkflowState =
  | { kind: 'pending' }
  | { kind: 'running'; step: string }
  | { kind: 'completed'; result: unknown }
  | { kind: 'failed'; error: string }
  | { kind: 'cancelled'; reason: string };

/**
 * Optional cross-cutting metadata propagated alongside a `WorkflowSignal`.
 *
 * Adapters lift these fields from their native call context (e.g.
 * Moleculer's `ctx.meta`) so handlers and downstream telemetry can
 * read them without depending on the runtime SDK directly.
 *
 * All fields are optional: when an adapter cannot extract a value
 * safely (missing, wrong type), it omits the field rather than
 * fabricating a default.
 */
export interface WorkflowSignalMeta {
  /** Multi-tenant identifier (e.g. workspace / org id) */
  readonly tenantId?: string;
  /** End-user identifier responsible for the workflow run */
  readonly userId?: string;
  /** Correlation id linking related events / spans across services */
  readonly correlationId?: string;
}

/**
 * Signal — runtime-injected control surface для running workflow.
 * Handler может опираться на signal.abort для cooperative cancellation.
 * Future versions могут добавить heartbeat, status updates, child workflow spawn.
 *
 * `meta` is additive (Sprint 3.0.1, F-9): adapters MAY surface
 * tenant/user/correlation context lifted from the native call frame.
 * Older code that does not set `meta` keeps working unchanged.
 */
export interface WorkflowSignal {
  readonly runId: string;
  readonly abort: AbortSignal;
  readonly meta?: WorkflowSignalMeta;
}

/**
 * Result одного шага workflow (для multi-step orchestration patterns).
 */
export interface WorkflowStepResult<T = unknown> {
  readonly step: string;
  readonly result: T;
  readonly durationMs: number;
}

/**
 * Typed event envelope для channel/event-driven communication между сервисами.
 * Используется как универсальный wrapper для domain events.
 */
export interface EventEnvelope<TPayload = unknown> {
  /** Event type/name (e.g. "document.ingested") */
  readonly type: string;
  /** Schema version */
  readonly version: number;
  /** Correlation ID — связывает related events */
  readonly correlationId?: string;
  /** Tenant ID если multi-tenant */
  readonly tenantId?: string;
  /** Timestamp emit'а */
  readonly emittedAt: Date;
  /** Payload */
  readonly payload: TPayload;
}
