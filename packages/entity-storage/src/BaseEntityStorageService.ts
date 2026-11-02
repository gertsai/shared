// SPDX-License-Identifier: Apache-2.0
// Originally inspired by Orchestra orchlab/storage/src/service/EntityStorageService.ts
// (Apache 2.0). The Firelord / Orchestra-DI / Firestore couplings are
// stripped per ADR-005 Decision B: provider + session injected via the
// constructor (no DI container lookup), `_collectionPath` is a single
// string `path` (no nested-collection tuple), and audit-builders come from
// `@gertsai/entity-audit` rather than `@orchlab/core`.
import { EventEmitter } from "events";

import type { Session } from "@gertsai/session";
import type { IDestroyable } from "@gertsai/di";

import { STORAGE_EVENTS } from "./STORAGE_EVENTS";
import type {
  IBatchRunner,
  IStorageProvider,
  ITransactionRunner,
  Query,
  StorageLogger,
  StorageMetadata,
  WriteConcurrencyOpts,
} from "@gertsai/storage-core";
import {
  ListenersNotSupportedError,
  noopStorageLogger,
} from "@gertsai/storage-core";
import type { AuditedBatchRunner, AuditedTxRunner } from "./AuditedRunners";
import {
  assertPendingWrites,
  assertWriteAllowed,
  computeAffectedKeys,
  foldPendingWrite,
  WriteRuleDenied,
  type PendingWrite,
  type RuleDocReader,
  type TableWriteRules,
  type WriteDenialObserver,
  type WriteRuleEval,
} from "./write-rules";
import {
  actionFromOpts,
  stampCreate,
  stampDelete,
  stampRestore,
  stampUpdate,
} from "./write-stamps";
import type { WriteAction } from "./write-stamps";
/**
 * Clone caller-owned data before any asynchronous boundary, then recursively
 * freeze the copy used by rules and persistence.
 */
function ownedSnapshot<T>(value: T): T {
  const snapshot = structuredClone(value);
  const seen = new WeakSet<object>();
  const freeze = (current: unknown): void => {
    if (
      current === null ||
      typeof current !== "object" ||
      Object.isFrozen(current) ||
      seen.has(current)
    ) return;
    seen.add(current);
    if (current instanceof Map) {
      for (const [key, entry] of current) {
        freeze(key);
        freeze(entry);
      }
      Object.defineProperties(current, {
        set: { value: () => { throw new TypeError("Snapshot Map is immutable"); } },
        delete: { value: () => { throw new TypeError("Snapshot Map is immutable"); } },
        clear: { value: () => { throw new TypeError("Snapshot Map is immutable"); } },
      });
    } else if (current instanceof Set) {
      for (const entry of current) freeze(entry);
      Object.defineProperties(current, {
        add: { value: () => { throw new TypeError("Snapshot Set is immutable"); } },
        delete: { value: () => { throw new TypeError("Snapshot Set is immutable"); } },
        clear: { value: () => { throw new TypeError("Snapshot Set is immutable"); } },
      });
    } else {
      for (const entry of Object.values(current)) freeze(entry);
    }
    Object.freeze(current);
  };
  freeze(snapshot);
  return snapshot;
}
function immutableAction(
  action: WriteAction | undefined,
): WriteAction | undefined {
  if (action !== undefined) {
    Object.freeze(action);
    Object.freeze(action.params);
  }
  return action;
}


type RunnerCallbackState = { open: boolean };

type RunnerRegistration = {
  readonly owner: object;
  active: boolean;
  readonly enqueue: (write: PendingWrite) => void;
};
const auditedBatchRunners = new WeakMap<object, RunnerRegistration>();
const auditedTxRunners = new WeakMap<object, RunnerRegistration>();

/**
 * Optional per-method routing knob accepted by `set` / `update` / `delete` /
 * `restore` / `upsert`. A supplied runner must be an active audited runner
 * created by this same service instance. `runBatch` or `runTransaction` then
 * commits the queued mutation. Hard `destroy` is direct-only.
 *
 * Per SPEC-008 audit fix F-8: parity with Orchestra's per-method
 * `batch?` / `transaction?` overload, distinct from the `runTransaction(fn)` /
 * `runBatch(fn)` wrappers (W-2).
 *
 * **Emit semantics**: routed mutations do not emit service events, either
 * when queued or when the enclosing runner commits.
 *
 * @public
 */
export interface MutationRoutingOpts<
  Meta extends StorageMetadata,
  UpdateActionTypes extends string = string,
> {
  /** Queue this mutation onto the supplied audited batch instead of committing. */
  readonly batch?: AuditedBatchRunner<Meta, UpdateActionTypes>;
  /** Queue this mutation onto the supplied audited transaction instead of committing. */
  readonly transaction?: AuditedTxRunner<Meta, UpdateActionTypes>;
}

/**
 * Construction options for {@link BaseEntityStorageService}.
 *
 * `path` defaults to the empty string when omitted; concrete subclasses
 * usually fix it in their own constructor.
 */
export interface BaseEntityStorageServiceOpts<Meta extends StorageMetadata> {
  /** Backend-agnostic provider performing the actual reads/writes. */
  readonly provider: IStorageProvider<Meta>;
  /** Operator identity used to stamp audit fields. */
  readonly session: Session;
  /**
   * Collection path / table name passed verbatim to the provider. Concrete
   * subclasses commonly hard-code this to a domain noun like `'users'`.
   */
  readonly path?: string;
  /**
   * Caller-supplied UUID generator used by `set(...)` when the entity has
   * no `_uid`. Defaults to `crypto.randomUUID()`.
   */
  readonly uuidProvider?: () => string;
  /**
   * Pluggable structured logger (per SPEC-008 audit fix F-9). Defaults to
   * {@link noopStorageLogger} — production hot paths pay only a vtable
   * dispatch. Tests can plug a `vi.fn()`-backed collector to assert on
   * emitted log entries.
   */
  readonly logger?: StorageLogger;
  /**
   * Orchestra `firestore.rules`-parity write rules for this collection
   * (RFC-024 gap 5). When set, every `set`/`update`/`delete`/`restore`/
   * `upsert` is evaluated by {@link assertWriteAllowed}
   * BEFORE stamping/routing — a table with a ruleset fails closed on
   * unlisted verbs, unknown `update_action` types, and protected-field
   * diffs regardless of which use-case issued the write. Hard `destroy`
   * remains direct-only and is evaluated by the same rules gate.
   */
  readonly rules?: TableWriteRules | undefined;
  /**
   * Denial observer ({@link WriteDenialObserver}) — called once per
   * write the rules gate rejects, on both the direct and the
   * batch/transaction paths. Receives {@link WriteRuleDenied} for
   * policy failures and `VersionConflictError` for optimistic-
   * concurrency failures. Wire to a metrics counter.
   */
  readonly onDenied?: WriteDenialObserver;
  /**
   * `request.auth.token` claims (`admin`, …) forwarded into every rule
   * eval on this service — the single-doc counterpart of the batch
   * gate's `claims`. Defaults to `{}`.
   */
  readonly claims?: Readonly<Record<string, unknown>>;
}

