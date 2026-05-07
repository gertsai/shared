// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

/**
 * Catch-all server-side error per ADR-006 §A1.5 ErrorKind taxonomy.
 *
 * Generic on `D` — defaults to the open `Record<string, unknown>` shape
 * intentionally (per ADR-010 W-3-10-4):
 *
 *   - The catch-all role of `INTERNAL` means the runtime cannot
 *     guarantee a specific `details` schema — value comes from
 *     `wrapUnknownError(unknownThrown)` and similar boundaries where
 *     the originating shape is opaque.
 *   - Consumers that DO have a known shape are expected to subclass:
 *     `class DbWriteFailedError extends InternalError<{ table: string;
 *     code: string }> {}`. Subclassing preserves the `kind` discriminator
 *     while narrowing `details` typing for callers — no breaking change
 *     to the wire format (`AppError.toJSON()` still emits a uniform
 *     `SerializedAppError`).
 *
 * Used as the default dispatch target for `wrapUnknownError(x, kind?)`
 * regardless of `kind` value, until a dedicated `ExternalError` subclass
 * is added (placeholder per ADR-010 I-11 closed allow-list).
 */
export class InternalError<
  D extends Record<string, unknown> = Record<string, unknown>,
> extends AppError<D> {
  readonly kind = ErrorKind.INTERNAL;
}
