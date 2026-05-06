// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class ConflictError extends AppError<{
  resource?: string;
  conflictWith?: string;
}> {
  readonly kind = ErrorKind.CONFLICT;
}
