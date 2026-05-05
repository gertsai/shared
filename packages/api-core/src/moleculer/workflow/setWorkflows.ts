// SPDX-License-Identifier: Apache-2.0
import type { WorkflowRegistration } from './types';

/**
 * Register workflows на ApiController.
 *
 * IMPLEMENTATION STATUS: experimental stub (ADR-003 §R-4).
 * Full implementation wires workflows через @moleculer/workflows mixin
 * когда implementation матуреет.
 *
 * Currently: validates definitions structure + console.warn experimental status.
 */
export function setWorkflows(controller: unknown, workflows: WorkflowRegistration): void {
  if (!workflows || typeof workflows !== 'object') {
    throw new Error('setWorkflows: workflows must be a non-null object');
  }
  // eslint-disable-next-line no-console
  console.warn('[setWorkflows] Workflows API is experimental in Wave 2. See ADR-003 §R-4.');
  // Real implementation в Phase A2 / Wave 3.
}
