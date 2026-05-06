// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class BadGatewayError<
  D extends Record<string, unknown> = { upstream?: string },
> extends AppError<D> {
  readonly kind = ErrorKind.BAD_GATEWAY;
}
