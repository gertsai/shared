// SPDX-License-Identifier: Apache-2.0
/**
 * Write-rules engine — Orchestra `firestore.rules` parity at the audited
 * storage boundary (RFC-024 gap 5).
 *
 * Orchestra evaluates `allow create/update/delete` per collection at the
 * DB edge: `basicUpdateCheck` requires a well-formed `update_action` on
 * every update, and the action's type selects which changed keys are
 * legal (`affectedKeys.hasAll(required).hasOnly(allowed)`). A use-case
 * bug cannot smuggle a field change past the rule because the LAST
 * evaluation happens where the write is stamped — not where it was
 * authorized.
 *
 * This module ports that model: `TableWriteRules` maps each verb (and
 * each `update_action.type` under update/delete) to a predicate that
 * sees `{session, action, affectedKeys, patch, resource}`. The engine
 * is fail-closed — a table WITH a ruleset denies any verb/action the
 * ruleset doesn't name; a table WITHOUT a ruleset is unaffected
 * (rules are opt-in per collection).
 *
 * Built-in guards apply to every rules-governed table regardless of
 * predicates:
 *
 * - `PROTECTED_UPDATE_FIELDS` — audit/identity/lifecycle columns can
 *   never appear in a caller's update diff. They are service-stamped
 *   (`buildDataForUpdate` owns `updated_*`/`update_action`; `delete`/
 *   `restore` own `deleted_*`/`status`-family; `creator_*` is
 *   immutable history).
 * - `update_action` REQUIRED on updates — the Orchestra
 *   `NO_UPDATE_ACTION` check. An action-less update on a mapped table
 *   is denied before any predicate runs.
 * - Unknown action type → denied (fail-closed; `'*'` is an explicit
 *   opt-out a table may declare).
 */

import type { Session } from '@gertsai/session';

/** Storage verb being evaluated. */
export type WriteVerb = 'create' | 'update' | 'delete' | 'restore' | 'destroy';

/** The `update_action` journal stamped on the write. */
export interface WriteRuleAction {
  readonly type: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** Everything a predicate may inspect for one write. */
export interface WriteRuleEval {
  /** Storage verb — `create` covers `set`; `destroy` is hard-delete. */
  readonly verb: WriteVerb;
  /** Collection path / table name. */
  readonly path: string;
  /** Target document id (`_uid`/`id`). */
  readonly id: string;
  /** Operator session stamping this write. */
  readonly session: Session;
  /**
   * The `update_action` being journaled, when the caller supplied one
   * (`opts.action` on update/delete). Lifecycle verbs stamp their own
   * type (`delete`, `restore`); creates carry `{type:'create'}`.
   */
  readonly action?: WriteRuleAction;
  /**
   * Keys whose persisted value actually changes — the caller's patch
   * diffed against `resource` (Orchestra
   * `request.data.diff(resource).affectedKeys()`). On create every
   * supplied key counts; a key written with an identical value does
   * not. Access/audit fields the stamp adds are excluded — predicates
   * judge domain fields only.
   */
  readonly affectedKeys: readonly string[];
  /** The caller's domain field map (pre-stamp). Empty on delete/restore. */
  readonly patch: Readonly<Record<string, unknown>>;
  /**
   * The stored row before this write (`undefined` on create or missing
   * doc). Sourced from the transaction snapshot when the write is
   * tx-routed, else the provider.
   */
  readonly resource?: Record<string, unknown>;
}

/** Rule predicate — `true` allows the write. May be async. */
export type WriteRulePredicate = (
  eval_: WriteRuleEval,
) => boolean | Promise<boolean>;

/**
 * Action-keyed rule map for `update`/`delete`: keys are
 * `update_action.type` values; `'*'` is the fallback for types not
 * named. A single predicate is shorthand for `{'*': predicate}`.
 */
export type ActionRules =
  | WriteRulePredicate
  | Readonly<Record<string, WriteRulePredicate>>;

/** Per-table rule bundle — the `match /path/{id}` body. */
export interface TableWriteRules {
  /** `set`/`upsert`-create rule. */
  readonly create?: WriteRulePredicate;
  /** `update` rules keyed by `update_action.type` (or one predicate). */
  readonly update?: ActionRules;
  /** `delete` rules keyed by `update_action.type` (or one predicate). */
  readonly delete?: ActionRules;
  /** `restore` rule. */
  readonly restore?: WriteRulePredicate;
  /** `destroy` (hard-delete) rule. */
  readonly destroy?: WriteRulePredicate;
}

/** `path → rules` registry handed to facades spanning many tables. */
export type WriteRules = Readonly<Record<string, TableWriteRules>>;

/** Build a `{path: rules}` pair for {@link collectTableRules}. */
export function defineTableRules(
  path: string,
  rules: TableWriteRules,
): { readonly path: string; readonly rules: TableWriteRules } {
  return { path, rules };
}

/** Merge `defineTableRules(...)` pairs into a {@link WriteRules} map. */
export function collectTableRules(
  ...defs: readonly { readonly path: string; readonly rules: TableWriteRules }[]
): WriteRules {
  const out: Record<string, TableWriteRules> = {};
  for (const d of defs) {
    if (out[d.path] !== undefined) {
      throw new Error(`Duplicate write-rules for path '${d.path}'`);
    }
    out[d.path] = d.rules;
  }
  return out;
}

/**
 * Denied write — carries enough context to debug without replaying.
 * `reason` names the failed guard so log scanners can aggregate.
 */
export class WriteRuleDenied extends Error {
  readonly path: string;
  readonly id: string;
  readonly verb: WriteVerb;
  readonly actionType: string | undefined;
  readonly reason: string;

