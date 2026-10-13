// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Error classes thrown across the `@gertsai/storage-core` contract.
 *
 * Both classes extend `Error` directly with a stable `name` property so
 * call sites can branch on `err instanceof ListenersNotSupportedError`
 * without relying on string sniffing. They also accept the standard
 * `ErrorOptions` second argument so callers may chain causes:
 *
 * ```ts
 * try {
 *   await provider.runTransaction(...);
 * } catch (err) {
 *   throw new TransactionConflictError('write-write conflict', { cause: err });
 * }
 * ```
 *
 * Originally-inspired-by: Orchestra orchlab/storage error shapes (Apache 2.0).
 * The Orchestra source uses Firestore-coupled error types — this module
 * replaces them with backend-agnostic equivalents per ADR-005 Decision B.
 */

/**
 * Thrown by {@link IStorageProvider.onDocumentSnapshot} and
 * {@link IStorageProvider.onCollectionSnapshot} when the underlying
 * adapter does not support real-time listeners.
 *
 * Adapters with `capabilities.listeners === false` (e.g.,
 * `PgStorageProvider` without LISTEN/NOTIFY) MUST throw this when the
 * listener methods are invoked, per ADR-005 invariant I-4.
 *
 * Call sites guard with `provider.capabilities.listeners` before invoking,
 * or catch this error and fall back to polling.
 *
 * @public
 */
export class ListenersNotSupportedError extends Error {
  /**
   * Stable error name — `instanceof` checks are preferred, but `name`
   * is also stable across realm boundaries (e.g., when bundlers
   * duplicate class identity).
   */
  override readonly name = 'ListenersNotSupportedError';

  constructor(message?: string, options?: ErrorOptions) {
    super(message ?? 'Storage provider does not support listeners.', options);
    // Restore prototype chain when transpiled to ES5 targets — harmless
    // on modern targets, defensive for downstream consumers.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown by {@link IStorageProvider.runTransaction} when the transaction
 * cannot commit due to a conflict (e.g., serialization failure,
 * write-write race, optimistic-lock mismatch).
 *
 * Adapters map their backend-specific conflict signal to this class:
 *
 * - Postgres: `SQLSTATE 40001` (`serialization_failure`) →
 *   `TransactionConflictError`.
 * - Firestore: `failed-precondition` from the transaction API →
 *   `TransactionConflictError`.
 * - In-memory: optimistic conflict during `runTransaction` callback.
 *
 * Callers handle retry policy explicitly — the storage-core interface
 * does not specify a retry contract. A simple wrapper:
 *
 * ```ts
 * for (let i = 0; i < 3; i++) {
 *   try { return await provider.runTransaction(fn); }
 *   catch (err) {
 *     if (!(err instanceof TransactionConflictError)) throw err;
 *   }
 * }
 * throw new Error('transaction failed after 3 retries');
 * ```
 *
 * @public
 */
export class TransactionConflictError extends Error {
  /**
   * Stable error name for cross-realm `name === 'TransactionConflictError'`
   * checks (see {@link ListenersNotSupportedError.name}).
   */
  override readonly name = 'TransactionConflictError';

  constructor(message?: string, options?: ErrorOptions) {
    super(
      message ?? 'Transaction aborted due to a conflicting concurrent write.',
      options,
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a caller-declared `expectedVersion` does not match the
 * row's current `update_version` — the ETag-style optimistic
 * concurrency contract across request boundaries.
 *
 * Distinct from {@link TransactionConflictError}: that one is the
 * backend's intra-transaction write-write signal (retry whole
 * transaction); this one is a *client-visible* precondition failure —
 * the correct response is `409 Conflict`, and the caller should reload
 * the row and retry with the fresh version (or surface a merge UI).
 *
 * Thrown at two layers for the same write:
 *
 * - the write-rules gate compares `ctx.expectedVersion` against the
 *   committed `resource.update_version` (semantic failure, counted by
 *   the denial observer); and
 * - the provider enforces `WHERE update_version = $n` atomically at
 *   flush (closes the read→write race the gate's read leaves open).
 *
 * Carries `{path, id, expected, actual}` so denial observers can
 * aggregate without parsing the message.
 *
 * @public
 */
export class VersionConflictError extends Error {
  /**
   * Stable error name for cross-realm `name === 'VersionConflictError'`
   * checks (see {@link ListenersNotSupportedError.name}).
   */
  override readonly name = 'VersionConflictError';
  /** Collection path the conflicting write targeted, when known. */
  readonly path: string | undefined;
  /** Target document id, when known. */
  readonly id: string | undefined;
  /** The caller-declared version the write required. */
  readonly expected: number | undefined;
  /** The row's `update_version` at evaluation time (`undefined` = row absent). */
  readonly actual: number | undefined;

  constructor(
    info: {
      readonly path?: string;
      readonly id?: string;
      readonly expected?: number;
      readonly actual?: number;
    },
    message?: string,
    options?: ErrorOptions,
  ) {
    super(
      message ??
        `version conflict on ${info.path ?? '?'}/${info.id ?? '?'}` +
          (info.expected !== undefined ? ` — expected update_version=${info.expected}` : '') +
          `, found ${info.actual ?? 'absent'}`,
      options,
    );
    this.path = info.path;
    this.id = info.id;
    this.expected = info.expected;
    this.actual = info.actual;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
