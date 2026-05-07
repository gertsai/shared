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

  /**
   * NOTE: `details` is sealed via a SHALLOW `Object.freeze` — top-level
   * keys cannot be reassigned, but nested objects/arrays remain mutable
   * by reference. Deep-freeze is intentionally deferred (target v0.2)
   * to avoid breaking the existing `Readonly<D>` shape for consumers
   * who pass non-plain values (Date, Buffer, custom classes) inside
   * `details`. For wire-format scrubbing of nested credentials, callers
   * MUST go through `/http` or `/grpc` exporters which deep-redact via
   * `redactDetails()` (Sprint 3.10 W-3-10-3 + ADR-006 I-14).
   */
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
