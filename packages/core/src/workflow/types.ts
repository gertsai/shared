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
 * Signal — runtime-injected control surface для running workflow.
 * Handler может опираться на signal.abort для cooperative cancellation.
 * Future versions могут добавить heartbeat, status updates, child workflow spawn.
 */
export interface WorkflowSignal {
  readonly runId: string;
  readonly abort: AbortSignal;
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
