// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview Public barrel for `@gertsai/storage-core`.
 *
 * Backend-agnostic storage abstraction per ADR-005 Decision A — see
 * individual modules for full contract docs.
 */

export type {
  StorageMetadata,
  StorageCapabilities,
  Query,
  IStorageProvider,
  IBatchRunner,
  ITransactionRunner,
  StorageLogger,
} from './types';
export { defineStorageMetadata, noopStorageLogger } from './types';

export { ListenersNotSupportedError, TransactionConflictError } from './errors';

export { storageProviderIdentifier } from './identifier';
