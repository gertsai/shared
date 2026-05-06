// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Core type contracts for `@gertsai/storage-core`.
 *
 * Originally-inspired-by: Orchestra orchlab/storage `IStorageProvider`,
 * `MetaType`, batch + transaction runner shapes (Apache 2.0). Backend-coupling
 * stripped per ADR-005 Decision B — no Firestore / Firelord / Firebase
 * imports, no concrete vendor SDK references. Generic `StorageMetadata`
 * replaces backend-specific MetaType.
 *
 * Public surface (per SPEC-008 W-4B-1 + ADR-005 invariants I-1, I-4):
 *
 * - {@link StorageMetadata} — `Read` / `Write` / `Indexed` generic envelope.
 * - {@link defineStorageMetadata} — curried helper that preserves literal
 *   tuple narrowing for `indexed` field names (F-T-1).
 * - {@link StorageCapabilities} — boolean flags for `listeners`,
 *   `transactions`, `batches`. Adapters declare with `as const satisfies
 *   StorageCapabilities`.
 * - {@link IStorageProvider} — the storage abstraction. CRUD methods are
 *   non-optional. Listener methods (`onDocumentSnapshot`,
 *   `onCollectionSnapshot`) are also non-optional in the interface (F-A-1
 *   + F-T-3) — adapters with `capabilities.listeners=false` MUST throw
 *   {@link ListenersNotSupportedError} when invoked.
 * - {@link IBatchRunner} / {@link ITransactionRunner} — runner-pattern
 *   shapes consumed by `runBatch` / `runTransaction`.
 * - {@link Query} — read-only constraint sequence; concrete constraint
 *   types live in `@gertsai/query-dsl` (Wave 4B-3).
 *
 * No backend SDK is imported here. ADR-005 invariant I-1 enforces this:
 * `firestore`, `firelord`, `@firebase/*`, `firebase-admin`, `pg`, `prisma`,
 * `drizzle-orm` MUST NOT appear in this file or any other src/ file.
 */

/**
 * Generic envelope describing a storage shape: the "read" view (what comes
 * back from the backend), the "write" view (what callers send in), and the
 * tuple of indexed field names available for query constraints.
 *
 * Defaults make the trivial case ergonomic — a record where read and write
 * shapes are identical and every key of `Read` may be queried:
 *
 * ```ts
 * type UserMeta = StorageMetadata<{ id: string; email: string; age: number }>;
 * // → read = write = { id; email; age }, indexed = 'id' | 'email' | 'age'
 * ```
 *
 * For asymmetric shapes (server adds timestamps on write, fewer fields are
 * indexable than total fields), specify `Write` and `Indexed` explicitly:
 *
 * ```ts
 * type UserMeta = StorageMetadata<
 *   { id: string; email: string; createdAt: Date },
 *   { id: string; email: string },
 *   'id' | 'email'
 * >;
 * ```
 *
 * Prefer the {@link defineStorageMetadata} curried helper when you want
 * `indexed` to retain literal narrowing without manually maintaining a
 * union type.
 *
 * @template Read - The shape returned from `getDoc` / `getDocs`.
 * @template Write - The shape accepted by `set` / `update`. Defaults to `Read`.
 * @template Indexed - Union of indexable field names. Defaults to
 *   `keyof Read & string`.
 *
 * @public
 */
export interface StorageMetadata<
  Read = unknown,
  Write = Read,
  Indexed extends string = (Read extends object
    ? keyof Read & string
    : string),
> {
  /** The shape returned by reads — phantom type slot, no runtime field. */
  readonly read: Read;
  /** The shape accepted by writes — phantom type slot, no runtime field. */
  readonly write: Write;
  /**
   * Union of indexable field names. Used by `@gertsai/query-dsl` to
   * compile-validate `whereField` / `orderBy` constraint factories
   * against the metadata they're constructed for.
   */
  readonly indexed: Indexed;
}

