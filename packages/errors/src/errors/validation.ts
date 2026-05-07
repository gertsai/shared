// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class ValidationError<
  D extends Record<string, unknown> = {
    field: string;
    constraint: string;
    value?: unknown;
  },
> extends AppError<D> {
  readonly kind = ErrorKind.VALIDATION;
}
