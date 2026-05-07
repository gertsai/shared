// SPDX-License-Identifier: Apache-2.0
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';

export class NotFoundError<
  D extends Record<string, unknown> = {
    resourceType: string;
    resourceId: string;
  },
> extends AppError<D> {
  readonly kind = ErrorKind.NOT_FOUND;
}
