// SPDX-License-Identifier: Apache-2.0
// Originally inspired by Orchestra orchlab/core/src/meta.ts builder helpers
// (`defaultEntityMutationMarksData`, `defaultFirestoreEntityData`, ...) under
// Apache 2.0. The Firelord `serverTimestamp()` integration is replaced by an
// injectable {@link TimestampProvider} so the package stays storage-agnostic.

import type { Session } from '@gertsai/session';

import { defaultTimestampProvider, type TimestampProvider } from './timestamp';
import type {
  EntityDataCreate,
  EntityDataUpdate,
  MutationMarks,
} from './types';

/** Shared options accepted by every `buildDataFor*` builder. */
export interface BuilderOpts {
  /** Override the wall-clock source — handy for deterministic tests. */
  readonly timestampProvider?: TimestampProvider;
}

function assertSession(
  session: Session | null | undefined,
): asserts session is Session {
  if (!session) {
    throw new Error('entity-audit builders require a non-null Session');
  }
}

/**
 * Build the create-time payload for a brand-new entity. Stamps `created_*`
 * AND `updated_*` to the same timestamp/operator so the entity has a valid
 * audit trail from the moment it lands.
 */
export function buildDataForSet<Data extends object>(
  data: Data,
  session: Session,
  opts: BuilderOpts = {},
): EntityDataCreate<Data> {
  assertSession(session);
  const ts = (opts.timestampProvider ?? defaultTimestampProvider)();
  const marks: MutationMarks = {
    created_at: ts,
    created_by_uuid: session.operatorUuid,
    created_by_platform: session.operatorType,
    updated_at: ts,
    updated_by_uuid: session.operatorUuid,
    updated_by_platform: session.operatorType,
    deleted_at: null,
    deleted_by_uuid: null,
    deleted_by_platform: null,
  };
  return { ...data, ...marks } as EntityDataCreate<Data>;
}

/**
 * Build the partial-update payload — refreshes only the `updated_*` triplet
 * and forwards the caller's diff verbatim. Does not touch `created_*` or
 * `deleted_*` (use `buildDataForDelete` / `buildDataForRestore` for those).
 */
export function buildDataForUpdate<Data extends object>(
  partial: Partial<Data>,
  session: Session,
  opts: BuilderOpts = {},
): EntityDataUpdate<Data> {
  assertSession(session);
  const ts = (opts.timestampProvider ?? defaultTimestampProvider)();
  return {
    ...partial,
    updated_at: ts,
    updated_by_uuid: session.operatorUuid,
    updated_by_platform: session.operatorType,
  } as EntityDataUpdate<Data>;
}

/**
 * Build the soft-delete payload — stamps both `deleted_*` and `updated_*`
 * with the same operator/timestamp so the tombstone records who killed it
 * and when. Returns only the audit fields; merge with the existing record.
 */
export function buildDataForDelete(
  session: Session,
  opts: BuilderOpts = {},
): Pick<
  MutationMarks,
  | 'deleted_at'
  | 'deleted_by_uuid'
  | 'deleted_by_platform'
  | 'updated_at'
  | 'updated_by_uuid'
  | 'updated_by_platform'
> {
  assertSession(session);
  const ts = (opts.timestampProvider ?? defaultTimestampProvider)();
  return {
    deleted_at: ts,
    deleted_by_uuid: session.operatorUuid,
    deleted_by_platform: session.operatorType,
    updated_at: ts,
    updated_by_uuid: session.operatorUuid,
    updated_by_platform: session.operatorType,
  };
}

/**
 * Build the restore payload — reverses {@link buildDataForDelete} by
 * clearing the `deleted_*` triplet to `null` and bumping `updated_*` to the
 * current operator/timestamp.
 */
export function buildDataForRestore(
  session: Session,
  opts: BuilderOpts = {},
): Pick<
  MutationMarks,
  | 'deleted_at'
  | 'deleted_by_uuid'
  | 'deleted_by_platform'
  | 'updated_at'
  | 'updated_by_uuid'
  | 'updated_by_platform'
> {
  assertSession(session);
  const ts = (opts.timestampProvider ?? defaultTimestampProvider)();
  return {
    deleted_at: null,
    deleted_by_uuid: null,
    deleted_by_platform: null,
    updated_at: ts,
    updated_by_uuid: session.operatorUuid,
    updated_by_platform: session.operatorType,
  };
}