  constructor(
    eval_: Pick<WriteRuleEval, 'path' | 'id' | 'verb'> & {
      actionType?: string | undefined;
    },
    reason: string,
  ) {
    super(
      `write denied: ${eval_.verb} ${eval_.path}/${eval_.id}` +
        (eval_.actionType !== undefined
          ? ` (action=${eval_.actionType})`
          : '') +
        ` — ${reason}`,
    );
    this.name = 'WriteRuleDenied';
    this.path = eval_.path;
    this.id = eval_.id;
    this.verb = eval_.verb;
    this.actionType = eval_.actionType;
    this.reason = reason;
  }
}

/**
 * Audit-stamped fields — a caller supplying them is tampering (or a
 * bug), on ANY verb. `buildDataForSet`/`buildDataForUpdate`/`…Delete`/
 * `…Restore` own these; they are never legitimate caller input.
 */
export const PROTECTED_AUDIT_FIELDS: readonly string[] = [
  'creator_uuid',
  'created_by_platform',
  'updated_by_uuid',
  'updated_by_platform',
  'deleted_at',
  'deleted_by_uuid',
  'deleted_by_platform',
  'update_action',
] as const;

/**
 * Fields additionally protected on **update**: identity and lifecycle
 * columns that callers may legitimately write on create (`id`,
 * `created_at`, `updated_at` sit inside `WriteShape`) but can never
 * patch later. `entity_status`/`status` are lifecycle-owned on every
 * verb (the delete/restore stamps own transitions).
 */
export const PROTECTED_UPDATE_FIELDS: readonly string[] = [
  ...PROTECTED_AUDIT_FIELDS,
  '_uid',
  'id',
  'entity_status',
  'status',
  'created_at',
  'updated_at',
] as const;

/** Fields protected on **create** — audit marks + lifecycle. `id`/`created_at`/`updated_at` stay writable (domain columns). */
export const PROTECTED_CREATE_FIELDS: readonly string[] = [
  ...PROTECTED_AUDIT_FIELDS,
  '_uid',
  'entity_status',
  'status',
] as const;

/** Value-equality for the affected-keys diff (deep-lite via JSON). */
function valuesDiffer(a: unknown, b: unknown): boolean {
  if (a === b) return false;
  if (a === null || b === null) return true;
  if (typeof a !== typeof b) return true;
  if (typeof a !== 'object') return true;
  try {
    return JSON.stringify(a) !== JSON.stringify(b);
  } catch {
    return true;
  }
}

/**
 * Compute Orchestra-style `affectedKeys`: patch keys whose value
 * differs from the stored doc. Missing `resource` → every patch key is
 * treated as affected (a write against a nonexistent row still names
 * the fields it tried to set).
 */
export function computeAffectedKeys(
  patch: Readonly<Record<string, unknown>>,
  resource: Record<string, unknown> | undefined,
): string[] {
  return Object.keys(patch).filter(
    (k) => resource === undefined || valuesDiffer(patch[k], resource[k]),
  );
}

/**
 * Orchestra `verifyUpdateObject` parity: `affectedKeys` must contain
 * every `required` key and nothing outside `required ∪ optional`.
 * The canonical action-rule body —
 * `card_moved: allowFields(['list_id', 'position'])`.
 */
export function allowFields(
  required: readonly string[],
  optional: readonly string[] = [],
): WriteRulePredicate {
  const allowed = new Set([...required, ...optional]);
  return ({ affectedKeys }) =>
    required.every((k) => affectedKeys.includes(k)) &&
    affectedKeys.every((k) => allowed.has(k));
}

/** Predicate constant — the verb is allowed without field checks. */
export const allowWrite: WriteRulePredicate = () => true;

/** Predicate constant — the verb is explicitly forbidden. */
export const denyWrite: WriteRulePredicate = () => false;

function resolvePredicate(
  rules: ActionRules | undefined,
  actionType: string | undefined,
): WriteRulePredicate | undefined {
  if (rules === undefined) return undefined;
  if (typeof rules === 'function') return rules;
  if (actionType === undefined) return undefined;
  return rules[actionType] ?? rules['*'];
}

/**
 * Evaluate one write against a table's ruleset — Orchestra
 * `basicUpdateCheck` + the matched `allow` body.
 *
 * Fail-closed semantics: when `rules` is defined the verb must resolve
 * to a predicate and the predicate must return true; update-style verbs
 * additionally require an `update_action`. `rules === undefined` means
 * the table opted out — the write passes (back-compat for collections
 * that haven't declared rules yet).
 *
 * @throws {WriteRuleDenied} on any denied write.
 */
export async function assertWriteAllowed(
  rules: TableWriteRules | undefined,
  eval_: WriteRuleEval,
): Promise<void> {
  if (rules === undefined) return;

  // Guard 1 — protected fields can never ride a caller's diff.
  if (eval_.verb === 'update' || eval_.verb === 'create') {
    const protectedSet =
      eval_.verb === 'update'
        ? PROTECTED_UPDATE_FIELDS
        : PROTECTED_CREATE_FIELDS;
    const illegal = Object.keys(eval_.patch).filter((k) =>
      (protectedSet as readonly string[]).includes(k),
    );
    if (illegal.length > 0) {
      throw new WriteRuleDenied(
        { ...eval_, actionType: eval_.action?.type },
        `protected fields in diff: ${illegal.join(', ')}`,
      );
    }
  }

  // Guard 2 — update/delete on a mapped table require update_action
  // (Orchestra `NO_UPDATE_ACTION`). Restore/destroy stamp their own.
  const needsAction =
    (eval_.verb === 'update' || eval_.verb === 'delete') &&
    (rules[eval_.verb as 'update' | 'delete'] !== undefined);
  if (needsAction && eval_.action === undefined) {
    throw new WriteRuleDenied(
      { ...eval_, actionType: undefined },
      'update_action required (NO_UPDATE_ACTION)',
    );
  }

  let predicate: WriteRulePredicate | undefined;
  switch (eval_.verb) {
    case 'create':
      predicate = rules.create;
      break;
    case 'update':
      predicate = resolvePredicate(rules.update, eval_.action?.type);
      break;
    case 'delete':
      predicate = resolvePredicate(rules.delete, eval_.action?.type);
      break;
    case 'restore':
      predicate = rules.restore;
      break;
    case 'destroy':
      predicate = rules.destroy;
      break;
  }

  if (predicate === undefined) {
    throw new WriteRuleDenied(
      { ...eval_, actionType: eval_.action?.type },
      `no rule for verb '${eval_.verb}'` +
        (eval_.action !== undefined
          ? ` / action '${eval_.action.type}'`
          : ''),
    );
  }
  if (!(await predicate(eval_))) {
    throw new WriteRuleDenied(
      { ...eval_, actionType: eval_.action?.type },
      'rule predicate returned false',
    );
  }
}
