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
import { VersionConflictError } from '@gertsai/storage-core';

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
   * doc). Always the COMMITTED state — read via `provider.getDoc`, never
   * a transaction's local view (own queued writes would leak post-write
   * state into `resource`).
   */
  readonly resource?: Record<string, unknown>;
  /**
   * Optimistic-concurrency precondition the caller declared (ETag).
   * When set, the gate compares it against `resource.update_version`
   * and throws {@link VersionConflictError} on mismatch — a distinct
   * signal from {@link WriteRuleDenied} (409 vs 403). The provider
   * re-enforces the same condition atomically at write time.
   */
  readonly expectedVersion?: number;
}

/** Rule predicate — `true` allows the write. May be async. */
export type WriteRulePredicate = (
  ctx: WriteRuleEval,
) => boolean | Promise<boolean>;

/**
 * Denial observer — called synchronously just before the gate throws.
 * Receives the typed error ({@link WriteRuleDenied} for policy denials,
 * {@link VersionConflictError} for optimistic-concurrency failures) so
 * metrics can key on `err.name` / `verb` / `path` / `reason` without
 * string-sniffing. Wire it to a counter; keep it cheap — it runs on
 * every denied write.
 */
export type WriteDenialObserver = (
  err: WriteRuleDenied | VersionConflictError,
) => void;

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
    ctx: Pick<WriteRuleEval, 'path' | 'id' | 'verb'> & {
      actionType?: string | undefined;
    },
    reason: string,
  ) {
    super(
      `write denied: ${ctx.verb} ${ctx.path}/${ctx.id}` +
        (ctx.actionType !== undefined ? ` (action=${ctx.actionType})` : '') +
        ` — ${reason}`,
    );
    this.name = 'WriteRuleDenied';
    this.path = ctx.path;
    this.id = ctx.id;
    this.verb = ctx.verb;
    this.actionType = ctx.actionType;
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
  'update_version',
] as const;

