// SPDX-License-Identifier: Apache-2.0
import { AppError } from './app-error.js';
import { ErrorKind } from './error-kind.js';
import { InternalError } from './errors/internal.js';

/**
 * Type guard: `true` iff `x` is an AppError instance (any subclass).
 */
export function isAppError(x: unknown): x is AppError {
  return x instanceof AppError;
}

/**
 * Wrap any thrown value into an AppError preserving the original `cause`.
 *
 * - If `x` already is an AppError → returned as-is (no double-wrap).
 * - If `x` is a native Error → InternalError carrying message + cause.
 * - Otherwise → InternalError with stringified value in details.
 *
 * The `kind` parameter is reserved for future opt-in (currently INTERNAL
 * is the only supported wrap target — additional kinds would change
 * semantics and require explicit subclass selection by the caller).
 */
export function wrapUnknownError(
  x: unknown,
  _kind?: ErrorKind,
  correlationId?: string,
): AppError {
  if (isAppError(x)) {
    return x;
  }
  if (x instanceof Error) {
    return new InternalError({
      message: x.message,
      details: { name: x.name },
      cause: x,
      ...(correlationId !== undefined ? { correlationId } : {}),
    });
  }
  return new InternalError({
    message: 'Unknown error',
    details: { value: String(x) },
    ...(correlationId !== undefined ? { correlationId } : {}),
  });
}

export { getUserMessage, registerErrorLocale } from './locale.js';
