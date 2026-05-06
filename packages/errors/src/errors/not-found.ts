// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class NotFoundError extends AppError<{
  resourceType: string;
  resourceId: string;
}> {
  readonly kind = ErrorKind.NOT_FOUND;
}
