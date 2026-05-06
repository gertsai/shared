// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class RateLimitedError extends AppError<{
  retryAfterSec?: number;
  limit?: number;
}> {
  readonly kind = ErrorKind.RATE_LIMITED;
}
