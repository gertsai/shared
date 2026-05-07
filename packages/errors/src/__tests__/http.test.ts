// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ErrorKind } from '../error-kind.js';
import { ConflictError } from '../errors/conflict.js';
import { InternalError } from '../errors/internal.js';
import { NotFoundError } from '../errors/not-found.js';
import { UnauthorizedError } from '../errors/unauthorized.js';
import { ValidationError } from '../errors/validation.js';
import {
  appErrorToHttpResponse,
  httpStatusForKind,
  parseHttpProblemDetails,
  PROBLEM_TYPE_BUCKETS,
} from '../http/index.js';

describe('httpStatusForKind', () => {
  it('maps every ErrorKind to a known HTTP status', () => {
    const expected: Record<ErrorKind, number> = {
      [ErrorKind.VALIDATION]: 400,
      [ErrorKind.NOT_FOUND]: 404,
      [ErrorKind.UNAUTHORIZED]: 401,
      [ErrorKind.FORBIDDEN]: 403,
      [ErrorKind.CONFLICT]: 409,
      [ErrorKind.RATE_LIMITED]: 429,
      [ErrorKind.INTERNAL]: 500,
      [ErrorKind.UPSTREAM_FAILURE]: 502,
      [ErrorKind.TIMEOUT]: 504,
      [ErrorKind.BAD_GATEWAY]: 502,
    };
    for (const [kind, status] of Object.entries(expected)) {
      expect(httpStatusForKind[kind as ErrorKind]).toBe(status);
    }
  });
});

describe('appErrorToHttpResponse', () => {
  it('emits RFC 9457 ProblemDetails with correct status + bucket type', () => {
    const err = new NotFoundError({
      message: 'doc missing',
      details: { resourceType: 'doc', resourceId: '7' },
      correlationId: 'corr-9',
    });
    const { status, body } = appErrorToHttpResponse(err);
    expect(status).toBe(404);
    expect(body.type).toBe('urn:gertsai:errors:not-found');
    expect(body.status).toBe(404);
    expect(body.title).toBe('doc missing');
    expect(body.detail).toBe('doc missing');
    expect(body.details).toEqual({ resourceType: 'doc', resourceId: '7' });
    expect(body.correlationId).toBe('corr-9');
  });

  it('omits correlationId when not present', () => {
    const err = new ValidationError({
      message: 'x',
      details: { field: 'a', constraint: 'b' },
    });
    const { body } = appErrorToHttpResponse(err);
    expect(body.correlationId).toBeUndefined();
  });
});

describe('parseHttpProblemDetails', () => {
  it('round-trips Validation through HTTP response', () => {
    const original = new ValidationError({
      message: 'bad field',
      details: { field: 'email', constraint: 'format' },
      correlationId: 'rt-1',
    });
    const { body } = appErrorToHttpResponse(original);
    const parsed = parseHttpProblemDetails(body);
    expect(parsed).toBeInstanceOf(ValidationError);
    expect(parsed.kind).toBe(ErrorKind.VALIDATION);
    expect(parsed.message).toBe('bad field');
    expect(parsed.correlationId).toBe('rt-1');
    expect(parsed.details).toEqual({ field: 'email', constraint: 'format' });
  });

  it('round-trips NotFound + Unauthorized + Conflict', () => {
    for (const original of [
      new NotFoundError({
        message: 'nf',
        details: { resourceType: 'doc', resourceId: '1' },
      }),
      new UnauthorizedError({ message: 'auth', details: { reason: 'no-token' } }),
      new ConflictError({ message: 'c', details: { resource: 'doc' } }),
    ]) {
      const { body } = appErrorToHttpResponse(original);
      const parsed = parseHttpProblemDetails(body);
      expect(parsed.kind).toBe(original.kind);
      expect(parsed.message).toBe(original.message);
    }
  });

  it('falls back to InternalError on unknown status', () => {
    const parsed = parseHttpProblemDetails({
      type: 'urn:custom',
      title: 'weird',
      status: 599,
    });
    expect(parsed).toBeInstanceOf(InternalError);
  });
});

describe('PROBLEM_TYPE_BUCKETS', () => {
  it('collapses INTERNAL/UPSTREAM_FAILURE/BAD_GATEWAY to one server bucket', () => {
    expect(PROBLEM_TYPE_BUCKETS[ErrorKind.INTERNAL]).toBe('urn:gertsai:errors:server');
    expect(PROBLEM_TYPE_BUCKETS[ErrorKind.UPSTREAM_FAILURE]).toBe(
      'urn:gertsai:errors:server',
    );
    expect(PROBLEM_TYPE_BUCKETS[ErrorKind.BAD_GATEWAY]).toBe(
      'urn:gertsai:errors:server',
    );
  });

  it('exposes distinct buckets for client-domain kinds', () => {
    expect(PROBLEM_TYPE_BUCKETS[ErrorKind.VALIDATION]).toBe(
      'urn:gertsai:errors:validation',
    );
    expect(PROBLEM_TYPE_BUCKETS[ErrorKind.UNAUTHORIZED]).toBe(
      'urn:gertsai:errors:unauthenticated',
    );
    expect(PROBLEM_TYPE_BUCKETS[ErrorKind.FORBIDDEN]).toBe(
      'urn:gertsai:errors:permission',
    );
    expect(PROBLEM_TYPE_BUCKETS[ErrorKind.CONFLICT]).toBe('urn:gertsai:errors:conflict');
    expect(PROBLEM_TYPE_BUCKETS[ErrorKind.RATE_LIMITED]).toBe(
      'urn:gertsai:errors:rate-limit',
    );
    expect(PROBLEM_TYPE_BUCKETS[ErrorKind.TIMEOUT]).toBe('urn:gertsai:errors:timeout');
  });
});
