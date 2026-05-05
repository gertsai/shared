// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/entity — backend-agnostic entity base classes.
 *
 * Public surface: `Model`, `Entity`, `EntityWithMetadata`, the default
 * `plainReactiveAdapter`, vendored `deepEqual`, plus type contracts.
 * Vue adapter is exported under the `/vue` subpath.
 *
 * Per PRD-002 FR-W4-001..003 + ADR-005 Decision B.
 */
export { Model } from './Model';
export { Entity } from './Entity';
export { EntityWithMetadata } from './EntityWithMetadata';
export { plainReactiveAdapter } from './adapters/plain';
export { deepEqual } from './internal/deep-equal';
export type {
  Session,
  WithTypename,
  ReactiveAdapter,
  UuidProvider,
  ModelOpts,
  EntityOpts,
  EntityWithMetadataOpts,
} from './types';
