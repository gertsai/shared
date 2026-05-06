// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class InternalError<
  D extends Record<string, unknown> = Record<string, unknown>,
> extends AppError<D> {
  readonly kind = ErrorKind.INTERNAL;
}
