// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class ForbiddenError extends AppError<{ resource?: string; action?: string }> {
  readonly kind = ErrorKind.FORBIDDEN;
}
