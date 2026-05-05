// SPDX-License-Identifier: Apache-2.0
import type { WorkflowDefinition } from '@gertsai/core';
import { adaptWorkflowDefinition, type MoleculerWorkflowSchema } from './adapter';

/**
 * Map of workflow name → WorkflowDefinition.
 * Used by `setWorkflows` to register workflows on an `ApiController`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- workflow inputs/outputs are heterogeneous by nature
export type WorkflowRegistration = Record<string, WorkflowDefinition<any, any>>;

/** @internal Hook contract used by setWorkflows to register on ApiController. */
export interface ApiControllerInternalHook {
  _registerWorkflow(name: string, schema: MoleculerWorkflowSchema): void;
}

/**
 * Register one or more workflows on `ApiController`.
 *
 * Registrations are attached to the synthesized service schema(s) at
 * `controller.start()`. Each `WorkflowDefinition` is adapted to the
 * Moleculer-flavoured schema via `adaptWorkflowDefinition` and handed to the
 * controller's internal `_registerWorkflow` hook.
 *
 * @param controller ApiController instance exposing the internal hook.
 * @param workflows  Map of workflow name → definition.
 * @throws {Error} If `workflows` is null/undefined or not an object.
 */
export function setWorkflows(
  controller: ApiControllerInternalHook,
  workflows: WorkflowRegistration,
): void {
  if (!workflows || typeof workflows !== 'object') {
    throw new Error('setWorkflows: workflows must be a non-null object');
  }
  for (const [name, def] of Object.entries(workflows)) {
    controller._registerWorkflow(name, adaptWorkflowDefinition(name, def));
  }
}