/** Fields protected on **create** — audit marks + lifecycle. `id`/`created_at`/`updated_at` stay writable (domain columns). */
export const PROTECTED_CREATE_FIELDS: readonly string[] = [
  ...PROTECTED_AUDIT_FIELDS,
  '_uid',
  'entity_status',
  'status',
  'update_version',
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
 * Notify the denial observer — fire-and-forget. A metrics sink that
 * throws must never turn a gate rejection into a different failure,
 * and must never *cause* one on the allow path.
 */
function notifyDenied(
  onDenied: WriteDenialObserver | undefined,
  err: WriteRuleDenied | VersionConflictError,
): void {
  if (onDenied === undefined) return;
  try {
    onDenied(err);
  } catch {
    // Intentionally swallowed — instrumentation is not the authority.
  }
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
 * @throws {VersionConflictError} when `ctx.expectedVersion` is declared
 *   and the committed row's `update_version` differs (or the row is
 *   absent).
 */
export async function assertWriteAllowed(
  rules: TableWriteRules | undefined,
  ctx: WriteRuleEval,
  onDenied?: WriteDenialObserver,
): Promise<void> {
  if (rules === undefined) return;

  // Guard 1 — protected fields can never ride a caller's diff.
  if (ctx.verb === 'update' || ctx.verb === 'create') {
    const protectedSet =
      ctx.verb === 'update'
        ? PROTECTED_UPDATE_FIELDS
        : PROTECTED_CREATE_FIELDS;
    const illegal = Object.keys(ctx.patch).filter((k) =>
      (protectedSet as readonly string[]).includes(k),
    );
    if (illegal.length > 0) {
      const err = new WriteRuleDenied(
        { ...ctx, actionType: ctx.action?.type },
        `protected fields in diff: ${illegal.join(', ')}`,
      );
      notifyDenied(onDenied, err);
      throw err;
    }
  }

  // Guard 1b — caller-declared ETag. Evaluated against committed state
  // here (semantic check, observable); the provider re-checks the same
  // condition atomically at write time to close the read→write race.
  // A missing row IS a conflict when a version was declared — the
  // caller asserted it existed at that version.
  if (ctx.expectedVersion !== undefined) {
    const actual =
      ctx.resource !== undefined
        ? (ctx.resource['update_version'] as number | undefined)
        : undefined;
    if (actual !== ctx.expectedVersion) {
      const err = new VersionConflictError({
        path: ctx.path,
        id: ctx.id,
        expected: ctx.expectedVersion,
        ...(actual !== undefined ? { actual } : {}),
      });
      notifyDenied(onDenied, err);
      throw err;
    }
  }

  // Guard 2 — update/delete on a mapped table require update_action
  // (Orchestra `NO_UPDATE_ACTION`). Restore/destroy stamp their own.
  const needsAction =
    (ctx.verb === 'update' || ctx.verb === 'delete') &&
    (rules[ctx.verb as 'update' | 'delete'] !== undefined);
  if (needsAction && ctx.action === undefined) {
    const err = new WriteRuleDenied(
      { ...ctx, actionType: undefined },
      'update_action required (NO_UPDATE_ACTION)',
    );
    notifyDenied(onDenied, err);
    throw err;
  }

  let predicate: WriteRulePredicate | undefined;
  switch (ctx.verb) {
    case 'create':
      predicate = rules.create;
      break;
    case 'update':
      predicate = resolvePredicate(rules.update, ctx.action?.type);
      break;
    case 'delete':
      predicate = resolvePredicate(rules.delete, ctx.action?.type);
      break;
    case 'restore':
      predicate = rules.restore;
      break;
    case 'destroy':
      predicate = rules.destroy;
      break;
  }

  if (predicate === undefined) {
    const err = new WriteRuleDenied(
      { ...ctx, actionType: ctx.action?.type },
      `no rule for verb '${ctx.verb}'` +
        (ctx.action !== undefined ? ` / action '${ctx.action.type}'` : ''),
    );
    notifyDenied(onDenied, err);
    throw err;
  }
  if (!(await predicate(ctx))) {
    const err = new WriteRuleDenied(
      { ...ctx, actionType: ctx.action?.type },
      'rule predicate returned false' +
        (ctx.affectedKeys.length > 0
          ? ` (affected: ${ctx.affectedKeys.join(', ')})`
          : ''),
    );
    notifyDenied(onDenied, err);
    throw err;
  }
}

/**
 * One write queued inside a batch/transaction, recorded for post-`fn`
 * rule evaluation — the runner's `pending` buffer entry.
 */
export interface PendingWrite {
  readonly verb: WriteVerb;
  /** Collection path the write targets. */
  readonly path: string;
  readonly id: string;
  /** The caller's pre-stamp field map (`set` body / `update` partial). */
  readonly patch: Readonly<Record<string, unknown>>;
  /**
   * The caller-supplied `update_action`, when given. Lifecycle verbs
   * omit it — the evaluator supplies the stamped type (`delete`,
   * `restore`, `create`) so action-keyed rules resolve identically to
   * the single-document path.
   */
  readonly action?: WriteRuleAction;
  /**
   * Caller-declared ETag — forwarded to the eval and to the raw
   * runner's atomic `WHERE update_version = $n` at flush.
   */
  readonly expectedVersion?: number;
}

/** Knobs for {@link assertPendingWrites}. */
export interface PendingWriteGate {
  /** Operator session — forwarded to every eval. */
  readonly session: Session;
  /** Ruleset lookup by collection path. */
  readonly rulesFor: (path: string) => TableWriteRules | undefined;
  /**
   * Committed-state row reader (`provider.getDoc`). Supplies `resource`
   * for update/delete/restore evals and the create-existence check.
   * Omit to evaluate without `resource` (weaker: `affectedKeys` falls
   * back to full patch keys, params-vs-resource checks degrade).
   */
  readonly resource?: (
    path: string,
    id: string,
  ) => Promise<Record<string, unknown> | undefined>;
  /**
   * What a write to a path with no registered ruleset does.
   * `'skip'` (default) preserves the engine's opt-in semantics —
   * ruleless tables pass. `'deny'` makes the buffer fail-closed —
   * use for writers scoped to a fixed table set, where an unmapped
   * path is a typo or an escape attempt.
   */
  readonly unmappedPath?: 'skip' | 'deny';
  /**
   * Called once per denied write just before the throw — the metrics
   * hook ({@link WriteDenialObserver}). Fires for both policy denials
   * and version conflicts surfaced inside the gate.
   */
  readonly onDenied?: WriteDenialObserver;
}

/**
 * Replay a batch/transaction's queued writes through the write-rules
 * gate — the deferred-eval counterpart of the per-call
 * {@link assertWriteAllowed}. Run AFTER the runner's `fn` queues
 * everything but BEFORE the buffered commit flushes: a denial thrown
 * here aborts the whole batch atomically (providers apply nothing when
 * the callback throws).
 *
 * Lifecycle defaults: an `update` without `action` hits
 * `NO_UPDATE_ACTION`; a `delete`/`restore`/`create` without one
 * evaluates under its stamped lifecycle type — same as the
 * single-document path.
 *
 * Create-existence guard: when `resource` is readable and the target
 * row already exists, `set` is denied outright — providers treat `set`
 * as upsert (`INSERT … ON CONFLICT DO UPDATE`), and letting it stand
 * would both smuggle an update past update-rules and stamp a false
 * `create` journal entry.
 */
export async function assertPendingWrites(
  pending: readonly PendingWrite[],
  gate: PendingWriteGate,
): Promise<void> {
  for (const w of pending) {
    const rules = gate.rulesFor(w.path);
    if (rules === undefined) {
      if (gate.unmappedPath === 'deny') {
        const err = new WriteRuleDenied(
          { path: w.path, id: w.id, verb: w.verb },
          `no ruleset registered for path '${w.path}'`,
        );
        notifyDenied(gate.onDenied, err);
        throw err;
      }
      continue;
    }
    const resource =
      gate.resource !== undefined
        ? ((await gate.resource(w.path, w.id)) ?? undefined)
        : undefined;
    if (w.verb === 'create' && resource !== undefined) {
      const err = new WriteRuleDenied(
        { path: w.path, id: w.id, verb: w.verb },
        'row already exists — set() is create-only on a governed table; use update()',
      );
      notifyDenied(gate.onDenied, err);
      throw err;
    }
    const action =
      w.action ??
      (w.verb === 'update'
        ? undefined
        : { type: w.verb === 'create' ? 'create' : w.verb, params: {} });
    await assertWriteAllowed(
      rules,
      {
        verb: w.verb,
        path: w.path,
        id: w.id,
        session: gate.session,
        ...(action !== undefined ? { action } : {}),
        affectedKeys:
          w.verb === 'create'
            ? Object.keys(w.patch)
            : w.verb === 'update'
              ? computeAffectedKeys(w.patch, resource)
              : [],
        patch: w.verb === 'create' || w.verb === 'update' ? w.patch : {},
        ...(resource !== undefined ? { resource } : {}),
        ...(w.expectedVersion !== undefined
          ? { expectedVersion: w.expectedVersion }
          : {}),
      },
      gate.onDenied,
    );
  }
}
