// SPDX-License-Identifier: Apache-2.0
import type { AppError } from './app-error.js';
import type { ErrorKind } from './error-kind.js';

/**
 * Wire-safe serialized form of AppError per ADR-006 I-13.
 *
 * `cause` is recursively serialized when it is itself an AppError.
 * Cycle / depth-overflow / non-AppError causes are replaced with a
 * `__truncated` marker so toJSON() never infinite-loops nor emits raw
 * native Error objects (which would leak stack traces).
 */
/**
 * `cause` value inside a SerializedAppError. Either a nested serialized
 * error (recursive) or a truncation marker for cycle/depth/non-app cases.
 */
export type SerializedAppCause =
  | SerializedAppError
  | {
      readonly __truncated: true;
      readonly reason: 'cycle' | 'depth-exceeded' | 'non-app-error';
    };

export type SerializedAppError = {
  readonly kind: ErrorKind;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  readonly cause?: SerializedAppCause;
};

const MAX_DEPTH = 5;

/**
 * Serialize an AppError to wire form with cycle + depth guard.
 * NOT redacted — internal use (logs). Use appErrorToHttpResponse /
 * appErrorToGrpcStatus for outbound wire format with redaction.
 */
export function serializeAppError(err: AppError): SerializedAppError {
  return walk(err, new WeakSet<AppError>(), 0);
}

function walk(
  err: AppError,
  visited: WeakSet<AppError>,
  depth: number,
): SerializedAppError {
  visited.add(err);
  // Build incrementally to honour EOPT — conditional spreads (and the spread
  // result type) include `| undefined` on the spread keys, which violates
  // SerializedAppError's exact-optional shape. Mutate the in-scope object
  // instead and return as readonly via the signature.
  const out: {
    -readonly [K in keyof SerializedAppError]: SerializedAppError[K];
  } = {
    kind: err.kind,
    message: err.message,
    details: err.details,
  };
  if (err.correlationId !== undefined) out.correlationId = err.correlationId;
  if (err.cause !== undefined) out.cause = walkCause(err.cause, visited, depth + 1);
  return out;
}

function walkCause(
  cause: unknown,
  visited: WeakSet<AppError>,
  depth: number,
): SerializedAppCause {
  if (depth > MAX_DEPTH) {
    return { __truncated: true, reason: 'depth-exceeded' };
  }
  if (isAppErrorLike(cause)) {
    if (visited.has(cause)) {
      return { __truncated: true, reason: 'cycle' };
    }
    return walk(cause, visited, depth);
  }
  return { __truncated: true, reason: 'non-app-error' };
}

function isAppErrorLike(x: unknown): x is AppError {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { kind?: unknown }).kind === 'string' &&
    typeof (x as { toJSON?: unknown }).toJSON === 'function' &&
    x instanceof Error
  );
}
