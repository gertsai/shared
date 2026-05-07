// SPDX-License-Identifier: Apache-2.0
import type { WorkflowDefinition } from '@gertsai/core';
import { adaptWorkflowDefinition, type MoleculerWorkflowSchema } from './adapter';

/**
 * Cross-realm-stable Symbol used to address the internal workflow-registration
 * hook on `ApiController` (Sprint 3.0.1, F-1).
 *
 * Why `Symbol.for` (the global Symbol registry):
 *  - When `@gertsai/api-core` ships in both ESM and CJS forms, or when an
 *    application bundles api-core twice (e.g. through transitive deps), each
 *    realm would otherwise create its own `Symbol(...)` and the controller's
 *    method would not be reachable from the other realm.
 *  - `Symbol.for` shares the same Symbol via the cross-realm registry, so
 *    `controller[REGISTER_WORKFLOW]` resolves to the same property regardless
 *    of which realm published api-core.
 *
 * @internal Direct external use is unsupported — call `setWorkflows()` instead.
 */
export const REGISTER_WORKFLOW = Symbol.for('@gertsai/api-core:registerWorkflow');

/**
 * Map of workflow name → WorkflowDefinition.
 *
 * Reason: F-T-3 — preserve narrow generics through `setWorkflows()` API.
 * `WorkflowDefinition<TInput, TOutput>` is contravariant on `TInput`, so a
 * concrete `WorkflowDefinition<IngestInput, IngestResult>` is NOT a subtype
 * of `WorkflowDefinition<unknown, unknown>` under `strictFunctionTypes: true`.
 * `any` here opens the bound for arbitrary handler shapes; the generic
 * `<M extends WorkflowRegistration>` on `setWorkflows` then captures and
 * preserves the narrow per-key types at the call site (audit recommendation).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance: see comment above
export type WorkflowRegistration = Readonly<Record<string, WorkflowDefinition<any, any>>>;

/**
 * @internal Hook contract used by `setWorkflows` to register on `ApiController`.
 *
 * The hook is keyed by the `REGISTER_WORKFLOW` Symbol so the property does
 * not surface as a callable string-keyed member on emitted `.d.ts` (which is
 * what `dts: true` would otherwise expose for any `public` method, regardless
 * of `@internal` JSDoc). Consumers should never reach for the Symbol directly
 * — go through the `setWorkflows()` helper.
 */
export interface ApiControllerInternalHook {
  [REGISTER_WORKFLOW](name: string, schema: MoleculerWorkflowSchema): void;
}

/**
 * Register one or more workflows on `ApiController`.
 *
 * Registrations are attached to the synthesized service schema(s) at
 * `controller.start()`. Each `WorkflowDefinition` is adapted to the
 * Moleculer-flavoured schema via `adaptWorkflowDefinition` and handed to the
 * controller's internal Symbol-keyed hook.
 *
 * Generic over the registration map (Sprint 3.0.1, F-3) so callers may keep
 * the precise per-workflow `WorkflowDefinition<I, O>` types that they pass in
 * — this is purely an inference improvement; runtime behaviour is unchanged.
 *
 * @param controller ApiController instance exposing the internal hook.
 * @param workflows  Map of workflow name → definition.
 * @throws {Error} If `workflows` is null/undefined or not an object.
 */
export function setWorkflows<M extends WorkflowRegistration>(
  controller: ApiControllerInternalHook,
  workflows: M,
): void {
  if (!workflows || typeof workflows !== 'object') {
    throw new Error('setWorkflows: workflows must be a non-null object');
  }
  for (const [name, def] of Object.entries(workflows)) {
    controller[REGISTER_WORKFLOW](name, adaptWorkflowDefinition(name, def));
  }
}
