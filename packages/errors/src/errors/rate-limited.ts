// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class RateLimitedError<
  D extends Record<string, unknown> = {
    retryAfterSec?: number;
    limit?: number;
  },
> extends AppError<D> {
  readonly kind = ErrorKind.RATE_LIMITED;
}
