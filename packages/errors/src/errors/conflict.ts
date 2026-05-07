// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class ConflictError<
  D extends Record<string, unknown> = {
    resource?: string;
    conflictWith?: string;
  },
> extends AppError<D> {
  readonly kind = ErrorKind.CONFLICT;
}
