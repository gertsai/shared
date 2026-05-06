// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ErrorKind } from '../error-kind.js';
import { InternalError } from '../errors/internal.js';
import { NotFoundError } from '../errors/not-found.js';
import { ValidationError } from '../errors/validation.js';
import {
  appErrorToGrpcStatus,
  GrpcStatus,
  grpcStatusForKind,
} from '../grpc/index.js';

describe('grpcStatusForKind', () => {
  it('maps every ErrorKind to canonical gRPC integer code', () => {
    expect(grpcStatusForKind[ErrorKind.VALIDATION]).toBe(GrpcStatus.INVALID_ARGUMENT);
    expect(grpcStatusForKind[ErrorKind.NOT_FOUND]).toBe(GrpcStatus.NOT_FOUND);
    expect(grpcStatusForKind[ErrorKind.UNAUTHORIZED]).toBe(GrpcStatus.UNAUTHENTICATED);
    expect(grpcStatusForKind[ErrorKind.FORBIDDEN]).toBe(GrpcStatus.PERMISSION_DENIED);
    expect(grpcStatusForKind[ErrorKind.CONFLICT]).toBe(GrpcStatus.ABORTED);
    expect(grpcStatusForKind[ErrorKind.RATE_LIMITED]).toBe(GrpcStatus.RESOURCE_EXHAUSTED);
    expect(grpcStatusForKind[ErrorKind.INTERNAL]).toBe(GrpcStatus.INTERNAL);
    expect(grpcStatusForKind[ErrorKind.UPSTREAM_FAILURE]).toBe(GrpcStatus.UNAVAILABLE);
    expect(grpcStatusForKind[ErrorKind.TIMEOUT]).toBe(GrpcStatus.DEADLINE_EXCEEDED);
    expect(grpcStatusForKind[ErrorKind.BAD_GATEWAY]).toBe(GrpcStatus.UNAVAILABLE);
  });

  it('vendored canonical integer constants match grpc-status spec', () => {
    expect(GrpcStatus.OK).toBe(0);
    expect(GrpcStatus.INVALID_ARGUMENT).toBe(3);
    expect(GrpcStatus.DEADLINE_EXCEEDED).toBe(4);
    expect(GrpcStatus.NOT_FOUND).toBe(5);
    expect(GrpcStatus.PERMISSION_DENIED).toBe(7);
    expect(GrpcStatus.RESOURCE_EXHAUSTED).toBe(8);
    expect(GrpcStatus.ABORTED).toBe(10);
    expect(GrpcStatus.INTERNAL).toBe(13);
    expect(GrpcStatus.UNAVAILABLE).toBe(14);
    expect(GrpcStatus.UNAUTHENTICATED).toBe(16);
  });
});

describe('appErrorToGrpcStatus', () => {
  it('serializes AppError to grpc status payload', () => {
    const err = new ValidationError({
      message: 'bad field',
      details: { field: 'email', constraint: 'format' },
    });
    const status = appErrorToGrpcStatus(err);
    expect(status.code).toBe(GrpcStatus.INVALID_ARGUMENT);
    expect(status.message).toBe('bad field');
    expect(status.details).toEqual({ field: 'email', constraint: 'format' });
  });

  it('preserves kind-driven mapping for INTERNAL', () => {
    const err = new InternalError({ message: 'oops', details: { trace: 'abc' } });
    const status = appErrorToGrpcStatus(err);
    expect(status.code).toBe(GrpcStatus.INTERNAL);
  });

  it('preserves kind-driven mapping for NOT_FOUND', () => {
    const err = new NotFoundError({
      message: 'doc missing',
      details: { resourceType: 'doc', resourceId: '1' },
    });
    const status = appErrorToGrpcStatus(err);
    expect(status.code).toBe(GrpcStatus.NOT_FOUND);
  });
});
