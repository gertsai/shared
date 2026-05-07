// SPDX-License-Identifier: Apache-2.0
export * from './types';
export { setWorkflows } from './setWorkflows';
/**
 * `REGISTER_WORKFLOW` is exported so the same Symbol is reachable across
 * realms, but it is internal: consumers MUST use `setWorkflows(controller, defs)`
 * rather than calling the hook directly. Direct access is unsupported and
 * may be removed in a future version without notice.
 * @internal
 */
export { REGISTER_WORKFLOW } from './setWorkflows';
export type { ApiControllerInternalHook, WorkflowRegistration } from './setWorkflows';
export { adaptWorkflowDefinition } from './adapter';
export type { MoleculerWorkflowSchema } from './adapter';
