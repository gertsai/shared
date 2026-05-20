// SPDX-License-Identifier: Apache-2.0
export {
  defaultTimestampProvider,
  timestampToMillis,
  timestampFromDate,
} from './timestamp';
export type { TimestampProvider } from './timestamp';
export {
  buildDataForSet,
  buildDataForUpdate,
  buildDataForDelete,
  buildDataForRestore,
} from './builders';
export type { BuilderOpts, SetBuilderOpts, UpdateOpts } from './builders';
export type {
  Timestamp,
  MutationMarks,
  UpdateAction,
  UpdateActionMap,
  UpdateActionType,
  UpdateActionGeneric,
  UnionToIntersection,
  EntityBasicStatus,
  EntityData,
  EntityDataCreate,
  EntityDataUpdate,
  EntityMetaType,
} from './types';

/**
 * Canonical field names emitted by every {@link buildDataForSet} /
 * `buildDataForUpdate` / `buildDataForDelete` / `buildDataForRestore`
 * call. Storage adapters (`InMemoryStorageProvider`, `PgStorageProvider`,
 * and any future backend) MUST reference these constants instead of
 * hard-coded string literals so a future rename (e.g. camelCase
 * migration) propagates through the type system rather than silently
 * desynchronising adapters.
 *
 * Wave 21 / EVID-076 CP-1: previously each adapter hard-coded its own
 * `'creator_uuid'` / `'created_at'` literals; a rename in
 * {@link MutationMarks} would have silently broken
 * `preservesCreatorAudit` semantics without test failure.
 *
 * The object is `Object.freeze`d + `as const`-typed so consumers get
 * literal narrowing for every key:
 *
 * ```ts
 * AUDIT_FIELDS.creator_uuid // type: 'creator_uuid'
 * ```
 *
 * Stability contract: `AUDIT_FIELDS` is part of the public surface;
 * renaming any value is a breaking change requiring a major version
 * bump and synchronised updates in every consuming adapter.
 *
 * @public
 */
export const AUDIT_FIELDS = Object.freeze({
  created_at: 'created_at' as const,
  creator_uuid: 'creator_uuid' as const,
  created_by_platform: 'created_by_platform' as const,
  updated_at: 'updated_at' as const,
  updated_by_uuid: 'updated_by_uuid' as const,
  updated_by_platform: 'updated_by_platform' as const,
  deleted_at: 'deleted_at' as const,
  deleted_by_uuid: 'deleted_by_uuid' as const,
  deleted_by_platform: 'deleted_by_platform' as const,
});

/**
 * Strict union of the canonical audit field names (the values of
 * {@link AUDIT_FIELDS}). Useful when validating that a config-supplied
 * field selector is a real audit field at the type level.
 *
 * @public
 */
export type AuditFieldName = (typeof AUDIT_FIELDS)[keyof typeof AUDIT_FIELDS];

/**
 * Subset of {@link AUDIT_FIELDS} that storage-adapter upsert paths MUST
 * preserve across the UPDATE branch (i.e. strip from the incoming
 * payload before merging into the existing row). Mirrors the columns
 * stamped exactly once by {@link buildDataForSet} on insert — see the
 * `PgStorageProvider.upsertDoc` jsonb-strip clause and
 * `InMemoryStorageProvider.upsertDoc` merge fallback.
 *
 * @public
 */
export const CREATOR_AUDIT_FIELDS: ReadonlyArray<AuditFieldName> = Object.freeze([
  AUDIT_FIELDS.creator_uuid,
  AUDIT_FIELDS.created_at,
]);
