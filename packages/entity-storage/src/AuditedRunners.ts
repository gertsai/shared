// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Audit-stamped runner shapes layered on top of `@gertsai/storage-core`'s
 * raw {@link IBatchRunner} / {@link ITransactionRunner}. The wrappers
 * dispatched by {@link BaseEntityStorageService.runTransaction} /
 * {@link BaseEntityStorageService.runBatch} apply the same
 * `buildDataForSet` / `buildDataForUpdate` / `buildDataForDelete` /
 * `buildDataForRestore` audit-marks that single-document `set` / `update` /
 * `delete` / `restore` already apply — so transactional and batched writes
 * cannot bypass the audit log.
 *
 * Per audit fix F-2 (Sprint 3.5.1): single-document mutation paths produce
 * audit-stamped writes via `entity-audit` builders, but `provider.runBatch`
 * / `provider.runTransaction` were exposed as raw — callers had to know
 * about the audit marks themselves. The audited wrappers close that gap.
 */
import type { StorageMetadata } from '@gertsai/storage-core';

import type { SetEntityInput } from './BaseEntityStorageService';

/**
 * Audit-stamped transaction runner. The shape mirrors
 * `ITransactionRunner` but every write call applies the same audit marks
 * that {@link BaseEntityStorageService.set} / `update` / `delete` /
 * `restore` apply on the single-document path.
 *
 * `delete` is **soft** — the wrapper queues a partial-update with the
 * `deleted_*` triplet and `status: 'deleted'`, NOT a hard
 * `rawTx.delete(...)`. To hard-delete inside a transaction, drop down to
 * the raw provider directly (intentionally not exposed through this
 * wrapper).
 *
 * @template Meta - The {@link StorageMetadata} the bound service runs on.
 * @template UpdateActionTypes - Union of allowed `action.type` values
 *   forwarded to `buildDataForUpdate`. Default `string` (matches
 *   `BaseEntityStorageService`'s default).
 *
 * @public
 */
export interface AuditedTxRunner<
  Meta extends StorageMetadata,
  UpdateActionTypes extends string = string,
> {
  /** Read a document inside the transaction's consistent snapshot. */
  get(uid: string): Promise<Meta['read'] | null>;
  /**
   * Queue a `set` to commit on transaction resolution. Stamps `created_*`
   * + `updated_*` audit marks via `buildDataForSet`. Returns the assigned
   * `id` (the caller-supplied `_uid` if present, otherwise the
   * UUID-provider's value).
   */
  set(input: SetEntityInput<Meta>): { id: string };
  /**
   * Queue a partial-update to commit on transaction resolution. Stamps
   * `updated_*` and (when `opts.action` is set) records an `update_action`
   * audit-log entry via `buildDataForUpdate`.
   */
  update(
    uid: string,
    partial: Partial<Meta['write']>,
    opts?: {
      readonly action?: UpdateActionTypes;
      readonly params?: Readonly<Record<string, unknown>>;
    },
  ): void;
  /**
   * Queue a soft-delete to commit on transaction resolution. Stamps the
   * `deleted_*` triplet and flips `status` to `'deleted'` via
   * `buildDataForDelete`. The underlying row is NOT physically removed.
   */
  delete(
    uid: string,
    opts?: {
      readonly action?: UpdateActionTypes;
      readonly params?: Readonly<Record<string, unknown>>;
    },
  ): void;
  /**
   * Queue a restore to commit on transaction resolution. Clears the
   * `deleted_*` triplet, bumps `updated_*`, flips `status` back to
   * `'created'` via `buildDataForRestore`.
   */
  restore(uid: string): void;
}

/**
 * Audit-stamped batch runner. Same audit-stamping behaviour as
 * {@link AuditedTxRunner} but without `get` (batches don't read).
 *
 * @template Meta - The {@link StorageMetadata} the bound service runs on.
 * @template UpdateActionTypes - Union of allowed `action.type` values
 *   forwarded to `buildDataForUpdate`.
 *
 * @public
 */
export interface AuditedBatchRunner<
  Meta extends StorageMetadata,
  UpdateActionTypes extends string = string,
> {
  /**
   * Queue a `set` into the batch. Stamps `created_*` + `updated_*` audit
   * marks via `buildDataForSet`. Returns the assigned `id`.
   */
  set(input: SetEntityInput<Meta>): { id: string };
  /**
   * Queue a partial-update into the batch. Stamps `updated_*` and
   * (when `opts.action` is set) records an `update_action` audit-log entry
   * via `buildDataForUpdate`.
   */
  update(
    uid: string,
    partial: Partial<Meta['write']>,
    opts?: {
      readonly action?: UpdateActionTypes;
      readonly params?: Readonly<Record<string, unknown>>;
    },
  ): void;
  /**
   * Queue a soft-delete into the batch. Stamps `deleted_*` triplet and
   * flips `status` to `'deleted'` via `buildDataForDelete`.
   */
  delete(
    uid: string,
    opts?: {
      readonly action?: UpdateActionTypes;
      readonly params?: Readonly<Record<string, unknown>>;
    },
  ): void;
  /**
   * Queue a restore into the batch via `buildDataForRestore`.
   */
  restore(uid: string): void;
}