/**
 * Curried helper that produces a `StorageMetadata` shape while preserving
 * literal narrowing of the `indexed` field tuple.
 *
 * Symmetric usage (`Write` defaults to `Read`):
 *
 * ```ts
 * type UserRead = { id: string; email: string; age: number };
 *
 * const userMeta = defineStorageMetadata<UserRead>()({
 *   indexed: ['id', 'email'] as const,
 * });
 * type UserMeta = typeof userMeta;
 * // → StorageMetadata<UserRead, UserRead, 'id' | 'email'>
 * ```
 *
 * Asymmetric usage — read shape includes audit marks, write shape doesn't.
 * This is the dominant pattern when wrapping a `BaseEntityStorageService`,
 * because `entity-audit` stamps the `MutationMarks` triplet on the way in
 * and reads return the full audit-enriched record:
 *
 * ```ts
 * import type { MutationMarks } from '@gertsai/entity-audit';
 *
 * type UserData = { name: string; email: string };
 * type UserRead = UserData & MutationMarks;
 *
 * const userMeta = defineStorageMetadata<UserRead, UserData>()({
 *   indexed: ['email'] as const,
 * });
 * type UserMeta = typeof userMeta;
 * // → StorageMetadata<UserRead, UserData, 'email'>
 * ```
 *
 * Why curried: TypeScript cannot partially infer generics. The first call
 * fixes `Read` (and optionally `Write`) from type arguments, the second
 * call infers `T` from the literal tuple. The `as const` (or readonly
 * tuple) on `indexed` keeps the literal types intact through the inference.
 *
 * The returned object is a phantom — every property has type-only meaning,
 * the runtime fields are placeholder values. Do not depend on runtime
 * shape; only `typeof` the return.
 *
 * @template Read - The read shape; passed at the first call site.
 * @template Write - The write shape; defaults to `Read`. Per SPEC-008.1
 *   audit fix F4, supplying `Write` separately is the dominant pattern for
 *   audit-stamped entities (Read = data + MutationMarks; Write = data).
 * @returns A function accepting `{ indexed: readonly string[] }` whose
 *   return type is the corresponding {@link StorageMetadata}.
 *
 * @public
 */
export function defineStorageMetadata<Read, Write = Read>(): <
  const T extends { readonly indexed: readonly string[] },
>(
  input: T,
) => StorageMetadata<Read, Write, T['indexed'][number]> {
  return <const T extends { readonly indexed: readonly string[] }>(
    input: T,
  ): StorageMetadata<Read, Write, T['indexed'][number]> => {
    // Preserve the literal tuple at runtime for downstream introspection
    // (e.g., adapters that want to enumerate indexed columns at startup).
    // The phantom typed slots (`read`, `write`, `indexed`) carry no
    // runtime value — only the static type matters.
    const out = {
      read: undefined as unknown as Read,
      write: undefined as unknown as Write,
      indexed: undefined as unknown as T['indexed'][number],
      _runtimeIndexed: input.indexed,
    };
    return out as unknown as StorageMetadata<
      Read,
      Write,
      T['indexed'][number]
    >;
  };
}

/**
 * Capability flags advertised by an {@link IStorageProvider} implementation.
 *
 * Adapters MUST declare this with `as const satisfies StorageCapabilities`
 * so consumers can branch on literal `true` / `false` at the type level:
 *
 * ```ts
 * readonly capabilities = {
 *   listeners: false,
 *   transactions: true,
 *   batches: true,
 * } as const satisfies StorageCapabilities;
 * ```
 *
 * Per ADR-005 invariant I-4, adapters with `listeners: false` MUST throw
 * {@link ListenersNotSupportedError} from `onDocumentSnapshot` and
 * `onCollectionSnapshot` — the methods themselves remain non-optional in
 * the interface so call sites have a stable shape (F-A-1 + F-T-3).
 *
 * @public
 */
export interface StorageCapabilities {
  /**
   * Whether `onDocumentSnapshot` / `onCollectionSnapshot` deliver real
   * change events. When `false`, those methods MUST throw
   * {@link ListenersNotSupportedError}.
   */
  readonly listeners: boolean;
  /**
   * Whether `runTransaction` provides ACID semantics. When `false`,
   * adapters SHOULD throw on `runTransaction`.
   */
  readonly transactions: boolean;
  /**
   * Whether `runBatch` performs the queued writes atomically. When
   * `false`, adapters SHOULD throw on `runBatch`.
   */
  readonly batches: boolean;
}

/**
 * Read-only constraint sequence describing a query against a collection.
 *
 * The concrete constraint shapes (`whereField`, `orderBy`, `limit`,
 * cursors) live in `@gertsai/query-dsl` (Wave 4B-3). This package
 * exports only the structural alias so `IStorageProvider` can reference
 * queries without taking a hard dependency on the DSL package.
 *
 * Each constraint object carries the metadata generic parameter so the
 * DSL can compile-validate field names against `Meta['indexed']`.
 *
 * @template Meta - The {@link StorageMetadata} the query is bound to.
 * @public
 */