/**
 * Payload accepted by {@link BaseEntityStorageService.set}. The class
 * generates `_uid` via `uuidProvider` when absent, then forwards the merged
 * object (with audit marks) to the provider's `set(path, id, data)`.
 */
export type SetEntityInput<Meta extends StorageMetadata> = Meta["write"] & {
  readonly _uid?: string;
};

/**
 * Wave 6.5 / Type-audit P1-1 — named alias for `upsert(entity)` input.
 *
 * Tightens `SetEntityInput<Meta>` (where `_uid` is optional) to a shape
 * where `_uid` is REQUIRED — `upsert` needs a stable id to route the
 * `INSERT ... ON CONFLICT (id) DO UPDATE` decision. The intersection
 * with the explicit `{ readonly _uid: string }` makes the constraint
 * visible at the call site without forcing each consumer to spell the
 * intersection out.
 */
export type UpsertEntityInput<Meta extends StorageMetadata> =
  SetEntityInput<Meta> & {
    readonly _uid: string;
  };

/**
 * Discriminated payload union emitted with every `entity-*` event. Listeners
 * narrow on the `event` literal to access shape-specific fields:
 *
 * - `entity-created` carries `data: Meta['read']` — the full audit-stamped
 *   record persisted by `set(...)`.
 * - `entity-updated` carries `partial: Partial<Meta['write']>` — the partial
 *   payload (audit fields refreshed) forwarded to `provider.update`.
 * - `entity-deleted` / `entity-restored` / `entity-destroyed` carry no extra
 *   data — soft-delete / hard-delete audit deltas are an implementation
 *   detail; the consumer already knows which `id` was affected.
 *
 * Per SPEC-008.1 audit fix C-5: prior monomorphic shape `{ data: Meta['read'] }`
 * lied for non-create events (UPDATE/DELETE/RESTORE actually emit a partial
 * write-shape, not a full read-shape). The union below tells the truth
 * without lying about what data is available per event. The
 * `entity-destroyed` variant is shared with W-5's hard-delete pathway.
 */
export type StorageEventPayload<Meta extends StorageMetadata> =
  | {
      readonly event: "entity-created";
      readonly path: string;
      readonly id: string;
      readonly data: Meta["read"];
    }
  | {
      readonly event: "entity-updated";
      readonly path: string;
      readonly id: string;
      readonly partial: Partial<Meta["write"]>;
    }
  | {
      readonly event: "entity-deleted";
      readonly path: string;
      readonly id: string;
    }
  | {
      readonly event: "entity-restored";
      readonly path: string;
      readonly id: string;
    }
  | {
      readonly event: "entity-destroyed";
      readonly path: string;
      readonly id: string;
    };

/**
 * Abstract base for entity-scoped storage services. Wraps an
 * {@link IStorageProvider} with session-aware audit-stamped CRUD plus
 * soft-delete / restore semantics.
 *
 * `Meta` is the {@link StorageMetadata} for the bound collection.
 * `UpdateActionTypes` (default `string`) is the literal union of allowed
 * `action.type` values forwarded to `buildDataForUpdate`.
 *
 * Per audit fix F-T-8: extends `EventEmitter` and implements
 * {@link IDestroyable}. Per audit fix F-T-10: `UpdateActionTypes` defaults
 * to `string` (more permissive than the SPEC-008 illustrative `never`).
 *
 * @example
 * ```ts
 * interface UserMeta extends StorageMetadata<UserData, UserData, 'email'> {}
 *
 * class UserStorage extends BaseEntityStorageService<UserMeta> {
 *   constructor(opts: { provider: IStorageProvider<UserMeta>; session: Session }) {
 *     super({ ...opts, path: 'users' });
 *   }
 * }
 * ```
 */
export abstract class BaseEntityStorageService<
  Meta extends StorageMetadata,
  UpdateActionTypes extends string = string,
