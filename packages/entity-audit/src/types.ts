// SPDX-License-Identifier: Apache-2.0
// Originally inspired by Orchestra orchlab/core/src/meta.ts (Apache 2.0).
// Mirrors Orchestra `FirestoreEntityMutationMarks` / `UpdateAction` shapes
// 1:1 with `ServerTimestamp` replaced by a generic `Timestamp` interface
// per ADR-005. The Firestore / Firelord coupling is intentionally absent so
// this package can run on any storage backend (Postgres, in-memory, etc.).

import type { OperatorType } from '@gertsai/session';

/**
 * Backend-agnostic timestamp. Mirrors the `{ seconds, nanoseconds }` shape
 * used by Firestore / protobuf / gRPC so on-the-wire round-trips remain
 * lossless, but carries no runtime dependency on any of those.
 */
export interface Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
}

/**
 * Audit-trail fields stamped on every entity that goes through the
 * `buildDataFor*` builders. Mirrors Orchestra `FirestoreEntityMutationMarks`.
 *
 * - `created_*` is set once on initial set and never updated.
 * - `updated_*` is refreshed on every mutation (including soft-delete /
 *   restore — a tombstoned record still bumps `updated_at`).
 * - `deleted_*` is `null` until soft-delete and back to `null` on restore.
 */
export interface MutationMarks {
  readonly created_at: Timestamp;
  readonly created_by_uuid: string;
  readonly created_by_platform: OperatorType;
  readonly updated_at: Timestamp;
  readonly updated_by_uuid: string;
  readonly updated_by_platform: OperatorType;
  readonly deleted_at: Timestamp | null;
  readonly deleted_by_uuid: string | null;
  readonly deleted_by_platform: OperatorType | null;
}

/**
 * Single business-meaningful update action recorded on an entity (e.g. a
 * `transfer_funds` event with associated params + timestamp). The shape is
 * intentionally open: consumers tighten the `type` / `params` discriminators
 * via {@link UpdateActionMap} module augmentation.
 */
export interface UpdateAction {
  readonly type: string;
  readonly params?: unknown;
  readonly timestamp: Timestamp;
}

/**
 * Extensible catalogue of update-action variants. Empty by default; consumers
 * extend it through TypeScript module augmentation:
 *
 * @example
 * declare module '@gertsai/entity-audit' {
 *   interface UpdateActionMap {
 *     invite_sent: { type: 'invite_sent'; params: { email: string } };
 *   }
 * }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface UpdateActionMap {}

/** Catch-all for callers that want to accept any update action. */
export type UpdateActionGeneric = UpdateAction;

/**
 * Lifecycle status of an audited entity. Soft-delete uses `deleted` so the
 * row physically remains for `buildDataForRestore` to reverse.
 */
export type EntityBasicStatus = 'active' | 'archived' | 'deleted';

/** Read-side shape: business data + audit marks. */
export type EntityData<Data extends object> = Data & MutationMarks;

/** Write shape for initial creation: identical to {@link EntityData}. */
export type EntityDataCreate<Data extends object> = Data & MutationMarks;

/**
 * Write shape for partial update: any subset of the business data plus the
 * required `updated_*` audit triplet. `created_*` and `deleted_*` are out of
 * scope — those flow through `buildDataForSet` / `*Delete` / `*Restore`.
 */
export type EntityDataUpdate<Data extends object> = Partial<Data> & {
  readonly updated_at: Timestamp;
  readonly updated_by_uuid: string;
  readonly updated_by_platform: OperatorType;
};

/**
 * Wraps a business `Data` shape with audit marks and a lifecycle status.
 * Consumers use this as the canonical "fully audited entity" type.
 */
export interface EntityMetaType<
  Data extends object,
  Status extends EntityBasicStatus = EntityBasicStatus,
> {
  readonly data: Data & MutationMarks;
  readonly status: Status;
}
