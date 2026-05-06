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