>
  extends EventEmitter
  implements IDestroyable
{
  protected readonly _provider: IStorageProvider<Meta>;
  protected readonly _session: Session;
  protected readonly _path: string;
  protected readonly _uuidProvider: () => string;
  protected readonly _logger: StorageLogger;
  protected readonly _rules: TableWriteRules | undefined;
  protected readonly _onDenied: WriteDenialObserver | undefined;
  protected readonly _claims: Readonly<Record<string, unknown>>;
  protected readonly _listenerDisposers = new Set<() => void>();
  protected _destroyed = false;

  constructor(opts: BaseEntityStorageServiceOpts<Meta>) {
    super();
    this._provider = opts.provider;
    this._session = opts.session;
    this._path = opts.path ?? "";
    this._rules = opts.rules;
    this._onDenied = opts.onDenied;
    this._claims = ownedSnapshot(opts.claims ?? {});
    this._logger = opts.logger ?? noopStorageLogger;
    this._uuidProvider =
      opts.uuidProvider ??
      ((): string => {
        // Use Node 22 globalThis crypto first (preferred); fall back to
        // require('crypto') only when global is missing.
        const g = globalThis as { crypto?: { randomUUID?: () => string } };
        if (g.crypto?.randomUUID) return g.crypto.randomUUID();
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const nodeCrypto: { randomUUID: () => string } = require("crypto");
        return nodeCrypto.randomUUID();
      });
  }

  /** Provider capabilities (passthrough for consumer decision logic). */
  get capabilities(): IStorageProvider<Meta>["capabilities"] {
    return this._provider.capabilities;
  }

  /**
   * Read the stored row for a rules evaluation — Orchestra's `resource`
   * is the COMMITTED row, so this always goes to the provider even when
   * the write is tx-routed (`tx.get` would return the tx's local view —
   * own queued writes included — i.e. post-write state, not `resource`).
   */
  private async _readResource(
    uid: string,
  ): Promise<Record<string, unknown> | undefined> {
    const doc = await this._provider.getDoc(this._path, uid);
    return (doc ?? undefined) as Record<string, unknown> | undefined;
  }
  private _assertOwnedRunner(
    runner: object | undefined,
    registry: WeakMap<object, RunnerRegistration>,
    label: "batch" | "transaction",
  ): RunnerRegistration | undefined {
    if (runner === undefined) return undefined;
    const registration = registry.get(runner);
    if (
      registration === undefined ||
      registration.owner !== this ||
      !registration.active ||
      this._destroyed
    ) {
      throw new Error(
        `${label} routing requires an active runner from this service instance`,
      );
    }
    return registration;
  }

  private _docReaders(
    write: PendingWrite,
    targetResource: Record<string, unknown> | undefined,
  ): Pick<WriteRuleEval, "get" | "getAfter"> {
    const provider = this._provider;
    const cache = new Map<string, Promise<Record<string, unknown> | undefined>>();
    const keyFor = (path: string, id: string): string => JSON.stringify([path, id]);
    const targetKey = keyFor(write.path, write.id);
    cache.set(targetKey, Promise.resolve(targetResource));
    const get: RuleDocReader = (path, id) => {
      const key = keyFor(path, id);
      let read = cache.get(key);
      if (read === undefined) {
        read = provider.getDoc(path, id).then(
          (doc) => (doc ?? undefined) as Record<string, unknown> | undefined,
        );
        cache.set(key, read);
      }
      return read;
    };
    const afterCache = new Map<string, Promise<Record<string, unknown> | undefined>>();
    const getAfter: RuleDocReader = async (path, id) => {
      const key = keyFor(path, id);
      let after = afterCache.get(key);
      if (after === undefined) {
        after = get(path, id).then((resource) =>
          path === write.path && id === write.id
            ? foldPendingWrite(resource, write, this._session)
            : resource,
        );
        afterCache.set(key, after);
      }
      return after;
    };
    return { get, getAfter };
  }

  /** Collection path bound at construction time. */
  get path(): string {
    return this._path;
  }

  /** `true` once `$destroy()` has been called. */
  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Persist a new entity. Generates `_uid` via `uuidProvider` when missing,
   * stamps audit marks via `buildDataForSet`, forwards to the provider,
   * then emits {@link STORAGE_EVENTS.ENTITY_CREATED}.
   *
   * Per F-8: when `opts.batch` or `opts.transaction` is supplied, the
   * mutation is queued onto the runner instead of committing — the wrapping
   * `runBatch` / `runTransaction` user is responsible for the eventual
   * flush. No event fires on the routed path.
   */
  async set(
    entity: SetEntityInput<Meta>,
    opts: MutationRoutingOpts<Meta, UpdateActionTypes> = {},
  ): Promise<{ id: string }> {
    this._assertAlive();
    const { _uid, ...inputRest } = entity as { _uid?: string } & Record<
      string,
      unknown
    >;
    const rest = ownedSnapshot(inputRest);
    const id = _uid ?? this._uuidProvider();
    const batchRegistration = this._assertOwnedRunner(
      opts.batch,
      auditedBatchRunners,
      "batch",
    );
    const txRegistration = this._assertOwnedRunner(
      opts.transaction,
      auditedTxRunners,
      "transaction",
    );
    const data = stampCreate(rest, this._session, id) as Meta["write"];
    Object.freeze(data);
    const pendingWrite: PendingWrite = {
      verb: "create",
      path: this._path,
      id,
      patch: rest,
      persistedData: data as Record<string, unknown>,
    };
    if (this._rules !== undefined && !batchRegistration && !txRegistration) {
      const resource = await this._readResource(id);
      if (resource !== undefined) {
        throw new WriteRuleDenied(
          { path: this._path, id, verb: "create" },
          "row already exists — set() is create-only on a governed table; use update()",
        );
      }
      await assertWriteAllowed(
        this._rules,
        {
          verb: "create",
          path: this._path,
          id,
          session: this._session,
          claims: this._claims,
          action: { type: "create", params: {} },
          affectedKeys: Object.keys(rest),
          patch: rest,
          ...this._docReaders(pendingWrite, resource),
        },
        this._onDenied,
      );
    }
    if (batchRegistration) {
      this._logger.debug("set:batch", { path: this._path });
      batchRegistration.enqueue(pendingWrite);
      return { id };
    }
    if (txRegistration) {
      this._logger.debug("set:tx", { path: this._path });
      txRegistration.enqueue(pendingWrite);
      return { id };
    }
    this._logger.debug("set", { path: this._path, id });
    await this._provider.set(this._path, id, data);
    if (this._destroyed) return { id };
    const payload: StorageEventPayload<Meta> = {
      event: "entity-created",
      path: this._path,
      id,
      data: data as unknown as Meta["read"],
    };
    this.emit(STORAGE_EVENTS.ENTITY_CREATED, payload);
    return { id };
  }

  /**
   * Apply a partial update. Refreshes the `updated_*` audit triplet via
   * `buildDataForUpdate` (optionally recording an `update_action`), forwards
   * to the provider, then emits {@link STORAGE_EVENTS.ENTITY_UPDATED}.
   *
   * Per F-8: when `opts.batch` or `opts.transaction` is supplied, the
   * mutation is queued onto the runner instead of committing immediately.
   */
  async update(
    uid: string,
    partial: Partial<Meta["write"]>,
    opts: {
      readonly action?: UpdateActionTypes;
      readonly params?: Readonly<Record<string, unknown>>;
    } & WriteConcurrencyOpts &
      MutationRoutingOpts<Meta, UpdateActionTypes> = {},
  ): Promise<void> {
    this._assertAlive();
    const txRegistration = this._assertOwnedRunner(
      opts.transaction,
      auditedTxRunners,
      "transaction",
    );
    const batchRegistration = this._assertOwnedRunner(
      opts.batch,
      auditedBatchRunners,
      "batch",
    );
    const expectedVersion = opts.expectedVersion;
    const actionType = opts.action;
    const patch = ownedSnapshot(partial as Record<string, unknown>);
    const params = opts.params === undefined ? undefined : ownedSnapshot(opts.params);
    const action = immutableAction(actionFromOpts(actionType, params));
    const data = stampUpdate(patch, this._session, action) as Partial<Meta["write"]>;
    Object.freeze(data);
    const pendingWrite: PendingWrite = {
      verb: "update",
      path: this._path,
      id: uid,
      patch,
      persistedData: data as Record<string, unknown>,
      ...(action !== undefined ? { action } : {}),
      ...(expectedVersion !== undefined ? { expectedVersion } : {}),
    };
    if (this._rules !== undefined && !txRegistration && !batchRegistration) {
      const resource = await this._readResource(uid);
      await assertWriteAllowed(
        this._rules,
        {
          verb: "update",
          path: this._path,
          id: uid,
          session: this._session,
          claims: this._claims,
          ...(action !== undefined ? { action } : {}),
          affectedKeys: computeAffectedKeys(patch, resource),
          patch,
          ...(resource !== undefined ? { resource } : {}),
          ...(expectedVersion !== undefined ? { expectedVersion } : {}),
          ...this._docReaders(pendingWrite, resource),
        },
        this._onDenied,
      );
    }
    if (batchRegistration) {
      this._logger.debug("update:batch", { path: this._path, id: uid });
      batchRegistration.enqueue(pendingWrite);
      return;
    }
    if (txRegistration) {
      this._logger.debug("update:tx", { path: this._path, id: uid });
      txRegistration.enqueue(pendingWrite);
      return;
    }
    this._logger.debug("update", { path: this._path, id: uid });
    await this._provider.update(this._path, uid, data, {
      ...(expectedVersion !== undefined && { expectedVersion }),
    });
    if (this._destroyed) return;
    const payload: StorageEventPayload<Meta> = {
      event: "entity-updated",
      path: this._path,
      id: uid,
      partial: data,
    };
    this.emit(STORAGE_EVENTS.ENTITY_UPDATED, payload);
  }

  /**
   * Soft-delete: stamps `deleted_*` audit triplet, flips `status` to
   * `'deleted'`, calls `provider.update(...)` (NOT `provider.delete` — the
   * record stays on disk), then emits {@link STORAGE_EVENTS.ENTITY_DELETED}.
   *
   * Counterpart {@link destroy} performs a hard-delete (`provider.delete`).
   *
   * Per F-8: `opts.batch` / `opts.transaction` route the mutation onto a
   * caller-supplied audited runner.
   */
  async delete(
    uid: string,
    opts: {
      readonly action?: UpdateActionTypes;
      readonly params?: Readonly<Record<string, unknown>>;
    } & WriteConcurrencyOpts &
      MutationRoutingOpts<Meta, UpdateActionTypes> = {},
  ): Promise<void> {
    this._assertAlive();
    const txRegistration = this._assertOwnedRunner(opts.transaction, auditedTxRunners, "transaction");
    const batchRegistration = this._assertOwnedRunner(opts.batch, auditedBatchRunners, "batch");
    const expectedVersion = opts.expectedVersion;
    const actionType = opts.action;
    const params = opts.params === undefined ? undefined : ownedSnapshot(opts.params);
    const action = immutableAction(actionFromOpts(actionType, params));
    const data = stampDelete(this._session, action) as Partial<Meta["write"]>;
    Object.freeze(data);
    const pendingWrite: PendingWrite = {
      verb: "delete",
      path: this._path,
      id: uid,
      patch: {},
      persistedData: data as Record<string, unknown>,
      ...(action !== undefined ? { action } : {}),
      ...(expectedVersion !== undefined ? { expectedVersion } : {}),
    };
    if (this._rules !== undefined && !txRegistration && !batchRegistration) {
      const resource = await this._readResource(uid);
      await assertWriteAllowed(
        this._rules,
        {
          verb: "delete",
          path: this._path,
          id: uid,
          session: this._session,
          claims: this._claims,
          action: action ?? { type: "delete", params: params ?? {} },
          affectedKeys: [],
          patch: {},
          ...(resource !== undefined ? { resource } : {}),
          ...(expectedVersion !== undefined ? { expectedVersion } : {}),
          ...this._docReaders(pendingWrite, resource),
        },
        this._onDenied,
      );
    }
    if (batchRegistration) {
      batchRegistration.enqueue(pendingWrite);
      return;
    }
    if (txRegistration) {
      txRegistration.enqueue(pendingWrite);
      return;
    }
    this._logger.debug("delete", { path: this._path, id: uid });
    await this._provider.update(this._path, uid, data, {
      ...(expectedVersion !== undefined && { expectedVersion }),
    });
    if (this._destroyed) return;
    this.emit(STORAGE_EVENTS.ENTITY_DELETED, {
      event: "entity-deleted",
      path: this._path,
      id: uid,
    } satisfies StorageEventPayload<Meta>);
  }

  /**
   * Hard-delete: physically removes the row and emits
   * {@link STORAGE_EVENTS.ENTITY_DESTROYED}. Unlike soft {@link delete},
   * this operation has no audit payload. Hard-destroy routing is unsupported;
   * use an explicit raw provider runner when transactional hard-delete is
   * required.
   */
  async destroy(
    uid: string,
    opts: MutationRoutingOpts<Meta, UpdateActionTypes> = {},
  ): Promise<void> {
    this._assertAlive();
    if (opts.batch !== undefined || opts.transaction !== undefined) {
      throw new Error("destroy() does not support batch or transaction routing");
    }
    const pendingWrite: PendingWrite = {
      verb: "destroy",
      path: this._path,
      id: uid,
      patch: {},
    };
    if (this._rules !== undefined) {
      const resource = await this._readResource(uid);
      await assertWriteAllowed(
        this._rules,
        {
          verb: "destroy",
          path: this._path,
          id: uid,
          session: this._session,
          claims: this._claims,
          affectedKeys: [],
          patch: {},
          ...(resource !== undefined ? { resource } : {}),
          ...this._docReaders(pendingWrite, resource),
        },
        this._onDenied,
      );
    }
    this._logger.debug("destroy", { path: this._path, id: uid });
    await this._provider.delete(this._path, uid);
    if (this._destroyed) return;
    this.emit(STORAGE_EVENTS.ENTITY_DESTROYED, {
      event: "entity-destroyed",
      path: this._path,
      id: uid,
    } satisfies StorageEventPayload<Meta>);
  }

  /**
   * Reverse a soft-delete. Clears the `deleted_*` triplet, flips `status`
   * back to `'created'`, then emits {@link STORAGE_EVENTS.ENTITY_RESTORED}.
   *
   * Per F-8: `opts.batch` / `opts.transaction` route the mutation onto a
   * caller-supplied audited runner.
   */
  async restore(
    uid: string,
    opts: WriteConcurrencyOpts &
      MutationRoutingOpts<Meta, UpdateActionTypes> = {},
  ): Promise<void> {
    this._assertAlive();
    const txRegistration = this._assertOwnedRunner(opts.transaction, auditedTxRunners, "transaction");
    const batchRegistration = this._assertOwnedRunner(opts.batch, auditedBatchRunners, "batch");
    const expectedVersion = opts.expectedVersion;
    const data = stampRestore(this._session) as Partial<Meta["write"]>;
    Object.freeze(data);
    const pendingWrite: PendingWrite = {
      verb: "restore",
      path: this._path,
      id: uid,
      patch: {},
      persistedData: data as Record<string, unknown>,
      ...(expectedVersion !== undefined ? { expectedVersion } : {}),
    };
    if (this._rules !== undefined && !txRegistration && !batchRegistration) {
      const resource = await this._readResource(uid);
      await assertWriteAllowed(
        this._rules,
        {
          verb: "restore",
          path: this._path,
          id: uid,
          session: this._session,
          claims: this._claims,
          action: { type: "restore", params: {} },
          affectedKeys: [],
          patch: {},
          ...(resource !== undefined ? { resource } : {}),
          ...(expectedVersion !== undefined ? { expectedVersion } : {}),
          ...this._docReaders(pendingWrite, resource),
        },
        this._onDenied,
      );
    }
    if (batchRegistration) {
      batchRegistration.enqueue(pendingWrite);
      return;
    }
    if (txRegistration) {
      txRegistration.enqueue(pendingWrite);
      return;
    }
    this._logger.debug("restore", { path: this._path, id: uid });
    await this._provider.update(this._path, uid, data, {
      ...(expectedVersion !== undefined && { expectedVersion }),
    });
    if (this._destroyed) return;
    this.emit(STORAGE_EVENTS.ENTITY_RESTORED, {
      event: "entity-restored",
      path: this._path,
      id: uid,
    } satisfies StorageEventPayload<Meta>);
  }

  /**
   * Upsert helper: if a row with `entity._uid` already exists, calls
   * {@link update} (refreshes the `updated_*` audit triplet, preserves
   * `created_*`); otherwise calls {@link set} (stamps a fresh `created_*`
   * triplet, generates `_uid` only if absent — the caller-supplied `_uid`
   * is honoured).
   *
   * Returns `{ id }` matching the existing or freshly-stamped uid so the
   * caller does not need to branch.
   *
   * **Cost model** (Wave 6.5 / PRD-007): when the underlying provider
   * advertises `capabilities.upsert === true` AND implements `upsertDoc`,
   * this method delegates directly for ONE round-trip — typically
   * `INSERT ... ON CONFLICT (id) DO UPDATE` for SQL backends. When
   * neither flag is set (the default for Sprint 3.5 providers), falls
   * back to the original 2-RTT path (`getDoc → set/update`). Audit
   * stamping is identical between paths because the entity arrives at
   * `provider.upsertDoc` already stamped via the service-level
   * `_assertAlive` + audit pipeline.
   *
   * For high-throughput hot paths prefer running this method **inside
   * a `runInTransaction`** to amortise connection acquisition overhead,
   * OR sidestep it by calling `set` / `update` directly when the caller
   * already knows the row's existence status.
   *
   * **TOCTOU caveat (Wave 12.D-fix FR-021 / EVID-051 L-5):** the 2-RTT
   * fallback (`get → set/update`) races a concurrent insert / update
   * between the read and the write — the same row may be inserted
   * twice (provider rejects on the second `set` with a unique-violation
   * error) OR updated twice (lost-update). Mitigations:
   *   - prefer the native 1-RTT fast path (set
   *     `capabilities.upsert = { supported: true, preservesCreatorAudit: true }`
   *     on the provider)
   *   - wrap callers in `runTransaction({ ... })` when the provider
   *     advertises `capabilities.transactions === true`
   * A fully-transactional fallback is tracked separately (Wave 14 / D2
   * scope per PRD-036).
   */
  async upsert(
    entity: UpsertEntityInput<Meta>,
    opts: MutationRoutingOpts<Meta, UpdateActionTypes> = {},
  ): Promise<{ id: string }> {
    this._assertAlive();
    const snapshot = ownedSnapshot(entity);
    const { _uid, ...rest } = snapshot as { _uid: string } & Record<
      string,
      unknown
    >;
    this._assertOwnedRunner(opts.batch, auditedBatchRunners, "batch");
    this._assertOwnedRunner(opts.transaction, auditedTxRunners, "transaction");
    // Routing opts (batch/transaction) bypass the fast path because the
    // routing primitives still go through `set()`/`update()` semantics
    // at the runner level.
    // Wave 7.2 audit P1-1 — tri-state cap requires BOTH `supported` and
    // `preservesCreatorAudit` for the 1-RTT path; otherwise the
    // creator audit would be silently overwritten on UPDATE, a
    // regression vs. the 2-RTT path's `update()` semantics.
    const upsertCap = this._provider.capabilities.upsert;
    if (
      !opts.batch &&
      !opts.transaction &&
      upsertCap?.supported === true &&
      upsertCap?.preservesCreatorAudit === true &&
      this._provider.upsertDoc
    ) {
      // Write-rules on the 1-RTT path cost the read back — fail-closed
      // trumps round-trips: a rules-governed table cannot let
      // INSERT...ON CONFLICT smuggle a create-vs-update verdict the
      // ruleset never saw.
      const stamped = stampCreate(rest, this._session, _uid) as Meta["write"];
      Object.freeze(stamped);
      const pendingWrite: PendingWrite = {
        verb: "create",
        path: this._path,
        id: _uid,
        patch: rest,
        persistedData: stamped as Record<string, unknown>,
      };
      // Governed native upserts cannot distinguish create from update
      // without a pre-read; existing rows must use update() with an action.
      if (this._rules !== undefined) {
        const resource = (await this._provider.getDoc(
          this._path,
          _uid,
        )) as Record<string, unknown> | null;
        const existing = resource ?? undefined;
        if (existing !== undefined) {
          throw new WriteRuleDenied(
            { path: this._path, id: _uid, verb: "update" },
            "upsert cannot update a governed row — use update() with an update_action",
          );
        }
        await assertWriteAllowed(
          this._rules,
          {
            verb: "create",
            path: this._path,
            id: _uid,
            session: this._session,
            claims: this._claims,
            action: { type: "create", params: {} },
            affectedKeys: Object.keys(rest),
            patch: rest,
            ...this._docReaders(pendingWrite, existing),
          },
          this._onDenied,
        );
      }
      // Same audit stamping as `set()` — `buildDataForSet` populates BOTH
      // create-time (`creator_uuid`, `created_*`) and modify-time
      // (`last_modified_*`) fields. For SQL providers using
      // `INSERT ... ON CONFLICT DO UPDATE`, the provider is responsible
      // for excluding `creator_uuid`/`created_*` from the UPDATE SET-list
      // so existing rows preserve their original creator audit.
      // Wave 6.5: fast path does NOT emit ENTITY_CREATED / ENTITY_UPDATED
      // because we cannot tell insert from update without a pre-read
      // (which would defeat the 1-RTT optimization). Listeners that need
      // create-vs-update discrimination should subscribe via
      // `provider.onDocumentSnapshot` (where supported) or use the slow
      // path by setting `capabilities.upsert = false` on their provider.
      const result = await this._provider.upsertDoc(this._path, _uid, stamped);
      // Wave 12.D-fix FR-021 — re-check after await; the fast path has no
      // emit but the contract still says "destroyed services don't act".
      if (this._destroyed) return { id: _uid };
      return result;
    }
    // Backwards-compat 2-RTT fallback (Sprint 3.5 path).
    const existing = await this.get(_uid);
    // Wave 12.D-fix FR-021 — re-check after await between the two RTTs.
    if (this._destroyed) return { id: _uid };
    if (existing) {
      // Same contract as the 1-RTT path: upsert is create-only on a
      // governed table — `update()` is the honest way to update.
      if (this._rules !== undefined) {
        throw new WriteRuleDenied(
          { path: this._path, id: _uid, verb: "update" },
          "upsert cannot update a governed row — use update() with an update_action",
        );
      }
      await this.update(_uid, rest as Partial<Meta["write"]>, opts);
      return { id: _uid };
    }
    return this.set(snapshot, opts);
  }

  /** Read a single document by id. Delegates to `provider.getDoc`. */
  async get(uid: string): Promise<Meta["read"] | null> {
    this._assertAlive();
    return this._provider.getDoc(this._path, uid);
  }

  /** List documents in the bound collection. Delegates to `provider.getDocs`. */
  async list(query?: Query<Meta>): Promise<Meta["read"][]> {
    this._assertAlive();
    return this._provider.getDocs(this._path, query);
  }

  /** Count documents matching `query`. Delegates to `provider.count`. */
  async count(query?: Query<Meta>): Promise<number> {
    this._assertAlive();
    return this._provider.count(this._path, query);
  }

  /**
   * Subscribe to a single-document snapshot. Throws
   * {@link ListenersNotSupportedError} when the provider reports
   * `capabilities.listeners === false`.
   */
  onDocumentSnapshot(
    uid: string,
    cb: (doc: Meta["read"] | null) => void,
  ): () => void {
    this._assertAlive();
    if (
      !this._provider.capabilities.listeners ||
      !this._provider.onDocumentSnapshot
    ) {
      throw new ListenersNotSupportedError();
    }
    const off = this._provider.onDocumentSnapshot(this._path, uid, cb);
    this._listenerDisposers.add(off);
    return () => {
      this._listenerDisposers.delete(off);
      off();
    };
  }

  /**
   * Subscribe to a collection snapshot. Throws
   * {@link ListenersNotSupportedError} when the provider reports
   * `capabilities.listeners === false`.
   */
  onCollectionSnapshot(
    query: Query<Meta>,
    cb: (docs: Meta["read"][]) => void,
  ): () => void {
    this._assertAlive();
    if (
      !this._provider.capabilities.listeners ||
      !this._provider.onCollectionSnapshot
    ) {
      throw new ListenersNotSupportedError();
    }
    const off = this._provider.onCollectionSnapshot(this._path, query, cb);
    this._listenerDisposers.add(off);
    return () => {
      this._listenerDisposers.delete(off);
      off();
    };
  }

  /**
   * Run `fn` inside a provider transaction with an
   * {@link AuditedTxRunner}. Every `tx.set` / `tx.update` / `tx.delete` /
   * `tx.restore` call applies the same audit marks the single-document
   * methods apply (via `entity-audit` builders) — transactional writes
   * cannot bypass the audit log.
   *
   * Reads (`tx.get`) pass straight through to the provider's snapshot.
   * `tx.delete` is **soft** — the wrapper queues an audit-stamped update
   * with `status: 'deleted'`, NOT a hard `rawTx.delete`. To physically
   * remove a row inside a transaction, drop down to `provider.runTransaction`
   * directly.
   *
   * Errors thrown inside `fn` propagate after aborting the transaction.
   * Adapters with `capabilities.transactions === false` will throw on
   * `provider.runTransaction` (per ADR-005).
   */
  async runTransaction<R>(
    fn: (tx: AuditedTxRunner<Meta, UpdateActionTypes>) => Promise<R>,
  ): Promise<R> {
    this._assertAlive();
    this._logger.debug("runTransaction:enter", { path: this._path });
    try {
      const result = await this._provider.runTransaction(async (rawTx) => {
        const pending: PendingWrite[] = [];
        const callbackState: RunnerCallbackState = { open: true };
        const audited = this._wrapTxRunner(rawTx, pending, callbackState);
        const registration: RunnerRegistration = {
          owner: this,
          active: true,
          enqueue: (write) => this._enqueueTxWrite(rawTx, pending, callbackState, write),
        };
        auditedTxRunners.set(audited, registration);
        try {
          const r = await fn(audited);
          callbackState.open = false;
          registration.active = false;
          auditedTxRunners.delete(audited);
          await this._assertPending(pending);
          return r;
        } finally {
          callbackState.open = false;
          registration.active = false;
          auditedTxRunners.delete(audited);
        }
      });
      this._logger.debug("runTransaction:exit", { path: this._path });
      return result;
    } catch (err) {
      this._logger.error("runTransaction:fail", {
        path: this._path,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Run `fn` inside a provider batch with an {@link AuditedBatchRunner}.
   * Same audit-stamping behaviour as {@link runTransaction}, minus
   * `get` (batches do not read).
   *
   * Adapters with `capabilities.batches === false` will throw on
   * `provider.runBatch` (per ADR-005).
   */
  async runBatch<R>(
    fn: (batch: AuditedBatchRunner<Meta, UpdateActionTypes>) => Promise<R>,
  ): Promise<R> {
    this._assertAlive();
    this._logger.debug("runBatch:enter", { path: this._path });
    try {
      const result = await this._provider.runBatch(async (rawBatch) => {
        const pending: PendingWrite[] = [];
        const callbackState: RunnerCallbackState = { open: true };
        const audited = this._wrapBatchRunner(rawBatch, pending, callbackState);
        const registration: RunnerRegistration = {
          owner: this,
          active: true,
          enqueue: (write) => this._enqueueBatchWrite(rawBatch, pending, callbackState, write),
        };
        auditedBatchRunners.set(audited, registration);
        try {
          const r = await fn(audited);
          callbackState.open = false;
          registration.active = false;
          auditedBatchRunners.delete(audited);
          await this._assertPending(pending);
          return r;
        } finally {
          callbackState.open = false;
          registration.active = false;
          auditedBatchRunners.delete(audited);
        }
      });
      this._logger.debug("runBatch:exit", { path: this._path });
      return result;
    } catch (err) {
      this._logger.error("runBatch:fail", {
        path: this._path,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Post-`fn` rules gate for the audited runners: replays every queued
   * write through {@link assertPendingWrites} against this service's
   * ruleset. No-op when the collection is ungoverned.
   */

  private async _assertPending(
    pending: readonly PendingWrite[],
  ): Promise<void> {
    if (this._rules === undefined) return;
    const rules = this._rules;
    await assertPendingWrites(pending, {
      session: this._session,
      claims: this._claims,
      rulesFor: () => rules,
      resource: async (path, id) =>
        ((await this._provider.getDoc(path, id)) ?? undefined) as
          | Record<string, unknown>
          | undefined,
      ...(this._onDenied !== undefined ? { onDenied: this._onDenied } : {}),
    });
  }
  private _enqueueTxWrite(
    runner: ITransactionRunner<Meta>,
    pending: PendingWrite[],
    state: RunnerCallbackState,
    write: PendingWrite,
  ): void {
    if (!state.open) throw new Error("Audited runner callback has already settled");
    if (write.persistedData === undefined) {
      throw new Error("Routed writes require their exact stamped payload");
    }
    pending.push(write);
    if (write.verb === "create") {
      runner.set(write.path, write.id, write.persistedData as Meta["write"], {
        ...(write.merge !== undefined ? { merge: write.merge } : {}),
      });
    } else {
      runner.update(
        write.path,
        write.id,
        write.persistedData as Partial<Meta["write"]>,
        ...(write.expectedVersion !== undefined
          ? [{ expectedVersion: write.expectedVersion }]
          : []),
      );
    }
  }

  private _enqueueBatchWrite(
    runner: IBatchRunner<Meta>,
    pending: PendingWrite[],
    state: RunnerCallbackState,
    write: PendingWrite,
  ): void {
    if (!state.open) throw new Error("Audited runner callback has already settled");
    if (write.persistedData === undefined) {
      throw new Error("Routed writes require their exact stamped payload");
    }
    pending.push(write);
    if (write.verb === "create") {
      runner.set(write.path, write.id, write.persistedData as Meta["write"], {
        ...(write.merge !== undefined ? { merge: write.merge } : {}),
      });
    } else {
      runner.update(
        write.path,
        write.id,
        write.persistedData as Partial<Meta["write"]>,
        ...(write.expectedVersion !== undefined
          ? [{ expectedVersion: write.expectedVersion }]
          : []),
      );
    }
  }


  /**
   * Audit-stamped tx runner — every write stamps via `write-stamps`
   * AND records a {@link PendingWrite} for the post-`fn` rules gate.
   * `delete` is soft: it queues an audit-stamped `update`, never a raw
   * row removal.
   */
  private _wrapTxRunner(
    rawTx: ITransactionRunner<Meta>,
    pending: PendingWrite[],
    callbackState: RunnerCallbackState,
  ): AuditedTxRunner<Meta, UpdateActionTypes> {
    return {
      get: (uid): Promise<Meta["read"] | null> => rawTx.get(this._path, uid),
      set: (input): { id: string } => {
        if (!callbackState.open) throw new Error("Audited runner callback has already settled");
        const { _uid, ...inputRest } = input as { _uid?: string } & Record<
          string,
          unknown
        >;
        const rest = ownedSnapshot(inputRest);
        const id = _uid ?? this._uuidProvider();
        const data = stampCreate(rest, this._session, id) as Meta["write"];
        Object.freeze(data);
        this._enqueueTxWrite(rawTx, pending, callbackState, {
          verb: "create",
          path: this._path,
          id,
          patch: rest,
          persistedData: data as Record<string, unknown>,
        });
        return { id };
      },
      update: (uid, partial, opts = {}): void => {
        if (!callbackState.open) throw new Error("Audited runner callback has already settled");
        const patch = ownedSnapshot(partial as Record<string, unknown>);
        const params = opts.params === undefined ? undefined : ownedSnapshot(opts.params);
        const action = immutableAction(actionFromOpts(opts.action, params));
        const data = stampUpdate(patch, this._session, action);
        Object.freeze(data);
        this._enqueueTxWrite(rawTx, pending, callbackState, {
          verb: "update",
          path: this._path,
          id: uid,
          patch,
          persistedData: data,
          ...(action !== undefined ? { action } : {}),
          ...(opts.expectedVersion !== undefined ? { expectedVersion: opts.expectedVersion } : {}),
        });
      },
      delete: (uid, opts): void => {
        if (!callbackState.open) throw new Error("Audited runner callback has already settled");
        const params = opts?.params === undefined ? undefined : ownedSnapshot(opts.params);
        const action = immutableAction(actionFromOpts(opts?.action, params));
        const persistedData = stampDelete(this._session, action);
        Object.freeze(persistedData);
        this._enqueueTxWrite(rawTx, pending, callbackState, {
          verb: "delete",
          path: this._path,
          id: uid,
          patch: {},
          persistedData,
          ...(action !== undefined ? { action } : {}),
          ...(opts?.expectedVersion !== undefined ? { expectedVersion: opts.expectedVersion } : {}),
        });
      },
      restore: (uid, opts): void => {
        if (!callbackState.open) throw new Error("Audited runner callback has already settled");
        const persistedData = stampRestore(this._session);
        Object.freeze(persistedData);
        this._enqueueTxWrite(rawTx, pending, callbackState, {
          verb: "restore",
          path: this._path,
          id: uid,
          patch: {},
          persistedData,
          ...(opts?.expectedVersion !== undefined ? { expectedVersion: opts.expectedVersion } : {}),
        });
      },
    };
  }

  /** Batch counterpart of {@link _wrapTxRunner} — same stamping + gate. */
  private _wrapBatchRunner(
    rawBatch: IBatchRunner<Meta>,
    pending: PendingWrite[],
    callbackState: RunnerCallbackState,
  ): AuditedBatchRunner<Meta, UpdateActionTypes> {
    return {
      set: (input): { id: string } => {
        if (!callbackState.open) throw new Error("Audited runner callback has already settled");
        const { _uid, ...inputRest } = input as { _uid?: string } & Record<
          string,
          unknown
        >;
        const rest = ownedSnapshot(inputRest);
        const id = _uid ?? this._uuidProvider();
        const data = stampCreate(rest, this._session, id) as Meta["write"];
        Object.freeze(data);
        this._enqueueBatchWrite(rawBatch, pending, callbackState, {
          verb: "create",
          path: this._path,
          id,
          patch: rest,
          persistedData: data as Record<string, unknown>,
        });
        return { id };
      },
      update: (uid, partial, opts = {}): void => {
        if (!callbackState.open) throw new Error("Audited runner callback has already settled");
        const patch = ownedSnapshot(partial as Record<string, unknown>);
        const params = opts.params === undefined ? undefined : ownedSnapshot(opts.params);
        const action = immutableAction(actionFromOpts(opts.action, params));
        const data = stampUpdate(patch, this._session, action);
        Object.freeze(data);
        this._enqueueBatchWrite(rawBatch, pending, callbackState, {
          verb: "update",
          path: this._path,
          id: uid,
          patch,
          persistedData: data,
          ...(action !== undefined ? { action } : {}),
          ...(opts.expectedVersion !== undefined ? { expectedVersion: opts.expectedVersion } : {}),
        });
      },
      delete: (uid, opts): void => {
        if (!callbackState.open) throw new Error("Audited runner callback has already settled");
        const params = opts?.params === undefined ? undefined : ownedSnapshot(opts.params);
        const action = immutableAction(actionFromOpts(opts?.action, params));
        const persistedData = stampDelete(this._session, action);
        Object.freeze(persistedData);
        this._enqueueBatchWrite(rawBatch, pending, callbackState, {
          verb: "delete",
          path: this._path,
          id: uid,
          patch: {},
          persistedData,
          ...(action !== undefined ? { action } : {}),
          ...(opts?.expectedVersion !== undefined ? { expectedVersion: opts.expectedVersion } : {}),
        });
      },
      restore: (uid, opts): void => {
        if (!callbackState.open) throw new Error("Audited runner callback has already settled");
        const persistedData = stampRestore(this._session);
        Object.freeze(persistedData);
        this._enqueueBatchWrite(rawBatch, pending, callbackState, {
          verb: "restore",
          path: this._path,
          id: uid,
          patch: {},
          persistedData,
          ...(opts?.expectedVersion !== undefined ? { expectedVersion: opts.expectedVersion } : {}),
        });
      },
    };
  }

  /**
   * Tear down the service. Disposes any active listener subscriptions,
   * emits {@link STORAGE_EVENTS.DESTROYED}, and removes all listeners.
   * Idempotent — only the first call has any effect.
   */
  $destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const off of this._listenerDisposers) {
      try {
        off();
      } catch {
        // Swallow — teardown must complete.
      }
    }
    this._listenerDisposers.clear();
    this.emit(STORAGE_EVENTS.DESTROYED);
    this.removeAllListeners();
  }

  private _assertAlive(): void {
    if (this._destroyed) {
      throw new Error("BaseEntityStorageService has been destroyed");
    }
  }
}
