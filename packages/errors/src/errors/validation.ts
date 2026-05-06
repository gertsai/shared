// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class ValidationError extends AppError<{
  field: string;
  constraint: string;
  value?: unknown;
}> {
  readonly kind = ErrorKind.VALIDATION;
}
