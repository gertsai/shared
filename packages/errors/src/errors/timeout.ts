// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class TimeoutError extends AppError<{
  timeoutMs?: number;
  operation?: string;
}> {
  readonly kind = ErrorKind.TIMEOUT;
}
