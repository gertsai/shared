// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class UpstreamFailureError<
  D extends Record<string, unknown> = {
    upstream?: string;
    status?: number;
  },
> extends AppError<D> {
  readonly kind = ErrorKind.UPSTREAM_FAILURE;
}
