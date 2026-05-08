// SPDX-License-Identifier: Apache-2.0
/**
 * NOTE (Sprint 3.1): `WorkflowRegistration` moved to `./setWorkflows` so the
 * setter's signature lives next to its type. This file is intentionally kept
 * as a stable module path; future Moleculer-workflow-specific types may land
 * here without revisiting the barrel.
 */

// Placeholder re-export anchor so consumers' `import type {} from './types'`
// resolves; concrete Moleculer-workflow types may be added here later.
export type WorkflowTypesModuleAnchor = never;
