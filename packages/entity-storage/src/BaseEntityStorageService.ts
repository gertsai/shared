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
  IStorageProvider,
  Query,
  StorageMetadata,
} from '@gertsai/storage-core';
import { ListenersNotSupportedError } from '@gertsai/storage-core';

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
 * Generic payload shape emitted with every `entity-*` event. Listeners
 * receive the `path`, the document `id`, and the storage `data`.
 */
export interface StorageEventPayload<Meta extends StorageMetadata> {
  readonly path: string;
  readonly id: string;
  readonly data: Meta['read'];
}

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
  protected readonly _listenerDisposers = new Set<() => void>();
  protected _destroyed = false;

  constructor(opts: BaseEntityStorageServiceOpts<Meta>) {
    super();
    this._provider = opts.provider;
    this._session = opts.session;
    this._path = opts.path ?? '';
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
   */
  async set(entity: SetEntityInput<Meta>): Promise<{ id: string }> {
    this._assertAlive();
    const { _uid, ...rest } = entity as { _uid?: string } & Record<
      string,
      unknown
    >;
    const id = _uid ?? this._uuidProvider();
    const stamped = buildDataForSet(rest as object, this._session, {
      _uid: id,
    });
    const data = stamped as unknown as Meta['write'];
    await this._provider.set(this._path, id, data);
    this.emit(STORAGE_EVENTS.ENTITY_CREATED, {
      path: this._path,
      id,
      data: data as unknown as Meta['read'],
    });
    return { id };
  }

  /**
   * Apply a partial update. Refreshes the `updated_*` audit triplet via
   * `buildDataForUpdate` (optionally recording an `update_action`), forwards
   * to the provider, then emits {@link STORAGE_EVENTS.ENTITY_UPDATED}.
   */
  async update(
    uid: string,
    partial: Partial<Meta['write']>,
    opts: {
      readonly action?: UpdateActionTypes;
      readonly params?: Readonly<Record<string, unknown>>;
    } = {},
  ): Promise<void> {
    this._assertAlive();
    const stamped = buildDataForUpdate<object, UpdateActionTypes>(
      partial as Partial<object>,
      this._session,
      opts.action !== undefined
        ? { action: { type: opts.action, params: opts.params ?? {} } }
        : {},
    );
    const data = stamped as unknown as Partial<Meta['write']>;
    await this._provider.update(this._path, uid, data);
    this.emit(STORAGE_EVENTS.ENTITY_UPDATED, {
      path: this._path,
      id: uid,
      data: data as unknown as Meta['read'],
    });
  }

  /**
   * Soft-delete: stamps `deleted_*` audit triplet, flips `status` to
   * `'deleted'`, calls `provider.update(...)` (NOT `provider.delete` — the
   * record stays on disk), then emits {@link STORAGE_EVENTS.ENTITY_DELETED}.
   */
  async delete(uid: string): Promise<void> {
    this._assertAlive();
    const data = buildDataForDelete(this._session) as unknown as Partial<
      Meta['write']
    >;
    await this._provider.update(this._path, uid, data);
    this.emit(STORAGE_EVENTS.ENTITY_DELETED, {
      path: this._path,
      id: uid,
      data: data as unknown as Meta['read'],
    });
  }

  /**
   * Reverse a soft-delete. Clears the `deleted_*` triplet, flips `status`
   * back to `'created'`, then emits {@link STORAGE_EVENTS.ENTITY_RESTORED}.
   */
  async restore(uid: string): Promise<void> {
    this._assertAlive();
    const data = buildDataForRestore(this._session) as unknown as Partial<
      Meta['write']
    >;
    await this._provider.update(this._path, uid, data);
    this.emit(STORAGE_EVENTS.ENTITY_RESTORED, {
      path: this._path,
      id: uid,
      data: data as unknown as Meta['read'],
    });
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
