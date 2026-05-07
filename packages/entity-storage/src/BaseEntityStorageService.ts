// SPDX-License-Identifier: Apache-2.0
// Originally inspired by Orchestra orchlab/storage/src/service/EntityStorageService.ts
// (Apache 2.0). The Firelord / Orchestra-DI / Firestore couplings are
// stripped per ADR-005 Decision B: provider + session injected via the
// constructor (no DI container lookup), `_collectionPath` is a single
// string `path` (no nested-collection tuple), and audit-builders come from
// `@gertsai/entity-audit` rather than `@orchlab/core`.
import { EventEmitter } from 'events';

import {
  buildDataForDelete,
  buildDataForRestore,
  buildDataForSet,
  buildDataForUpdate,
} from '@gertsai/entity-audit';
import type { Session } from '@gertsai/session';
import type { IDestroyable } from '@gertsai/di';

import { STORAGE_EVENTS } from './STORAGE_EVENTS';
import type {
  IBatchRunner,
  IStorageProvider,
  ITransactionRunner,
  Query,
  StorageLogger,
  StorageMetadata,
} from '@gertsai/storage-core';
import { ListenersNotSupportedError, noopStorageLogger } from '@gertsai/storage-core';
import type {
  AuditedBatchRunner,
  AuditedTxRunner,
} from './AuditedRunners';

/**
 * Optional per-method routing knob accepted by `set` / `update` / `delete` /
 * `restore` / `destroy`. When `batch` is set the mutation is queued onto the
 * caller-supplied {@link AuditedBatchRunner} (the caller's wrapping
 * `runBatch` then commits). When `transaction` is set, the mutation is
 * queued onto the caller-supplied {@link AuditedTxRunner}. When both are
 * absent the call commits immediately and emits the matching event —
 * current behaviour preserved.
 *
 * Per SPEC-008 audit fix F-8: parity with Orchestra's per-method
 * `batch?` / `transaction?` overload, distinct from the `runTransaction(fn)` /
 * `runBatch(fn)` wrappers (W-2). Useful when callers compose several
 * services into one transactional flow without hard-wiring routing inside
 * each service.
 *
 * **Emit semantics**: when routed onto a batch / transaction the service
 * SKIPS its synchronous emit — events fire only on the eventual flush of
 * the wrapping `runBatch` / `runTransaction` call. The batch/tx user is
 * responsible for emitting (or not) on commit.
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
}

/**
 * Payload accepted by {@link BaseEntityStorageService.set}. The class
 * generates `_uid` via `uuidProvider` when absent, then forwards the merged
 * object (with audit marks) to the provider's `set(path, id, data)`.
 */
