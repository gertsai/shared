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
export type SerializedAppError = {
  readonly kind: ErrorKind;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  readonly cause?:
    | SerializedAppError
    | {
        readonly __truncated: true;
        readonly reason: 'cycle' | 'depth-exceeded' | 'non-app-error';
      };
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
  const out: SerializedAppError = {
    kind: err.kind,
    message: err.message,
    details: err.details,
    ...(err.correlationId !== undefined ? { correlationId: err.correlationId } : {}),
    ...(err.cause !== undefined ? { cause: walkCause(err.cause, visited, depth + 1) } : {}),
  };
  return out;
}

function walkCause(
  cause: unknown,
  visited: WeakSet<AppError>,
  depth: number,
): SerializedAppError['cause'] {
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
