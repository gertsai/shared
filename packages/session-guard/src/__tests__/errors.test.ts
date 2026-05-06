// SPDX-License-Identifier: Apache-2.0
import {
  AppError,
  ConflictError,
  ErrorKind,
  ForbiddenError,
  UnauthorizedError,
} from '@gertsai/errors';
import { describe, expect, it } from 'vitest';

import {
  AuthenticationRequiredError,
  DataAccessUuidMissingError,
  OperatorTypeMismatchError,
  SessionDestroyedError,
  TenantScopeViolationError,
} from '../errors.js';

describe('AuthenticationRequiredError', () => {
  it('extends UnauthorizedError + AppError + Error', () => {
    const err = new AuthenticationRequiredError({
      message: 'no session',
      details: { reason: 'session-required' },
    });
    expect(err).toBeInstanceOf(AuthenticationRequiredError);
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });

  it('carries kind=UNAUTHORIZED + reason=session-required', () => {
    const err = new AuthenticationRequiredError({
      message: 'no session',
      details: { reason: 'session-required' },
    });
    expect(err.kind).toBe(ErrorKind.UNAUTHORIZED);
    expect(err.details.reason).toBe('session-required');
  });
});

describe('DataAccessUuidMissingError', () => {
  it('extends UnauthorizedError', () => {
    const err = new DataAccessUuidMissingError({
      message: 'no scope',
      details: { reason: 'data-access-uuid-missing' },
    });
    expect(err).toBeInstanceOf(DataAccessUuidMissingError);
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err).toBeInstanceOf(AppError);
    expect(err.kind).toBe(ErrorKind.UNAUTHORIZED);
    expect(err.details.reason).toBe('data-access-uuid-missing');
  });
});

describe('OperatorTypeMismatchError', () => {
  it('extends ForbiddenError + carries expected/actual', () => {
    const err = new OperatorTypeMismatchError({
      message: 'wrong type',
      details: { expected: ['web', 'api'], actual: 'bot' },
    });
    expect(err).toBeInstanceOf(OperatorTypeMismatchError);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err).toBeInstanceOf(AppError);
    expect(err.kind).toBe(ErrorKind.FORBIDDEN);
    expect(err.details.expected).toEqual(['web', 'api']);
    expect(err.details.actual).toBe('bot');
  });
});

describe('TenantScopeViolationError', () => {
  it('extends ForbiddenError + carries requested/sessionTenant', () => {
    const err = new TenantScopeViolationError({
      message: 'wrong tenant',
      details: { requested: 't-2', sessionTenant: 't-1' },
    });
    expect(err).toBeInstanceOf(TenantScopeViolationError);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.kind).toBe(ErrorKind.FORBIDDEN);
    expect(err.details.requested).toBe('t-2');
    expect(err.details.sessionTenant).toBe('t-1');
  });
});

describe('SessionDestroyedError', () => {
  it('extends ConflictError + carries contextField=session', () => {
    const err = new SessionDestroyedError({
      message: 'destroyed',
      details: { contextField: 'session' },
    });
    expect(err).toBeInstanceOf(SessionDestroyedError);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.kind).toBe(ErrorKind.CONFLICT);
    expect(err.details.contextField).toBe('session');
  });
});
