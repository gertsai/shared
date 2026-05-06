// SPDX-License-Identifier: Apache-2.0
/**
 * @gertsai/entity-storage — session-aware audit-stamped CRUD wrapper
 * around `@gertsai/storage-core`'s `IStorageProvider`, plus a fully-featured
 * `InMemoryStorageProvider` test fixture.
 *
 * Public surface: `BaseEntityStorageService` (abstract base for
 * domain-specific storage services), `InMemoryStorageProvider` (test
 * fixture), `STORAGE_EVENTS` (event-name const-object), plus the
 * temporary stub re-exports of `IStorageProvider` & friends (which Phase B
 * will replace with `@gertsai/storage-core` imports).
 *
 * Per PRD-002 FR-W4-001..003 + ADR-005 Decision A/B + SPEC-008 W-4B-2.
 */
export { BaseEntityStorageService } from './BaseEntityStorageService';
export type {
  BaseEntityStorageServiceOpts,
  SetEntityInput,
  StorageEventPayload,
} from './BaseEntityStorageService';

export { InMemoryStorageProvider } from './InMemoryStorageProvider';

export { STORAGE_EVENTS } from './STORAGE_EVENTS';
export type { StorageEventName } from './STORAGE_EVENTS';

// Storage-core re-exports — STUBBED locally until Phase B swap. After the
// real `@gertsai/storage-core` package lands, this barrel will simply
// re-export those types from the upstream package.
export type {
  IBatchRunner,
  IStorageProvider,
  ITransactionRunner,
  Query,
  StorageCapabilities,
  StorageMetadata,
} from '@gertsai/storage-core';
export {
  ListenersNotSupportedError,
  TransactionConflictError,
} from '@gertsai/storage-core';
