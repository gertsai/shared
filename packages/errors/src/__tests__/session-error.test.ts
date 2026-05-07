// SPDX-License-Identifier: Apache-2.0
//
// Sprint 3.10 W-3-10-23 — SessionDestroyedError relocated from
// @gertsai/session-guard to @gertsai/errors per ADR-010 Amendment 1 §A1.1.
import { describe, expect, it } from 'vitest';

import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';
import { ConflictError } from '../errors/conflict.js';
import { serializeAppError } from '../serialize.js';
import { SessionDestroyedError } from '../session.js';

describe('SessionDestroyedError', () => {
  it('extends ConflictError + AppError + Error', () => {
    const err = new SessionDestroyedError({
      message: 'Cannot $switchOperator on destroyed session',
      details: { contextField: 'session' },
    });
    expect(err).toBeInstanceOf(SessionDestroyedError);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });

  it('carries kind=CONFLICT', () => {
    const err = new SessionDestroyedError({
      message: 'destroyed',
      details: { contextField: 'session' },
    });
    expect(err.kind).toBe(ErrorKind.CONFLICT);
  });

  it('locks details schema to { contextField: "session" }', () => {
    const err = new SessionDestroyedError({
      message: 'destroyed',
      details: { contextField: 'session' },
    });
    expect(err.details).toEqual({ contextField: 'session' });
  });

  it('preserves the verbatim message for $switchOperator', () => {
    const err = new SessionDestroyedError({
      message: 'Cannot $switchOperator on destroyed session',
      details: { contextField: 'session' },
    });
    expect(err.message).toBe('Cannot $switchOperator on destroyed session');
  });

  it('preserves the verbatim message for $setDataAccessUuid', () => {
    const err = new SessionDestroyedError({
      message: 'Cannot $setDataAccessUuid on destroyed session',
      details: { contextField: 'session' },
    });
    expect(err.message).toBe('Cannot $setDataAccessUuid on destroyed session');
  });

  it('serializes via toJSON with kind=CONFLICT and locked details', () => {
    const err = new SessionDestroyedError({
      message: 'destroyed',
      details: { contextField: 'session' },
      correlationId: 'cid-1',
    });
    const json = err.toJSON();
    expect(json.kind).toBe(ErrorKind.CONFLICT);
    expect(json.message).toBe('destroyed');
    expect(json.details).toEqual({ contextField: 'session' });
    expect(json.correlationId).toBe('cid-1');
    // serializeAppError direct-call parity
    expect(serializeAppError(err)).toEqual(json);
  });

  it('name reflects the subclass identity', () => {
    const err = new SessionDestroyedError({
      message: 'destroyed',
      details: { contextField: 'session' },
    });
    expect(err.name).toBe('SessionDestroyedError');
  });
});
