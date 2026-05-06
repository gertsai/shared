// SPDX-License-Identifier: Apache-2.0
//
// Sprint 3.8 (ADR-008 Decision B + I-3 + W-3-8-26): canonical home of
// `vueReactiveAdapter` moved to standalone `@gertsai/entity-vue` package.
// This file is a backward-compat re-export shim.
//
// Existing imports continue to work without changes:
//
//   import { vueReactiveAdapter } from '@gertsai/entity/vue'; // still works (this shim)
//   import { vueReactiveAdapter } from '@gertsai/entity-vue'; // new canonical path
//
// The `/vue` subpath shim will be removed in v1.0. Migrate at your convenience.

export { vueReactiveAdapter } from '@gertsai/entity-vue';
