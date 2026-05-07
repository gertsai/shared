// SPDX-License-Identifier: Apache-2.0
// Originally inspired by Orchestra orchlab/core/src/mixins.ts builder helpers
// (`buildDataForSet`, `buildDataForUpdate`, `buildDataForDelete`,
// `buildDataForRestore`) under Apache 2.0. The Firelord `serverTimestamp()`
// integration is replaced by an injectable {@link TimestampProvider} so the
// package stays storage-agnostic.

import type { Session } from '@gertsai/session';

import { defaultTimestampProvider, type TimestampProvider } from './timestamp';
import type {
  EntityBasicStatus,
  EntityDataCreate,
  EntityDataUpdate,
  MutationMarks,
  UpdateAction,
} from './types';

/** Shared options accepted by every `buildDataFor*` builder. */
export interface BuilderOpts {
  /** Override the wall-clock source — handy for deterministic tests. */
  readonly timestampProvider?: TimestampProvider;
}

/**
 * Options for {@link buildDataForUpdate}. The `action` field is optional:
 * callers who don't supply it get an `EntityDataUpdate` without an
 * `update_action` audit log entry. The action's `type` is constrained to
 * `string` (matching Orchestra `mixins.ts`); callers extending
 * {@link UpdateActionType} via {@link UpdateActionMap} module augmentation
 * can narrow further at the call site by typing the literal explicitly.
 */
export interface UpdateOpts<Action extends string = string>
  extends BuilderOpts {
  readonly action?: {
    readonly type: Action;
    readonly params?: Readonly<Record<string, unknown>>;
  };
}

/**
 * Options for {@link buildDataForSet}. Caller owns `_uid` generation (the
 * package is intentionally storage-agnostic and does not bundle a uuid lib).
 *
 * Merge order in {@link buildDataForSet}: `default-mixins → base → data →
 * overrides`. Use `overrides` to win over auto-generated fields when needed
 * (e.g. seeding a non-default `status`).
 */
export interface SetBuilderOpts<Status extends EntityBasicStatus = EntityBasicStatus>
  extends BuilderOpts {
  /** Caller-generated unique identifier for the entity. */
  readonly _uid: string;
  /**
   * Initial lifecycle status. Defaults to `'created'` for parity with
   * Orchestra `defaultFirestoreEntityData`.
   */
  readonly status?: Status;
  /**
   * Priority-mixin defaults applied before `data`. Use for default values
   * the caller wants overridable by `data`.
   */
  readonly base?: Readonly<Record<string, unknown>>;
  /**
   * Final-pass overrides applied after audit marks. Wins over every other
   * source. Use sparingly — for example, to force a non-default status.
   */
  readonly overrides?: Readonly<Record<string, unknown>>;
  /**
   * Optional `params` recorded on the synthetic `update_action: 'create'`
   * audit entry. Defaults to `{}`.
   */
  readonly params?: Readonly<Record<string, unknown>>;
}

function assertSession(
  session: Session | null | undefined,
): asserts session is Session {
  if (!session) {
    throw new Error('entity-audit builders require a non-null Session');
  }
}

/**
 * Build the create-time payload for a brand-new entity.
 *
 * Stamps `created_*` AND `updated_*` to the same timestamp/operator, sets
 * `deleted_*` to `null`, fixes `status` (default `'created'`), and emits an
 * `update_action: { type: 'create', ... }` audit-log entry.
 *
 * Merge order: `base → data → audit-marks → overrides`. The audit triplet
 * (`_uid`, `creator_uuid`, timestamps, `update_action`, `status`) is applied
 * AFTER `data` so business fields cannot accidentally clobber it; `overrides`
 * is applied last so callers can intentionally force-override anything.
 */
