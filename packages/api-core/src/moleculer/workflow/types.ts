// SPDX-License-Identifier: Apache-2.0
import type { WorkflowDefinition } from '@gertsai/core';

/**
 * Map of workflow name → WorkflowDefinition.
 * Used by ApiController.setWorkflows() to register workflows на broker.
 */
export type WorkflowRegistration = Record<string, WorkflowDefinition>;
