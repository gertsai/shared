// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  ErrorKind,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '@gertsai/errors';
import {
  ContextFrozenError,
  FeatureNotEnabledError,
  ProviderNotFoundError,
  SessionMissingError,
  TenantContextMissingError,
} from '../errors.js';

describe('runtime-context dedicated errors', () => {
  it('SessionMissingError extends NotFoundError + AppError, kind=NOT_FOUND', () => {
    const err = new SessionMissingError({
      message: 'no session',
      details: { contextField: 'session' },
    });
    expect(err).toBeInstanceOf(SessionMissingError);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toBeInstanceOf(AppError);
    expect(err.kind).toBe(ErrorKind.NOT_FOUND);
    expect(err.details.contextField).toBe('session');
  });

  it('TenantContextMissingError extends UnauthorizedError + AppError, kind=UNAUTHORIZED', () => {
    const err = new TenantContextMissingError({
      message: 'no tenant',
      details: { reason: 'tenant-context-not-resolved' },
    });
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err).toBeInstanceOf(AppError);
    expect(err.kind).toBe(ErrorKind.UNAUTHORIZED);
    expect(err.details.reason).toBe('tenant-context-not-resolved');
  });

  it('ProviderNotFoundError extends NotFoundError + AppError, kind=NOT_FOUND', () => {
    const err = new ProviderNotFoundError({
      message: 'no provider',
      details: { token: 'mySymbol' },
    });
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.kind).toBe(ErrorKind.NOT_FOUND);
    expect(err.details.token).toBe('mySymbol');
  });

  it('ContextFrozenError extends ConflictError + AppError, kind=CONFLICT', () => {
    const err = new ContextFrozenError({
      message: 'frozen',
      details: { frozen: true },
    });
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.kind).toBe(ErrorKind.CONFLICT);
    expect(err.details.frozen).toBe(true);
  });

  it('FeatureNotEnabledError extends ForbiddenError + AppError, kind=FORBIDDEN', () => {
    const err = new FeatureNotEnabledError({
      message: 'flag off',
      details: { flag: 'beta-x' },
    });
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.kind).toBe(ErrorKind.FORBIDDEN);
    expect(err.details.flag).toBe('beta-x');
  });
});
