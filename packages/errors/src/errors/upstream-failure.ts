// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class UpstreamFailureError extends AppError<{
  upstream?: string;
  status?: number;
}> {
  readonly kind = ErrorKind.UPSTREAM_FAILURE;
}