export function buildDataForSet<Data extends object>(
  data: Data,
  session: Session,
  opts: SetBuilderOpts,
): EntityDataCreate<Data> & {
  readonly _uid: string;
  readonly status: EntityBasicStatus;
  readonly update_action: UpdateAction;
} {
  assertSession(session);
  const ts = (opts.timestampProvider ?? defaultTimestampProvider)();
  const marks: MutationMarks = {
    created_at: ts,
    creator_uuid: session.operatorUuid,
    created_by_platform: session.clientPlatform,
    updated_at: ts,
    updated_by_uuid: session.operatorUuid,
    updated_by_platform: session.clientPlatform,
    deleted_at: null,
    deleted_by_uuid: null,
    deleted_by_platform: null,
  };
  const audit: {
    readonly _uid: string;
    readonly status: EntityBasicStatus;
    readonly update_action: UpdateAction;
  } = {
    _uid: opts._uid,
    status: opts.status ?? 'created',
    update_action: {
      type: 'create',
      params: opts.params ?? {},
      timestamp: ts,
    },
  };
  return {
    ...opts.base,
    ...data,
    ...marks,
    ...audit,
    ...opts.overrides,
  } as EntityDataCreate<Data> & {
    readonly _uid: string;
    readonly status: EntityBasicStatus;
    readonly update_action: UpdateAction;
  };
}

/**
 * Build the partial-update payload — refreshes the `updated_*` triplet and
 * forwards the caller's diff verbatim. Records an `update_action` audit-log
 * entry when the caller supplies `opts.action` (the canonical Orchestra
 * pattern for business-meaningful events such as `'invite_sent'` or
 * `'transfer_funds'`).
 *
 * Does not touch `created_*` or `deleted_*` (use `buildDataForDelete` /
 * `buildDataForRestore` for those).
 */
export function buildDataForUpdate<
  Data extends object,
  Action extends string = string,
>(
  partial: Partial<Data>,
  session: Session,
  opts: UpdateOpts<Action> = {},
): EntityDataUpdate<Data> & { readonly update_action?: UpdateAction } {
  assertSession(session);
  const ts = (opts.timestampProvider ?? defaultTimestampProvider)();
  const base: EntityDataUpdate<Data> = {
    ...partial,
    updated_at: ts,
    updated_by_uuid: session.operatorUuid,
    updated_by_platform: session.clientPlatform,
  } as EntityDataUpdate<Data>;
  if (opts.action) {
    const update_action = {
      type: opts.action.type,
      params: opts.action.params ?? {},
      timestamp: ts,
    } as UpdateAction;
    return { ...base, update_action } as EntityDataUpdate<Data> & {
      readonly update_action: UpdateAction;
    };
  }
  return base;
}

/**
 * Build the soft-delete payload — stamps both `deleted_*` and `updated_*`
 * with the same operator/timestamp so the tombstone records who killed it
 * and when. Also flips `status` to `'deleted'` and emits an
 * `update_action: { type: 'delete', ... }` audit-log entry.
 *
 * Returns only the audit fields; callers merge with the existing record.
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
> & {
  readonly status: EntityBasicStatus;
  readonly update_action: UpdateAction;
} {
  assertSession(session);
  const ts = (opts.timestampProvider ?? defaultTimestampProvider)();
  return {
    deleted_at: ts,
    deleted_by_uuid: session.operatorUuid,
    deleted_by_platform: session.clientPlatform,
    updated_at: ts,
    updated_by_uuid: session.operatorUuid,
    updated_by_platform: session.clientPlatform,
    status: 'deleted',
    update_action: {
      type: 'delete',
      params: {},
      timestamp: ts,
    },
  };
}

/**
 * Build the restore payload — reverses {@link buildDataForDelete} by
 * clearing the `deleted_*` triplet to `null`, bumping `updated_*` to the
 * current operator/timestamp, flipping `status` back to `'created'`, and
 * emitting an `update_action: { type: 'restore', ... }` audit-log entry.
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
> & {
  readonly status: EntityBasicStatus;
  readonly update_action: UpdateAction;
} {
  assertSession(session);
  const ts = (opts.timestampProvider ?? defaultTimestampProvider)();
  return {
    deleted_at: null,
    deleted_by_uuid: null,
    deleted_by_platform: null,
    updated_at: ts,
    updated_by_uuid: session.operatorUuid,
    updated_by_platform: session.clientPlatform,
    status: 'created',
    update_action: {
      type: 'restore',
      params: {},
      timestamp: ts,
    },
  };
}
