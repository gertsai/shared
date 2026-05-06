// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class UnauthorizedError<
  D extends Record<string, unknown> = { reason?: string },
> extends AppError<D> {
  readonly kind = ErrorKind.UNAUTHORIZED;
}
