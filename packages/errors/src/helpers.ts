// SPDX-License-Identifier: Apache-2.0
import { AppError } from './app-error.js';
import { InternalError } from './errors/internal.js';

/**
 * Type guard: `true` iff `x` is an AppError instance (any subclass).
 */
export function isAppError(x: unknown): x is AppError {
  return x instanceof AppError;
}

/**
 * Closed allow-list for `wrapUnknownError(kind)` per ADR-010 I-11
 * (Sprint 3.10 Amendment 1 §A1.2). Rejects all other ErrorKind values
 * at the type level — the wrap target must be a server-side bucket
 * (CWE-285 mitigation: prevents error-coercion for auth bypass).
 *
 * Currently only 'INTERNAL' has a concrete subclass binding; 'EXTERNAL'
 * is reserved for a future subclass and falls back to `InternalError`
 * in the runtime dispatch (placeholder to avoid breaking changes when
 * the dedicated subclass is added).
 */
export type WrappableKind = 'INTERNAL' | 'EXTERNAL';

/**
 * Wrap any thrown value into an AppError preserving the original `cause`.
 *
 * - If `x` already is an AppError → returned as-is (no double-wrap, no
 *   `kind` override per ADR-010 I-11).
 * - If `x` is a native Error → `InternalError` carrying message + cause.
 * - Otherwise → `InternalError` with stringified value in `details`.
 *
 * `kind?` is a closed allow-list (`'INTERNAL' | 'EXTERNAL'`); other
 * `ErrorKind` values are rejected at compile time. Kind selection
 * dispatches to the corresponding concrete subclass; until a dedicated
 * `ExternalError` ships, both kinds resolve to `InternalError`.
 */
export function wrapUnknownError(
  x: unknown,
  kind: WrappableKind = 'INTERNAL',
  correlationId?: string,
): AppError {
  // Early-return on already-typed AppError — kind override forbidden
  // per ADR-010 I-11 (prevents kind coercion on already-classified errors).
  if (isAppError(x)) {
    return x;
  }

  const correlationOpt = correlationId !== undefined ? { correlationId } : {};

  if (x instanceof Error) {
    return dispatchByKind(kind, {
      message: x.message,
      details: { name: x.name },
      cause: x,
      ...correlationOpt,
    });
  }

  return dispatchByKind(kind, {
    message: 'Unknown error',
    details: { value: String(x) },
    ...correlationOpt,
  });
}

interface DispatchOpts {
  readonly message: string;
  readonly details: Record<string, unknown>;
  readonly cause?: unknown;
  readonly correlationId?: string;
}

function dispatchByKind(kind: WrappableKind, opts: DispatchOpts): AppError {
  switch (kind) {
    case 'INTERNAL':
    case 'EXTERNAL':
      return new InternalError(opts);
  }
}

export { getUserMessage, registerErrorLocale } from './locale.js';
