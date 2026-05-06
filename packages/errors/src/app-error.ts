// SPDX-License-Identifier: Apache-2.0
import type { ErrorKind } from './error-kind.js';
import type { SerializedAppError } from './serialize.js';
import { serializeAppError } from './serialize.js';

export interface AppErrorOpts<D extends Record<string, unknown> = Record<string, unknown>> {
  readonly message: string;
  readonly details?: D;
  readonly cause?: unknown;
  readonly correlationId?: string;
}

/**
 * Abstract base class for all @gertsai/errors taxonomy.
 *
 * Generic on `D` so subclasses narrow `details` typing while preserving
 * a single uniform JSON shape on the wire.
 *
 * `toJSON()` is internal — emits unredacted SerializedAppError suitable
 * for logs. For outbound HTTP / gRPC wire format use `/http` and `/grpc`
 * subpath helpers, which apply the I-14 redaction list.
 */
export abstract class AppError<
  D extends Record<string, unknown> = Record<string, unknown>,
> extends Error {
  abstract readonly kind: ErrorKind;
  readonly details: Readonly<D>;
  readonly correlationId?: string;
  declare readonly cause?: unknown;

  constructor(opts: AppErrorOpts<D>) {
    super(opts.message);
    this.name = new.target.name;
    this.details = Object.freeze({ ...(opts.details ?? ({} as D)) }) as Readonly<D>;
    if (opts.correlationId !== undefined) {
      this.correlationId = opts.correlationId;
    }
    if (opts.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: opts.cause,
        writable: true,
        configurable: true,
        enumerable: false,
      });
    }
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, new.target);
    }
  }

  toJSON(): SerializedAppError {
    return serializeAppError(this);
  }
}
