// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
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

const cases: ReadonlyArray<{
  name: string;
  ctor: new (opts: never) => AppError;
  kind: ErrorKind;
  details: Record<string, unknown>;
}> = [
  {
    name: 'ValidationError',
    ctor: ValidationError,
    kind: ErrorKind.VALIDATION,
    details: { field: 'a', constraint: 'required' },
  },
  {
    name: 'NotFoundError',
    ctor: NotFoundError,
    kind: ErrorKind.NOT_FOUND,
    details: { resourceType: 'doc', resourceId: '42' },
  },
  {
    name: 'UnauthorizedError',
    ctor: UnauthorizedError,
    kind: ErrorKind.UNAUTHORIZED,
    details: { reason: 'no-token' },
  },
  {
    name: 'ForbiddenError',
    ctor: ForbiddenError,
    kind: ErrorKind.FORBIDDEN,
    details: { resource: 'doc', action: 'delete' },
  },
  {
    name: 'ConflictError',
    ctor: ConflictError,
    kind: ErrorKind.CONFLICT,
    details: { resource: 'doc', conflictWith: 'rev-7' },
  },
  {
    name: 'RateLimitedError',
    ctor: RateLimitedError,
    kind: ErrorKind.RATE_LIMITED,
    details: { retryAfterSec: 60, limit: 100 },
  },
  {
    name: 'InternalError',
    ctor: InternalError,
    kind: ErrorKind.INTERNAL,
    details: { trace: 'abc' },
  },
  {
    name: 'UpstreamFailureError',
    ctor: UpstreamFailureError,
    kind: ErrorKind.UPSTREAM_FAILURE,
    details: { upstream: 'payments-svc', status: 502 },
  },
  {
    name: 'TimeoutError',
    ctor: TimeoutError,
    kind: ErrorKind.TIMEOUT,
    details: { timeoutMs: 5000, operation: 'fetch' },
  },
  {
    name: 'BadGatewayError',
    ctor: BadGatewayError,
    kind: ErrorKind.BAD_GATEWAY,
    details: { upstream: 'cdn' },
  },
];

describe('AppError subclasses', () => {
  for (const { name, ctor, kind, details } of cases) {
    it(`${name} is AppError + has kind=${kind}`, () => {
      const Ctor = ctor as unknown as new (opts: {
        message: string;
        details: Record<string, unknown>;
      }) => AppError;
      const err = new Ctor({ message: `${name} msg`, details });
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
      expect(err.kind).toBe(kind);
      expect(err.details).toEqual(details);
      expect(err.message).toBe(`${name} msg`);
    });
  }

  it('exposes 10 distinct concrete subclasses', () => {
    expect(cases.length).toBe(10);
    const kinds = new Set(cases.map((c) => c.kind));
    expect(kinds.size).toBe(10);
  });
});
