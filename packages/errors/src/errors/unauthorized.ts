// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class UnauthorizedError extends AppError<{ reason?: string }> {
  readonly kind = ErrorKind.UNAUTHORIZED;
}
