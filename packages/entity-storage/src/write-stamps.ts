// SPDX-License-Identifier: Apache-2.0
/**
 * Audit stamps for runner writes — ONE implementation shared by
 * {@link BaseEntityStorageService}'s audited batch/tx wrappers and any
 * facade-level write runner (e.g. demo-hub's cross-table
 * `KanbanWriteRunner`). The stamping logic used to live in three
 * copies that already drifted once (the `delete` action-override);
 * keeping it here makes every audited writer stamp identically.
 *
 * Lifecycle verbs carry no caller action of their own — when the
 * caller supplies one, it rides inside the stamped `update_action`
 * preserving the lifecycle timestamp.
 */
import {
  buildDataForDelete,
  buildDataForRestore,
  buildDataForSet,
  buildDataForUpdate,
} from '@gertsai/entity-audit';
import type { Session } from '@gertsai/session';

/** Caller-supplied journal for a stamped write. */
export interface WriteAction {
  readonly type: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** Normalize runner `opts.action`/`opts.params` into a {@link WriteAction}. */
export function actionFromOpts(
  action: string | undefined,
  params: Readonly<Record<string, unknown>> | undefined,
): WriteAction | undefined {
  return action !== undefined ? { type: action, params: params ?? {} } : undefined;
}

/** `set` stamp — create/update audit fields + `_uid` echo. */
export function stampCreate(
  patch: Readonly<Record<string, unknown>>,
  session: Session,
  _uid: string,
): Record<string, unknown> {
  return buildDataForSet(patch as object, session, { _uid }) as Record<
    string,
    unknown
  >;
}

/** `update` stamp — `updated_*` triplet + optional `update_action`. */
export function stampUpdate(
  patch: Readonly<Record<string, unknown>>,
  session: Session,
  action?: WriteAction,
): Record<string, unknown> {
  return buildDataForUpdate<object, string>(patch as Partial<object>, session, {
    ...(action !== undefined
      ? { action: { type: action.type, params: action.params } }
      : {}),
  }) as Record<string, unknown>;
}

/**
 * Soft-delete stamp — `deleted_*` triplet + lifecycle `status`. When
 * the caller supplies an action, it replaces the canonical `'delete'`
 * journal type but keeps the lifecycle timestamp — a member revoke
 * journals as `board_member_revoked`, not a generic delete.
 */
export function stampDelete(
  session: Session,
  action?: WriteAction,
): Record<string, unknown> {
  const marks = buildDataForDelete(session);
  if (action === undefined) return marks as Record<string, unknown>;
  return {
    ...marks,
    update_action: {
      type: action.type,
      params: action.params,
      timestamp: marks.update_action.timestamp,
    },
  } as Record<string, unknown>;
}

/** Restore stamp — clears `deleted_*`, flips lifecycle back to live. */
export function stampRestore(session: Session): Record<string, unknown> {
  return buildDataForRestore(session) as Record<string, unknown>;
}
