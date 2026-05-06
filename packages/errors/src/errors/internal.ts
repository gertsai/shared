// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class InternalError extends AppError<Record<string, unknown>> {
  readonly kind = ErrorKind.INTERNAL;
}
