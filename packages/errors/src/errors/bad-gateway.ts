// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class BadGatewayError extends AppError<{ upstream?: string }> {
  readonly kind = ErrorKind.BAD_GATEWAY;
}
