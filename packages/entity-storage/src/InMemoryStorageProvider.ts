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
 *
 *   **Concurrency caveat (Wave 21 / EVID-076 FR-X1 closure).** Prior to
 *   Wave 21 the runner tracked only `tx.get()`-observed versions; blind
 *   writes (writes never preceded by a `tx.get()` of the same key) were
 *   NOT version-checked, and commit replaced the whole collection map
 *   with the transaction's snapshot — silently clobbering concurrent
 *   commits. The current implementation closes both holes:
 *
 *     1. Every write (`set` / `update` / `delete`) implicitly snapshots
 *        the doc's pre-mutation version on the first queue operation
 *        for that `(path, id)`. The recorded version is included in
 *        the conflict-check phase alongside reads.
 *     2. Commit performs a **per-key merge** into the live store
 *        rather than swapping the whole collection map. Concurrent
 *        transactions that touch disjoint keys no longer clobber each
 *        other.
 *
 *   The InMemory fixture now mirrors PG MVCC semantics: blind writes
 *   that race a concurrent mutation throw {@link TransactionConflictError}.
 * - **Batches use per-key merge + write-set conflict checks** identical
 *   to transactions (Wave 21 / EVID-076 FR-X1). The pre-batch version
 *   of every written key is snapshotted at queue time; on commit, the
 *   live versions are re-verified before the deltas are applied. A
 *   concurrent batch / single-doc write that bumped the version
 *   throws.
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
import { AUDIT_FIELDS } from '@gertsai/entity-audit';
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
  /**
   * Wave 6.5 / PRD-007 + Wave 7.2 audit P1-1 — audit-aware upsert opt-in.
   *
   * `upsertDoc()` below pre-checks `Map.has(id)` (zero RTT cost — Map
   * is local) to decide whether to apply create-time stamps verbatim
   * (insert path) or preserve existing `creator_uuid`/`created_at`
   * (update path). This makes the InMemory provider safely
   * `preservesCreatorAudit: true`; `BaseEntityStorageService.upsert()`
   * uses the 1-RTT fast path and the original creator stays put across
   * subsequent upserts.
   */
  readonly capabilities = {
    listeners: true,
    transactions: true,
    batches: true,
    upsert: { supported: true, preservesCreatorAudit: true },
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

  /**
   * Wave 6.5 / PRD-007 + Wave 7.2 audit-aware upsert.
   *
   * `Map.has(id)` is local + sync (no RTT), so we can safely pre-check
   * existence and merge create-time audit fields from the existing row
   * when the doc already exists — preserving `creator_uuid` and
   * `created_at` across UPDATE, just like the Sprint 3.5 `update()`
   * path. This keeps `capabilities.upsert.preservesCreatorAudit: true`
   * honest.
   *
   * Field names: pulled from {@link AUDIT_FIELDS} (Wave 21 / EVID-076
   * CP-1). A future rename in `@gertsai/entity-audit` propagates through
   * the type system rather than requiring synchronised string edits in
   * every storage adapter.
   */
  async upsertDoc(
    path: string,
    id: string,
    data: Meta['write'],
  ): Promise<{ id: string }> {
    const coll = this._coll(path);
    const existing = coll.get(id);
    if (existing) {
      // Update path — preserve creator-time audit fields.
      const existingDoc = (existing as { data: Record<string, unknown> }).data;
      const incoming = data as Record<string, unknown>;
      const merged = { ...incoming } as Record<string, unknown>;
      if (AUDIT_FIELDS.creator_uuid in existingDoc) {
        merged[AUDIT_FIELDS.creator_uuid] = existingDoc[AUDIT_FIELDS.creator_uuid];
      }
      if (AUDIT_FIELDS.created_at in existingDoc) {
        merged[AUDIT_FIELDS.created_at] = existingDoc[AUDIT_FIELDS.created_at];
      }
      this._writeOnto(coll, id, merged as Meta['write']);
    } else {
      // Insert path — stamp the incoming payload verbatim.
      this._writeOnto(coll, id, data);
    }
    this._emitDoc(path, id);
    this._emitColl(path);
    return { id };
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

  // ─────────────────── Shared atomic-commit machinery (Wave 21 FR-X1) ───────────────────
  //
  // Both runBatch and runTransaction need:
  //   - a per-key delta queue (kind + payload) — preserves queue order
  //     so the same key can be set+updated within a single block;
  //   - a per-key version snapshot taken at the FIRST queue / read on
  //     that key (so blind writes are version-checked too — closes the
  //     pre-Wave-21 H-ENT-1/H-ENT-2 hazard);
  //   - a commit phase that (a) re-verifies every snapshotted version
  //     against the live store, throwing TransactionConflictError on
  //     mismatch, and (b) applies the deltas per-key into the live
  //     collection map (NOT a whole-map swap — concurrent commits no
  //     longer clobber).
  //
  // The shape is shared between batch + transaction so audit fixes only
  // need to land in one place.

  /**
   * A single queued write inside a batch/transaction. `delete` carries
   * no payload; `set` carries the full data; `update` carries the
   * partial. `version` is the doc's pre-block version at the moment
   * this op was queued — only used when this op is the FIRST touch on
   * the key (subsequent ops re-use the first-touch snapshot).
   */
  private _applyDeltas(
    deltas: ReadonlyMap<string, ReadonlyArray<DeltaOp>>,
    pathOf: (key: string) => readonly [string, string],
  ): void {
    for (const [key, ops] of deltas) {
      const [path, id] = pathOf(key);
      const coll = this._coll(path);
      for (const op of ops) {
        if (op.kind === 'set') {
          this._writeOnto(coll, id, op.data);
        } else if (op.kind === 'update') {
          this._updateOnto(coll, id, op.partial);
        } else {
          coll.delete(id);
        }
      }
    }
  }

  // ─────────────────── IStorageProvider — Batches ───────────────────

  async runBatch<R>(fn: (batch: IBatchRunner<Meta>) => Promise<R>): Promise<R> {
    // Per-key version snapshot taken at the FIRST queue op on that key.
    // null = absent at snapshot time. Wave 21 closes H-ENT-2: blind
    // writes are now version-checked.
    const versions = new Map<string, number | null>();
    // Per-key ordered op queue. Multiple ops on the same key are
    // applied in queue order at commit time.
    const deltas = new Map<string, DeltaOp[]>();
    const touchedColls = new Set<string>();

    const snapshot = (path: string, id: string): void => {
      const key = `${path}::${id}`;
      if (!versions.has(key)) {
        const cur = this._coll(path).get(id);
        versions.set(key, cur ? cur.version : null);
      }
    };
    const queue = (path: string, id: string, op: DeltaOp): void => {
      const key = `${path}::${id}`;
      snapshot(path, id);
      let q = deltas.get(key);
      if (!q) {
        q = [];
        deltas.set(key, q);
      }
      q.push(op);
      touchedColls.add(path);
    };

    const runner: IBatchRunner<Meta> = {
      set: (path, id, data): void => {
        queue(path, id, { kind: 'set', data });
      },
      update: (path, id, partial): void => {
        queue(path, id, {
          kind: 'update',
          partial: partial as Record<string, unknown>,
        });
      },
      delete: (path, id): void => {
        queue(path, id, { kind: 'delete' });
      },
    };
    const result = await fn(runner);

    // Wave 21 / EVID-076 FR-X1 — verify the write-set version snapshot
    // against the live store BEFORE applying any deltas. Same
    // optimistic-concurrency semantics as runTransaction; in a batch
    // the entire queued write-set is the "implicit read-set".
    this._verifyVersions(versions);

    // Wave 21 / EVID-076 FR-X1 — per-key merge into the live store. No
    // whole-collection-map swap; concurrent batches touching disjoint
    // keys no longer clobber each other.
    this._applyDeltas(deltas, parseKey);

    // Emit listeners after commit succeeds.
    for (const key of deltas.keys()) {
      const [path, id] = parseKey(key);
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
    // Reads: version observed at the time of tx.get (null = absent).
    const reads = new Map<string, number | null>();
    // Writes: pre-tx version snapshot at first queue op on each key.
    const writeVersions = new Map<string, number | null>();
    // Local view of the snapshot — reads inside the tx see writes
    // queued by the tx itself. Map<path::id, {data | null, present}>.
    const localView = new Map<string, { readonly doc: VersionedDoc | null }>();
    const deltas = new Map<string, DeltaOp[]>();
    const touchedColls = new Set<string>();

    const snapRead = (path: string, id: string): VersionedDoc | null => {
      const key = `${path}::${id}`;
      const cached = localView.get(key);
      if (cached) return cached.doc;
      const live = this._coll(path).get(id) ?? null;
      localView.set(key, { doc: live });
      if (!reads.has(key)) {
        reads.set(key, live ? live.version : null);
      }
      return live;
    };
    const snapWrite = (path: string, id: string): void => {
      const key = `${path}::${id}`;
      if (!writeVersions.has(key)) {
        const cur = this._coll(path).get(id);
        writeVersions.set(key, cur ? cur.version : null);
      }
    };
    const queue = (path: string, id: string, op: DeltaOp): void => {
      const key = `${path}::${id}`;
      snapWrite(path, id);
      let q = deltas.get(key);
      if (!q) {
        q = [];
        deltas.set(key, q);
      }
      q.push(op);
      touchedColls.add(path);
      // Update the local view so subsequent tx.get reflects the queued
      // write. We carry only the data, not a synthetic version — the
      // version that matters at commit time is the live-store one.
      if (op.kind === 'delete') {
        localView.set(key, { doc: null });
      } else if (op.kind === 'set') {
        const prev = localView.get(key)?.doc;
        const nextVer = (prev?.version ?? 0) + 1;
        localView.set(key, { doc: { version: nextVer, data: op.data } });
      } else {
        const prev = localView.get(key)?.doc;
        const merged = {
          ...(prev?.data as Record<string, unknown> | undefined),
          ...op.partial,
        };
        const nextVer = (prev?.version ?? 0) + 1;
        localView.set(key, { doc: { version: nextVer, data: merged } });
      }
    };

    const runner: ITransactionRunner<Meta> = {
      get: async (path, id): Promise<Meta['read'] | null> => {
        const doc = snapRead(path, id);
        return (doc?.data ?? null) as Meta['read'] | null;
      },
      set: (path, id, data): void => {
        queue(path, id, { kind: 'set', data });
      },
      update: (path, id, partial): void => {
        queue(path, id, {
          kind: 'update',
          partial: partial as Record<string, unknown>,
        });
      },
      delete: (path, id): void => {
        queue(path, id, { kind: 'delete' });
      },
    };
    const result = await fn(runner);

    // Wave 21 / EVID-076 FR-X1 — verify BOTH the read-set (legacy)
    // and the write-set (new). Reads pin the version observed via
    // tx.get; writes pin the version observed at first queue op for
    // keys that were never read. A mismatch on either set throws
    // TransactionConflictError before any delta is applied.
    this._verifyVersions(reads);
    this._verifyVersions(writeVersions);

    // Wave 21 / EVID-076 FR-X1 — per-key merge commit.
    this._applyDeltas(deltas, parseKey);

    for (const key of deltas.keys()) {
      const [path, id] = parseKey(key);
      this._emitDoc(path, id);
    }
    for (const path of touchedColls) {
      this._emitColl(path);
    }
    return result;
  }

  /**
   * Re-verify every (`path::id` → version) entry against the current
   * live store. Throws {@link TransactionConflictError} on the first
   * mismatch. Used by both `runBatch` and `runTransaction` to enforce
   * optimistic-concurrency at commit time.
   *
   * Wave 21 / EVID-076 FR-X1: covers blind-write hazards (writes
   * without a prior `tx.get` of the same key) by treating the
   * write-set's pre-commit version snapshot as an implicit read-set.
   */
  private _verifyVersions(versions: ReadonlyMap<string, number | null>): void {
    for (const [key, expected] of versions) {
      const [path, id] = parseKey(key);
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
  }
}

/**
 * Encoded queue key — `${path}::${id}`. The encoding survives `path`
 * values that themselves contain `::` because `parseKey` splits on the
 * FIRST occurrence only. (No path value in practice contains `::`, but
 * splitting on first occurrence is the cheapest defensive choice.)
 */
function parseKey(key: string): readonly [string, string] {
  const sep = key.indexOf('::');
  return [key.slice(0, sep), key.slice(sep + 2)] as const;
}

/**
 * Queue entry inside a batch/transaction. The discriminant tells the
 * commit phase which write to apply on the per-key merge pass.
 */
type DeltaOp =
  | { readonly kind: 'set'; readonly data: unknown }
  | {
      readonly kind: 'update';
      readonly partial: Record<string, unknown>;
    }
  | { readonly kind: 'delete' };
