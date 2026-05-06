// SPDX-License-Identifier: Apache-2.0
// Originally inspired by Orchestra orchlab/core/src/meta.ts (Apache 2.0).
// Mirrors Orchestra `FirestoreEntityMutationMarks` / `UpdateAction` shapes
// 1:1 with `ServerTimestamp` replaced by a generic `Timestamp` interface
// per ADR-005. The Firestore / Firelord coupling is intentionally absent so
// this package can run on any storage backend (Postgres, in-memory, etc.).

import type { ClientPlatform } from '@gertsai/session';

// Sprint 3.7 Amendment 1.1.4 (ADR-007): canonical Timestamp moved to
// @gertsai/audit-primitives. Re-export here preserves backward compat;
// new code SHOULD import directly from @gertsai/audit-primitives.
import type { Timestamp } from '@gertsai/audit-primitives';
export type { Timestamp };

/**
 * Audit-trail fields stamped on every entity that goes through the
 * `buildDataFor*` builders. Mirrors Orchestra `FirestoreEntityMutationMarks`.
 *
 * - `created_*` is set once on initial set and never updated.
 * - `updated_*` is refreshed on every mutation (including soft-delete /
 *   restore — a tombstoned record still bumps `updated_at`).
 * - `deleted_*` is `null` until soft-delete and back to `null` on restore.
 *
 * **Naming**: the `creator_uuid` field uses a singular noun (without the
 * `_by_` infix) for parity with Orchestra-side persistence schemas. All
 * other audit identity fields follow the `{verb}_by_{platform|uuid}` shape
 * (`updated_by_uuid`, `deleted_by_platform`, etc.). This historical
 * inconsistency is preserved so DB migrators and Orchestra-derived
 * fixtures remain compatible without column renames.
 *
 * **Platform vs operator**: `*_by_platform` records `session.clientPlatform`
 * (the surface where the request originated, e.g. `'web'`, `'ios'`), NOT
 * `session.operatorType` (the actor category). They usually coincide but a
 * `'system'` operator can still report `'web'` as its surface.
 */
export interface MutationMarks {
  readonly created_at: Timestamp;
  /**
   * Operator who first persisted the entity. Singular `creator_uuid` (not
   * `created_by_uuid`) is intentional — see {@link MutationMarks} JSDoc.
   */
  readonly creator_uuid: string;
  readonly created_by_platform: ClientPlatform;
  readonly updated_at: Timestamp;
  readonly updated_by_uuid: string;
  readonly updated_by_platform: ClientPlatform;
  readonly deleted_at: Timestamp | null;
  readonly deleted_by_uuid: string | null;
  readonly deleted_by_platform: ClientPlatform | null;
}

/**
 * Helper: union → intersection. Used to derive a single intersected record
 * type from the augmented {@link UpdateActionMap}, then index its `.type`
 * property to materialise a literal-string union of allowed action types.
 */
export type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

/**
 * Literal-string union of all `type` discriminants registered on
 * {@link UpdateActionMap}. Empty (`never`) by default; consumers extend the
 * map via module augmentation and the union narrows automatically.
 *
 * @example
 * ```ts
 * declare module '@gertsai/entity-audit' {
 *   interface UpdateActionMap {
 *     invite_sent: { type: 'invite_sent'; params: { email: string } };
 *     transfer:    { type: 'transfer';    params: { amount: number } };
 *   }
 * }
 * // UpdateActionType is now 'invite_sent' | 'transfer'.
 * ```
 */
export type UpdateActionType = UpdateActionMap[keyof UpdateActionMap] extends infer V
  ? V extends { type: infer T }
    ? T
    : never
  : never;

/**
 * Single business-meaningful update action recorded on an entity (e.g. a
 * `transfer_funds` event with associated params + timestamp).
 *
 * The `type` discriminant is narrowed to the union of:
 *  - all literals registered on {@link UpdateActionMap} (via augmentation);
 *  - the three lifecycle-reserved literals: `'create'` / `'delete'` /
 *    `'restore'` emitted by {@link buildDataForSet} / `*Delete` / `*Restore`.
 */
export interface UpdateAction {
  readonly type: UpdateActionType | 'create' | 'delete' | 'restore';
  readonly params?: Readonly<Record<string, unknown>>;
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
 * Lifecycle status of an audited entity.
 *
 * - `'created'` — initial state set by {@link buildDataForSet} (default for
 *   newly persisted entities; mirrors Orchestra behaviour).
 * - `'active'` — domain-promoted state (e.g. after activation flow).
 * - `'archived'` — soft-archived (visible in admin views, hidden from
 *   normal queries).
 * - `'deleted'` — soft-deleted via {@link buildDataForDelete}; reversible
 *   through {@link buildDataForRestore}.
 *
 * The `(string & {})` branch keeps autocomplete suggestions for the four
 * canonical literals while leaving the type **open** for domain-specific
 * statuses (`'pending'`, `'draft'`, `'suspended'`, etc.) without forcing a
 * package-level change. This is the standard "open string union" idiom.
 */
export type EntityBasicStatus =
  | 'active'
  | 'created'
  | 'archived'
  | 'deleted'
  | (string & {});

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
  readonly updated_by_platform: ClientPlatform;
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
