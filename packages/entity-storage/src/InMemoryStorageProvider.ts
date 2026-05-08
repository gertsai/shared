// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Map-backed in-memory implementation of {@link IStorageProvider}.
 *
 * Intended use: unit-test fixture for any consumer of `IStorageProvider`.
 * Supports the full feature set (listeners + transactions + batches) so
 * tests do not have to mock individual capability flags.
 *
 * Per audit fix F-A-1 + F-T-3: capabilities are declared via
 * `as const satisfies StorageCapabilities` so `capabilities.listeners`
 * narrows to `true` at the type level.
 *
 * **Semantic notes** (consumers should be aware of):
 *
 * - **Listeners fire synchronously** on the same tick as the mutating
 *   call. Real backends emit asynchronously; consumers that depend on
 *   ordering between mutation and observer should not encode it.
 * - **Transactions track a `_version` counter** per (path, id). A
 *   read-during-tx records the observed version; commit re-reads the
 *   current version and throws `TransactionConflictError` on mismatch.
 *   This mirrors Firestore optimistic-concurrency semantics.
 * - **Batches are atomic via clone-on-throw**: the mutation log is
 *   applied to a snapshot copy first; on success the live map swaps to
 *   the snapshot. On throw the live map is untouched.
 */
import type {
  IBatchRunner,
  IStorageProvider,
  ITransactionRunner,
  Query,
  StorageCapabilities,
  StorageMetadata,
} from '@gertsai/storage-core';
import { TransactionConflictError } from '@gertsai/storage-core';
import { applyQueryFilter } from './applyQueryFilter';

interface VersionedDoc {
  readonly version: number;
  readonly data: unknown;
}

type DocListener<Meta extends StorageMetadata> = (
  doc: Meta['read'] | null,
) => void;
type CollectionListener<Meta extends StorageMetadata> = (
  docs: Meta['read'][],
) => void;

interface CollectionListenerEntry<Meta extends StorageMetadata> {
  readonly query: Query<Meta>;
  readonly cb: CollectionListener<Meta>;
}

/**
 * Test-only storage provider. Stores data in a `Map<path, Map<id, doc>>`
 * structure; full listener / batch / transaction support.
 */
export class InMemoryStorageProvider<
  Meta extends StorageMetadata = StorageMetadata,
