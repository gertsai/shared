// SPDX-License-Identifier: Apache-2.0
import { describe, expect, expectTypeOf, it } from 'vitest';
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';
import { BadGatewayError } from '../errors/bad-gateway.js';
import { ConflictError } from '../errors/conflict.js';
import { ForbiddenError } from '../errors/forbidden.js';
import { InternalError } from '../errors/internal.js';
import { NotFoundError } from '../errors/not-found.js';
import { RateLimitedError } from '../errors/rate-limited.js';
import { TimeoutError } from '../errors/timeout.js';
import { UnauthorizedError } from '../errors/unauthorized.js';
import { UpstreamFailureError } from '../errors/upstream-failure.js';
import { ValidationError } from '../errors/validation.js';

describe('AppError subclasses (parametric — Amendment 1.1.1)', () => {
  it('default D works without explicit type arg (NotFoundError)', () => {
    const err = new NotFoundError({
      message: 'doc missing',
      details: { resourceType: 'doc', resourceId: '42' },
    });
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toBeInstanceOf(AppError);
    expect(err.kind).toBe(ErrorKind.NOT_FOUND);
    expect(err.details.resourceType).toBe('doc');
    expect(err.details.resourceId).toBe('42');
    expectTypeOf(err.details.resourceType).toEqualTypeOf<string>();
    expectTypeOf(err.details.resourceId).toEqualTypeOf<string>();
  });

  it('specialized D narrows details typing (NotFoundError → CustomError)', () => {
    class CustomError extends NotFoundError<{ contextField: string }> {}
    const err = new CustomError({
      message: 'custom',
      details: { contextField: 'session' },
    });
    expect(err.details.contextField).toBe('session');
    expectTypeOf(err.details.contextField).toEqualTypeOf<string>();
    expect(err).toBeInstanceOf(CustomError);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });

  it('preserves kind discriminator through specialization', () => {
    class SessionNotFound extends NotFoundError<{ sessionId: string }> {}
    class TenantForbidden extends ForbiddenError<{ tenantId: string }> {}
    const a = new SessionNotFound({
      message: 'no session',
      details: { sessionId: 'abc' },
    });
    const b = new TenantForbidden({
      message: 'no access',
      details: { tenantId: 't-1' },
    });
    expect(a.kind).toBe(ErrorKind.NOT_FOUND);
    expect(b.kind).toBe(ErrorKind.FORBIDDEN);
  });

  it('toJSON() preserves typed details on specialized subclasses', () => {
    class ValidationFieldError extends ValidationError<{
      field: 'email' | 'password';
      constraint: string;
    }> {}
    const err = new ValidationFieldError({
      message: 'bad email',
      details: { field: 'email', constraint: 'format' },
      correlationId: 'corr-1',
    });
    const json = err.toJSON();
    expect(json.kind).toBe(ErrorKind.VALIDATION);
    expect(json.message).toBe('bad email');
    expect(json.details).toEqual({ field: 'email', constraint: 'format' });
    expect(json.correlationId).toBe('corr-1');
  });

  it('all 10 subclasses accept default D (smoke test)', () => {
    const cases: Array<AppError> = [
      new ValidationError({
        message: 'v',
        details: { field: 'a', constraint: 'r' },
      }),
      new NotFoundError({
        message: 'n',
        details: { resourceType: 'd', resourceId: '1' },
      }),
      new UnauthorizedError({ message: 'u', details: { reason: 'x' } }),
      new ForbiddenError({ message: 'f', details: {} }),
      new ConflictError({ message: 'c', details: {} }),
      new RateLimitedError({ message: 'r', details: { retryAfterSec: 30 } }),
      new InternalError({ message: 'i', details: { trace: 't' } }),
      new UpstreamFailureError({
        message: 'up',
        details: { upstream: 's' },
      }),
      new TimeoutError({ message: 't', details: { timeoutMs: 1000 } }),
      new BadGatewayError({ message: 'bg', details: { upstream: 's' } }),
    ];
    expect(cases.length).toBe(10);
    for (const err of cases) {
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    }
    const kinds = new Set(cases.map((c) => c.kind));
    expect(kinds.size).toBe(10);
  });

  it('specialized subclass with extra-narrow D still serializes correctly', () => {
    class PaymentUpstreamFailure extends UpstreamFailureError<{
      upstream: 'stripe' | 'adyen';
      status: number;
      txnId: string;
    }> {}
    const err = new PaymentUpstreamFailure({
      message: 'stripe down',
      details: { upstream: 'stripe', status: 503, txnId: 'tx-9' },
    });
    expect(err).toBeInstanceOf(PaymentUpstreamFailure);
    expect(err).toBeInstanceOf(UpstreamFailureError);
    expect(err).toBeInstanceOf(AppError);
    expect(err.kind).toBe(ErrorKind.UPSTREAM_FAILURE);
    expectTypeOf(err.details.upstream).toEqualTypeOf<'stripe' | 'adyen'>();
    expectTypeOf(err.details.txnId).toEqualTypeOf<string>();
    const json = err.toJSON();
    expect(json.details).toEqual({
      upstream: 'stripe',
      status: 503,
      txnId: 'tx-9',
    });
  });
});