export type Query<Meta extends StorageMetadata> = ReadonlyArray<{
  readonly kind: string;
  readonly meta?: Meta;
}>;

/**
 * Runner shape passed to the callback of {@link IStorageProvider.runBatch}.
 *
 * All methods are synchronous queue-and-return — actual writes flush when
 * the callback resolves. Errors thrown inside the callback abort the batch.
 *
 * @template Meta - The {@link StorageMetadata} of the target collections.
 * @public
 */
export interface IBatchRunner<Meta extends StorageMetadata> {
  /** Queue a `set` (full-document write) into the batch. */
  set(path: string, id: string, data: Meta['write']): void;
  /** Queue a partial-update into the batch. */
  update(path: string, id: string, partial: Partial<Meta['write']>): void;
  /** Queue a delete into the batch. */
  delete(path: string, id: string): void;
}

/**
 * Runner shape passed to the callback of {@link IStorageProvider.runTransaction}.
 *
 * Reads are async (transactions need a round-trip to acquire a consistent
 * snapshot). Writes are queued synchronously — adapters flush them on
 * commit. On conflict, adapters MUST throw
 * {@link TransactionConflictError}; callers handle retry policy.
 *
 * @template Meta - The {@link StorageMetadata} of the target collections.
 * @public
 */
export interface ITransactionRunner<Meta extends StorageMetadata> {
  /** Read a document inside the transaction's consistent snapshot. */
  get(path: string, id: string): Promise<Meta['read'] | null>;
  /** Queue a `set` to commit when the transaction resolves. */
  set(path: string, id: string, data: Meta['write']): void;
  /** Queue a partial-update to commit when the transaction resolves. */
  update(path: string, id: string, partial: Partial<Meta['write']>): void;
  /** Queue a delete to commit when the transaction resolves. */
  delete(path: string, id: string): void;
}

/**
 * Pluggable structured-logging facade consumed by upstream services
 * (`@gertsai/entity-storage`'s `BaseEntityStorageService`, future adapters).
 *
 * The four methods mirror the standard severity ladder. Each accepts an
 * optional structured `ctx` payload — adapters typically forward it as a
 * JSON-serialisable child record. Loggers SHOULD treat `ctx` as best-effort
 * metadata and never throw on unrecognised keys.
 *
 * Per SPEC-008 audit fix F-9: services accept a `StorageLogger` via
 * constructor opts and default to {@link noopStorageLogger} when omitted, so
 * production code remains pay-per-use while tests can plug a `vi.fn()`-backed
 * collector.
 *
 * @public
 */
export interface StorageLogger {
  /** Verbose tracing — entry/exit of internal methods, queued operations. */
  debug(msg: string, ctx?: Record<string, unknown>): void;
  /** Notable lifecycle events — service start, shutdown, replays. */
  info(msg: string, ctx?: Record<string, unknown>): void;
  /** Recoverable anomalies — listener failures during teardown, retries. */
  warn(msg: string, ctx?: Record<string, unknown>): void;
  /** Errors propagating to the caller — failed writes, transaction conflicts. */
  error(msg: string, ctx?: Record<string, unknown>): void;
}

/**
 * No-op {@link StorageLogger} used as the default when callers do not supply
 * a logger. Each method is `() => {}` so production hot paths pay only the
 * cost of a vtable dispatch — no allocation, no string formatting.
 *
 * @public
 */
export const noopStorageLogger: StorageLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * The backend-agnostic storage abstraction.
 *
 * Adapters implement this interface to plug a concrete database (Postgres,
 * Firestore, in-memory, etc.) into the `@gertsai/*` storage layer. Concrete
 * adapters live in separate packages — `@gertsai/pg-client` (Wave 4B-4),
 * `@gertsai/entity-storage` (Wave 4B-2 — `InMemoryStorageProvider`), and
 * future Firestore / SQLite / MySQL extractions.
 *
 * Per ADR-005 Decision A:
 *
 * - CRUD methods (`set`, `getDoc`, `getDocs`, `count`, `update`, `delete`)
 *   are mandatory.
 * - Listeners (`onDocumentSnapshot`, `onCollectionSnapshot`) are
 *   **non-optional** in the interface. Adapters that cannot deliver real
 *   change events advertise `capabilities.listeners = false` and MUST
 *   throw {@link ListenersNotSupportedError} when invoked. Callers can
 *   guard with `if (provider.capabilities.listeners) { ... }` for typed
 *   capability checks (F-A-1 + F-T-3).
 * - Transactions and batches use the runner pattern — call sites pass a
 *   callback receiving an {@link IBatchRunner} or {@link ITransactionRunner}.
 *   Adapters flush on callback resolution; throw to abort.
 *
 * The provider is registered with `@gertsai/di` via the
 * {@link storageProviderIdentifier} token (see `./identifier`). Consumers
 * cast the resolved value to their `IStorageProvider<MyMeta>` at the
 * boundary — see `./identifier` JSDoc for the rationale (F-T-5).
 *
 * @template Meta - The {@link StorageMetadata} this provider was constructed
 *   for. A single provider instance is bound to a single Meta; multi-meta
 *   apps either construct multiple providers or register separate DI tokens.
 *
 * @public
 */