> implements IStorageProvider<Meta>
{
  /** Per audit fix F-A-1 + F-T-3 — `as const satisfies` narrows literally. */
  readonly capabilities = {
    listeners: true,
    transactions: true,
    batches: true,
  } as const satisfies StorageCapabilities;

  private readonly _store = new Map<string, Map<string, VersionedDoc>>();
  private readonly _docListeners = new Map<
    string,
    Map<string, Set<DocListener<Meta>>>
  >();
  private readonly _collListeners = new Map<
    string,
    Set<CollectionListenerEntry<Meta>>
  >();

  // ───────────────────────── Helpers ─────────────────────────

  private _coll(path: string): Map<string, VersionedDoc> {
    let m = this._store.get(path);
    if (!m) {
      m = new Map();
      this._store.set(path, m);
    }
    return m;
  }

  private _emitDoc(path: string, id: string): void {
    const byPath = this._docListeners.get(path);
    if (!byPath) return;
    const set = byPath.get(id);
    if (!set || set.size === 0) return;
    const doc = this._coll(path).get(id);
    const data = (doc?.data ?? null) as Meta['read'] | null;
    for (const cb of set) {
      try {
        cb(data);
      } catch {
        // Listener errors must not abort the mutation cascade.
      }
    }
  }

  private _emitColl(path: string): void {
    const set = this._collListeners.get(path);
    if (!set || set.size === 0) return;
    const allDocs = Array.from(this._coll(path).values()).map(
      (d) => d.data,
    ) as Meta['read'][];
    for (const { query, cb } of set) {
      const docs =
        query.length === 0 ? allDocs : applyQueryFilter<Meta>(allDocs, query);
      try {
        cb(docs);
      } catch {
        // Same as _emitDoc — never crash the mutator.
      }
    }
  }

  private _writeOnto(
    coll: Map<string, VersionedDoc>,
    id: string,
    data: unknown,
  ): VersionedDoc {
    const prev = coll.get(id);
    const versioned: VersionedDoc = {
      version: (prev?.version ?? 0) + 1,
      data,
    };
    coll.set(id, versioned);
    return versioned;
  }

  private _updateOnto(
    coll: Map<string, VersionedDoc>,
    id: string,
    partial: Record<string, unknown>,
  ): VersionedDoc {
    const prev = coll.get(id);
    const merged = {
      ...(prev?.data as Record<string, unknown> | undefined),
      ...partial,
    };
    const versioned: VersionedDoc = {
      version: (prev?.version ?? 0) + 1,
      data: merged,
    };
    coll.set(id, versioned);
    return versioned;
  }

  // ─────────────────── IStorageProvider — CRUD ───────────────────

  async set(path: string, id: string, data: Meta['write']): Promise<void> {
    this._writeOnto(this._coll(path), id, data);
    this._emitDoc(path, id);
    this._emitColl(path);
  }

  async update(
    path: string,
    id: string,
    partial: Partial<Meta['write']>,
  ): Promise<void> {
    this._updateOnto(
      this._coll(path),
      id,
      partial as Record<string, unknown>,
    );
    this._emitDoc(path, id);
    this._emitColl(path);
  }

  async delete(path: string, id: string): Promise<void> {
    const coll = this._coll(path);
    if (coll.delete(id)) {
      this._emitDoc(path, id);
      this._emitColl(path);
    }
  }

  async getDoc(path: string, id: string): Promise<Meta['read'] | null> {
    const doc = this._coll(path).get(id);
    return (doc?.data ?? null) as Meta['read'] | null;
  }

  async getDocs(
    path: string,
    query?: Query<Meta>,
  ): Promise<Meta['read'][]> {
    const docs = Array.from(this._coll(path).values()).map(
      (d) => d.data,
    ) as Meta['read'][];
    return applyQueryFilter<Meta>(docs, query);
  }

  async count(path: string, query?: Query<Meta>): Promise<number> {
    if (!query || query.length === 0) {
      return this._coll(path).size;
    }
    const docs = Array.from(this._coll(path).values()).map(
      (d) => d.data,
    ) as Meta['read'][];
    return applyQueryFilter<Meta>(docs, query).length;
  }

  // ─────────────────── IStorageProvider — Listeners ───────────────────

  onDocumentSnapshot(
    path: string,
    id: string,
    cb: DocListener<Meta>,
  ): () => void {
    let byPath = this._docListeners.get(path);
    if (!byPath) {
      byPath = new Map();
      this._docListeners.set(path, byPath);
    }
    let set = byPath.get(id);
    if (!set) {
      set = new Set();
      byPath.set(id, set);
    }
    set.add(cb);
    // Fire initial value synchronously, mirroring Firestore semantics.
    const initial = this._coll(path).get(id);
    cb((initial?.data ?? null) as Meta['read'] | null);
    return () => {
      const inner = this._docListeners.get(path)?.get(id);
      if (inner) {
        inner.delete(cb);
        if (inner.size === 0) {
          this._docListeners.get(path)?.delete(id);
        }
      }
    };
  }

  onCollectionSnapshot(
    path: string,
    query: Query<Meta>,
    cb: CollectionListener<Meta>,
  ): () => void {
    let set = this._collListeners.get(path);
    if (!set) {
      set = new Set();
      this._collListeners.set(path, set);
    }
    const entry: CollectionListenerEntry<Meta> = { query, cb };
    set.add(entry);
    const allDocs = Array.from(this._coll(path).values()).map(
      (d) => d.data,
    ) as Meta['read'][];
    const docs =
      query.length === 0 ? allDocs : applyQueryFilter<Meta>(allDocs, query);
    cb(docs);
    return () => {
      this._collListeners.get(path)?.delete(entry);
    };
  }

  // ─────────────────── IStorageProvider — Batches ───────────────────

  async runBatch<R>(fn: (batch: IBatchRunner<Meta>) => Promise<R>): Promise<R> {
    // Snapshot of every collection touched (deep map copy of the inner map).
    const snapshots = new Map<string, Map<string, VersionedDoc>>();
    const ensureSnap = (path: string): Map<string, VersionedDoc> => {
      let s = snapshots.get(path);
      if (!s) {
        s = new Map(this._coll(path));
        snapshots.set(path, s);
      }
      return s;
    };
    const touched = new Set<string>(); // `${path}::${id}`
    const touchedColls = new Set<string>();
    const runner: IBatchRunner<Meta> = {
      set: (path, id, data): void => {
        this._writeOnto(ensureSnap(path), id, data);
        touched.add(`${path}::${id}`);
        touchedColls.add(path);
      },
      update: (path, id, partial): void => {
        this._updateOnto(
          ensureSnap(path),
          id,
          partial as Record<string, unknown>,
        );
        touched.add(`${path}::${id}`);
        touchedColls.add(path);
      },
      delete: (path, id): void => {
        ensureSnap(path).delete(id);
        touched.add(`${path}::${id}`);
        touchedColls.add(path);
      },
    };
    const result = await fn(runner);
    // Commit: swap snapshots into the live store atomically.
    for (const [path, snap] of snapshots) {
      this._store.set(path, snap);
    }
    // Emit listeners after commit succeeds.
    for (const key of touched) {
      const sep = key.indexOf('::');
      const path = key.slice(0, sep);
      const id = key.slice(sep + 2);
      this._emitDoc(path, id);
    }
    for (const path of touchedColls) {
      this._emitColl(path);
    }
    return result;
  }

  // ─────────────────── IStorageProvider — Transactions ───────────────────

  async runTransaction<R>(
    fn: (tx: ITransactionRunner<Meta>) => Promise<R>,
  ): Promise<R> {
    const reads = new Map<string, number | null>(); // version observed (null = absent)
    const snapshots = new Map<string, Map<string, VersionedDoc>>();
    const ensureSnap = (path: string): Map<string, VersionedDoc> => {
      let s = snapshots.get(path);
      if (!s) {
        s = new Map(this._coll(path));
        snapshots.set(path, s);
      }
      return s;
    };
    const touched = new Set<string>();
    const touchedColls = new Set<string>();
    const runner: ITransactionRunner<Meta> = {
      get: async (path, id): Promise<Meta['read'] | null> => {
        const snap = ensureSnap(path);
        const doc = snap.get(id);
        const key = `${path}::${id}`;
        if (!reads.has(key)) {
          reads.set(key, doc ? doc.version : null);
        }
        return (doc?.data ?? null) as Meta['read'] | null;
      },
      set: (path, id, data): void => {
        this._writeOnto(ensureSnap(path), id, data);
        touched.add(`${path}::${id}`);
        touchedColls.add(path);
      },
      update: (path, id, partial): void => {
        this._updateOnto(
          ensureSnap(path),
          id,
          partial as Record<string, unknown>,
        );
        touched.add(`${path}::${id}`);
        touchedColls.add(path);
      },
      delete: (path, id): void => {
        ensureSnap(path).delete(id);
        touched.add(`${path}::${id}`);
        touchedColls.add(path);
      },
    };
    const result = await fn(runner);
    // Validate read-set: re-check current versions in the live store.
    for (const [key, expected] of reads) {
      const sep = key.indexOf('::');
      const path = key.slice(0, sep);
      const id = key.slice(sep + 2);
      const current = this._coll(path).get(id);
      const currentVersion = current ? current.version : null;
      if (currentVersion !== expected) {
        throw new TransactionConflictError(
          `Concurrent mutation detected on ${path}/${id} (expected version ${String(
            expected,
          )}, got ${String(currentVersion)})`,
        );
      }
    }
    // Commit: swap snapshots into the live store.
    for (const [path, snap] of snapshots) {
      this._store.set(path, snap);
    }
    for (const key of touched) {
      const sep = key.indexOf('::');
      const path = key.slice(0, sep);
      const id = key.slice(sep + 2);
      this._emitDoc(path, id);
    }
    for (const path of touchedColls) {
      this._emitColl(path);
    }
    return result;
  }
}
