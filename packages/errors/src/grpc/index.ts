// SPDX-License-Identifier: Apache-2.0
import type { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';
import { redactDetails } from '../redaction.js';

/**
 * Canonical gRPC status codes vendored as integer constants per ADR-006 I-3.
 * NO grpc framework runtime import — keep `/grpc` subpath dependency-free.
 *
 * Source: https://grpc.github.io/grpc/core/md_doc_statuscodes.html
 */
export const GrpcStatus = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  OUT_OF_RANGE: 11,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  DATA_LOSS: 15,
  UNAUTHENTICATED: 16,
} as const;

export const grpcStatusForKind: Readonly<Record<ErrorKind, number>> = {
  [ErrorKind.VALIDATION]: GrpcStatus.INVALID_ARGUMENT,
  [ErrorKind.NOT_FOUND]: GrpcStatus.NOT_FOUND,
  [ErrorKind.UNAUTHORIZED]: GrpcStatus.UNAUTHENTICATED,
  [ErrorKind.FORBIDDEN]: GrpcStatus.PERMISSION_DENIED,
  [ErrorKind.CONFLICT]: GrpcStatus.ABORTED,
  [ErrorKind.RATE_LIMITED]: GrpcStatus.RESOURCE_EXHAUSTED,
  [ErrorKind.INTERNAL]: GrpcStatus.INTERNAL,
  [ErrorKind.UPSTREAM_FAILURE]: GrpcStatus.UNAVAILABLE,
  [ErrorKind.TIMEOUT]: GrpcStatus.DEADLINE_EXCEEDED,
  [ErrorKind.BAD_GATEWAY]: GrpcStatus.UNAVAILABLE,
} as const;

/**
 * Serialize an AppError to a gRPC-friendly status payload. Applies
 * `redactDetails` per ADR-006 I-14 — gRPC servers SHOULD attach the
 * returned `details` to status metadata only after redaction.
 */
export function appErrorToGrpcStatus(err: AppError): {
  readonly code: number;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
} {
  return {
    code: grpcStatusForKind[err.kind],
    message: err.message,
    details: redactDetails(err.details),
  };
}