export interface IStorageProvider<Meta extends StorageMetadata> {
  /**
   * Capabilities advertised by this adapter. See {@link StorageCapabilities}.
   * Adapters declare this `readonly` and concrete (literal-narrowed) so
   * consumers can branch at the type level.
   */
  readonly capabilities: StorageCapabilities;

  /**
   * Write the full document at `(path, id)`. Overwrites any existing data.
   * Use {@link IStorageProvider.update} for partial writes.
   */
  set(path: string, id: string, data: Meta['write']): Promise<void>;

  /**
   * Read a single document. Returns `null` when the document does not exist.
   */
  getDoc(path: string, id: string): Promise<Meta['read'] | null>;

  /**
   * Read multiple documents from a collection, optionally constrained
   * by a {@link Query}. Returns an empty array for no matches.
   */
  getDocs(path: string, query?: Query<Meta>): Promise<Meta['read'][]>;

  /**
   * Count documents matching the optional query. Adapters MAY perform
   * this server-side (Firestore aggregate, SQL `COUNT(*)`); for
   * in-memory adapters it is a length probe.
   */
  count(path: string, query?: Query<Meta>): Promise<number>;

  /**
   * Apply a partial write. Adapters merge with existing fields rather
   * than overwriting the whole document.
   */
  update(path: string, id: string, partial: Partial<Meta['write']>): Promise<void>;

  /**
   * Delete the document at `(path, id)`. This is a hard-delete at the
   * storage layer; soft-delete semantics live in
   * `@gertsai/entity-storage` (Wave 4B-2 — `BaseEntityStorageService`).
   */
  delete(path: string, id: string): Promise<void>;

  /**
   * Run the callback inside a batch. Writes queued through the runner
   * are flushed atomically when the callback resolves; throwing inside
   * the callback aborts the batch.
   *
   * Adapters with `capabilities.batches = false` SHOULD throw on this
   * method.
   */
  runBatch<R>(fn: (batch: IBatchRunner<Meta>) => Promise<R>): Promise<R>;

  /**
   * Run the callback inside a transaction. Reads see a consistent
   * snapshot; writes commit on resolution. On conflict, adapters MUST
   * throw {@link TransactionConflictError} — callers handle retry.
   *
   * Adapters with `capabilities.transactions = false` SHOULD throw on
   * this method.
   */
  runTransaction<R>(fn: (tx: ITransactionRunner<Meta>) => Promise<R>): Promise<R>;

  /**
   * Subscribe to a single document. The callback fires with the latest
   * snapshot (or `null` on delete). Returns an unsubscribe function.
   *
   * Per ADR-005 invariant I-4: when `capabilities.listeners === false`,
   * this method MUST throw {@link ListenersNotSupportedError}.
   *
   * @throws {ListenersNotSupportedError} when the adapter does not
   *   support listeners.
   */
  onDocumentSnapshot(
    path: string,
    id: string,
    cb: (doc: Meta['read'] | null) => void,
  ): () => void;

  /**
   * Subscribe to a collection query. The callback fires with the
   * current matched set. Returns an unsubscribe function.
   *
   * Per ADR-005 invariant I-4: when `capabilities.listeners === false`,
   * this method MUST throw {@link ListenersNotSupportedError}.
   *
   * @throws {ListenersNotSupportedError} when the adapter does not
   *   support listeners.
   */
  onCollectionSnapshot(
    path: string,
    query: Query<Meta>,
    cb: (docs: Meta['read'][]) => void,
  ): () => void;
}