export type SetEntityInput<Meta extends StorageMetadata> = Meta['write'] & {
  readonly _uid?: string;
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
      readonly event: 'entity-created';
      readonly path: string;
      readonly id: string;
      readonly data: Meta['read'];
    }
  | {
      readonly event: 'entity-updated';
      readonly path: string;
      readonly id: string;
      readonly partial: Partial<Meta['write']>;
    }
  | {
      readonly event: 'entity-deleted';
      readonly path: string;
      readonly id: string;
    }
  | {
      readonly event: 'entity-restored';
      readonly path: string;
      readonly id: string;
    }
  | {
      readonly event: 'entity-destroyed';
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
  protected readonly _listenerDisposers = new Set<() => void>();
  protected _destroyed = false;

  constructor(opts: BaseEntityStorageServiceOpts<Meta>) {
    super();
    this._provider = opts.provider;
    this._session = opts.session;
    this._path = opts.path ?? '';
    this._logger = opts.logger ?? noopStorageLogger;
    this._uuidProvider =
      opts.uuidProvider ??
      ((): string => {
        // Use Node 22 globalThis crypto first (preferred); fall back to
        // require('crypto') only when global is missing.
        const g = globalThis as { crypto?: { randomUUID?: () => string } };
        if (g.crypto?.randomUUID) return g.crypto.randomUUID();
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const nodeCrypto: { randomUUID: () => string } = require('crypto');
        return nodeCrypto.randomUUID();
      });
  }

  /** Provider capabilities (passthrough for consumer decision logic). */
  get capabilities(): IStorageProvider<Meta>['capabilities'] {
    return this._provider.capabilities;
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
    if (opts.batch) {
      this._logger.debug('set:batch', { path: this._path });
      return opts.batch.set(entity);
    }
    if (opts.transaction) {
      this._logger.debug('set:tx', { path: this._path });
      return opts.transaction.set(entity);
    }
    const { _uid, ...rest } = entity as { _uid?: string } & Record<
      string,
      unknown
    >;
    const id = _uid ?? this._uuidProvider();
    this._logger.debug('set', { path: this._path, id });
    const stamped = buildDataForSet(rest as object, this._session, {
      _uid: id,
    });
    const data = stamped as unknown as Meta['write'];
    await this._provider.set(this._path, id, data);
    const payload: StorageEventPayload<Meta> = {
      event: 'entity-created',
      path: this._path,
      id,
      data: data as unknown as Meta['read'],
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
    partial: Partial<Meta['write']>,
    opts: {
      readonly action?: UpdateActionTypes;
      readonly params?: Readonly<Record<string, unknown>>;
    } & MutationRoutingOpts<Meta, UpdateActionTypes> = {},
  ): Promise<void> {
    this._assertAlive();
    const actionOpts =
      opts.action !== undefined
        ? { action: opts.action, params: opts.params }
        : undefined;
    if (opts.batch) {
      this._logger.debug('update:batch', { path: this._path, id: uid });
      opts.batch.update(uid, partial, actionOpts);
      return;
    }
    if (opts.transaction) {
      this._logger.debug('update:tx', { path: this._path, id: uid });
      opts.transaction.update(uid, partial, actionOpts);
      return;
    }
    this._logger.debug('update', { path: this._path, id: uid });
    const stamped = buildDataForUpdate<object, UpdateActionTypes>(
      partial as Partial<object>,
      this._session,
      opts.action !== undefined
        ? { action: { type: opts.action, params: opts.params ?? {} } }
        : {},
    );
    const data = stamped as unknown as Partial<Meta['write']>;
    await this._provider.update(this._path, uid, data);
    const payload: StorageEventPayload<Meta> = {
      event: 'entity-updated',
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
    opts: MutationRoutingOpts<Meta, UpdateActionTypes> = {},
  ): Promise<void> {
    this._assertAlive();
    if (opts.batch) {
      this._logger.debug('delete:batch', { path: this._path, id: uid });
      opts.batch.delete(uid);
      return;
    }
    if (opts.transaction) {
      this._logger.debug('delete:tx', { path: this._path, id: uid });
      opts.transaction.delete(uid);
      return;
    }
    this._logger.debug('delete', { path: this._path, id: uid });
    const data = buildDataForDelete(this._session) as unknown as Partial<
      Meta['write']
    >;
    await this._provider.update(this._path, uid, data);
    const payload: StorageEventPayload<Meta> = {
      event: 'entity-deleted',
      path: this._path,
      id: uid,
    };
    this.emit(STORAGE_EVENTS.ENTITY_DELETED, payload);
  }

  /**
   * Hard-delete: physically removes the row via `provider.delete(path, uid)`,
   * then emits {@link STORAGE_EVENTS.ENTITY_DESTROYED}. Distinct from
   * {@link delete} (soft) — there is no audit trail because the row is gone.
   *
   * Per F-8: `opts.batch` / `opts.transaction` are accepted for symmetry,
   * but the audited-runner shapes don't expose `destroy` (they queue
   * soft-deletes only). When routed, this method delegates to the raw
   * `provider.delete` via the runner's underlying queue. **TODO** — not
   * currently exposed on `AuditedTxRunner` / `AuditedBatchRunner`; the
   * routed branches throw `Error('destroy via batch/transaction not
   * supported — use the raw provider runner')`. Direct (non-routed) calls
   * are fully supported.
   *
   * Per SPEC-008 audit fix F-7.
   */
  async destroy(
    uid: string,
    opts: MutationRoutingOpts<Meta, UpdateActionTypes> = {},
  ): Promise<void> {
    this._assertAlive();
    if (opts.batch || opts.transaction) {
      throw new Error(
        'destroy via batch/transaction not supported — drop down to provider.runBatch / provider.runTransaction and call the raw runner.delete()',
      );
    }
    this._logger.debug('destroy', { path: this._path, id: uid });
    await this._provider.delete(this._path, uid);
    const payload: StorageEventPayload<Meta> = {
      event: 'entity-destroyed',
      path: this._path,
      id: uid,
    };
    this.emit(STORAGE_EVENTS.ENTITY_DESTROYED, payload);
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
    opts: MutationRoutingOpts<Meta, UpdateActionTypes> = {},
  ): Promise<void> {
    this._assertAlive();
    if (opts.batch) {
      this._logger.debug('restore:batch', { path: this._path, id: uid });
      opts.batch.restore(uid);
      return;
    }
    if (opts.transaction) {
      this._logger.debug('restore:tx', { path: this._path, id: uid });
      opts.transaction.restore(uid);
      return;
    }
    this._logger.debug('restore', { path: this._path, id: uid });
    const data = buildDataForRestore(this._session) as unknown as Partial<
      Meta['write']
    >;
    await this._provider.update(this._path, uid, data);
    const payload: StorageEventPayload<Meta> = {
      event: 'entity-restored',
      path: this._path,
      id: uid,
    };
    this.emit(STORAGE_EVENTS.ENTITY_RESTORED, payload);
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
   */
  async upsert(
    entity: SetEntityInput<Meta> & { readonly _uid: string },
    opts: MutationRoutingOpts<Meta, UpdateActionTypes> = {},
  ): Promise<{ id: string }> {
    this._assertAlive();
    // Wave 6.5 fast path — provider has native 1-RTT upsert.
    // Routing opts (batch/transaction) bypass the fast path because the
    // routing primitives still go through `set()`/`update()` semantics
    // at the runner level.
    if (
      !opts.batch &&
      !opts.transaction &&
      this._provider.capabilities.upsert === true &&
      this._provider.upsertDoc
    ) {
      const { _uid, ...rest } = entity as { _uid: string } & Record<
        string,
        unknown
      >;
      // Same audit stamping as `set()` — `buildDataForSet` populates BOTH
      // create-time (`creator_uuid`, `created_*`) and modify-time
      // (`last_modified_*`) fields. For SQL providers using
      // `INSERT ... ON CONFLICT DO UPDATE`, the provider is responsible
      // for excluding `creator_uuid`/`created_*` from the UPDATE SET-list
      // so existing rows preserve their original creator audit.
      const stamped = buildDataForSet(rest as object, this._session, {
        _uid,
      }) as unknown as Meta['write'];
      // Wave 6.5: fast path does NOT emit ENTITY_CREATED / ENTITY_UPDATED
      // because we cannot tell insert from update without a pre-read
      // (which would defeat the 1-RTT optimization). Listeners that need
      // create-vs-update discrimination should subscribe via
      // `provider.onDocumentSnapshot` (where supported) or use the slow
      // path by setting `capabilities.upsert = false` on their provider.
      return this._provider.upsertDoc(this._path, _uid, stamped);
    }
    // Backwards-compat 2-RTT fallback (Sprint 3.5 path).
    const existing = await this.get(entity._uid);
    if (existing) {
      const { _uid, ...rest } = entity as { _uid: string } & Record<
        string,
        unknown
      >;
      await this.update(_uid, rest as Partial<Meta['write']>, opts);
      return { id: _uid };
    }
    return this.set(entity, opts);
  }

  /** Read a single document by id. Delegates to `provider.getDoc`. */
  async get(uid: string): Promise<Meta['read'] | null> {
    this._assertAlive();
    return this._provider.getDoc(this._path, uid);
  }

  /** List documents in the bound collection. Delegates to `provider.getDocs`. */
  async list(query?: Query<Meta>): Promise<Meta['read'][]> {
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
    cb: (doc: Meta['read'] | null) => void,
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
    cb: (docs: Meta['read'][]) => void,
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
    this._logger.debug('runTransaction:enter', { path: this._path });
    try {
      const result = await this._provider.runTransaction(async (rawTx) => {
        const audited = this._wrapTxRunner(rawTx);
        return fn(audited);
      });
      this._logger.debug('runTransaction:exit', { path: this._path });
      return result;
    } catch (err) {
      this._logger.error('runTransaction:fail', {
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
    this._logger.debug('runBatch:enter', { path: this._path });
    try {
      const result = await this._provider.runBatch(async (rawBatch) => {
        const audited = this._wrapBatchRunner(rawBatch);
        return fn(audited);
      });
      this._logger.debug('runBatch:exit', { path: this._path });
      return result;
    } catch (err) {
      this._logger.error('runBatch:fail', {
        path: this._path,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private _wrapTxRunner(
    rawTx: ITransactionRunner<Meta>,
  ): AuditedTxRunner<Meta, UpdateActionTypes> {
    return {
      get: (uid): Promise<Meta['read'] | null> =>
        rawTx.get(this._path, uid),
      set: (input): { id: string } => {
        const { _uid, ...rest } = input as { _uid?: string } & Record<
          string,
          unknown
        >;
        const id = _uid ?? this._uuidProvider();
        const stamped = buildDataForSet(rest as object, this._session, {
          _uid: id,
        });
        rawTx.set(this._path, id, stamped as unknown as Meta['write']);
        return { id };
      },
      update: (uid, partial, opts = {}): void => {
        const stamped = buildDataForUpdate<object, UpdateActionTypes>(
          partial as Partial<object>,
          this._session,
          opts.action !== undefined
            ? { action: { type: opts.action, params: opts.params ?? {} } }
            : {},
        );
        rawTx.update(
          this._path,
          uid,
          stamped as unknown as Partial<Meta['write']>,
        );
      },
      delete: (uid, opts): void => {
        const deleteMarks = buildDataForDelete(this._session);
        // Soft-delete: queue `update`, NOT `delete`. When caller passes
        // an `action`, append it to the canonical `delete` audit entry.
        if (opts?.action !== undefined) {
          const withAction = {
            ...deleteMarks,
            update_action: {
              type: opts.action,
              params: opts.params ?? {},
              timestamp: deleteMarks.update_action.timestamp,
            },
          };
          rawTx.update(
            this._path,
            uid,
            withAction as unknown as Partial<Meta['write']>,
          );
          return;
        }
        rawTx.update(
          this._path,
          uid,
          deleteMarks as unknown as Partial<Meta['write']>,
        );
      },
      restore: (uid): void => {
        const stamped = buildDataForRestore(this._session);
        rawTx.update(
          this._path,
          uid,
          stamped as unknown as Partial<Meta['write']>,
        );
      },
    };
  }

  private _wrapBatchRunner(
    rawBatch: IBatchRunner<Meta>,
  ): AuditedBatchRunner<Meta, UpdateActionTypes> {
    return {
      set: (input): { id: string } => {
        const { _uid, ...rest } = input as { _uid?: string } & Record<
          string,
          unknown
        >;
        const id = _uid ?? this._uuidProvider();
        const stamped = buildDataForSet(rest as object, this._session, {
          _uid: id,
        });
        rawBatch.set(this._path, id, stamped as unknown as Meta['write']);
        return { id };
      },
      update: (uid, partial, opts = {}): void => {
        const stamped = buildDataForUpdate<object, UpdateActionTypes>(
          partial as Partial<object>,
          this._session,
          opts.action !== undefined
            ? { action: { type: opts.action, params: opts.params ?? {} } }
            : {},
        );
        rawBatch.update(
          this._path,
          uid,
          stamped as unknown as Partial<Meta['write']>,
        );
      },
      delete: (uid, opts): void => {
        const deleteMarks = buildDataForDelete(this._session);
        if (opts?.action !== undefined) {
          const withAction = {
            ...deleteMarks,
            update_action: {
              type: opts.action,
              params: opts.params ?? {},
              timestamp: deleteMarks.update_action.timestamp,
            },
          };
          rawBatch.update(
            this._path,
            uid,
            withAction as unknown as Partial<Meta['write']>,
          );
          return;
        }
        rawBatch.update(
          this._path,
          uid,
          deleteMarks as unknown as Partial<Meta['write']>,
        );
      },
      restore: (uid): void => {
        const stamped = buildDataForRestore(this._session);
        rawBatch.update(
          this._path,
          uid,
          stamped as unknown as Partial<Meta['write']>,
        );
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
      throw new Error('BaseEntityStorageService has been destroyed');
    }
  }
}
