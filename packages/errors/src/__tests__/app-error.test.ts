// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { AppError } from '../app-error.js';
import { ErrorKind } from '../error-kind.js';
import { ValidationError } from '../errors/validation.js';

describe('AppError', () => {
  it('is a subclass of Error', () => {
    const err = new ValidationError({
      message: 'bad',
      details: { field: 'x', constraint: 'required' },
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('preserves message + details + correlationId', () => {
    const err = new ValidationError({
      message: 'bad',
      details: { field: 'x', constraint: 'required', value: 42 },
      correlationId: 'corr-1',
    });
    expect(err.message).toBe('bad');
    expect(err.details).toEqual({ field: 'x', constraint: 'required', value: 42 });
    expect(err.correlationId).toBe('corr-1');
    expect(err.kind).toBe(ErrorKind.VALIDATION);
  });

  it('freezes details (no runtime mutation)', () => {
    const err = new ValidationError({
      message: 'bad',
      details: { field: 'x', constraint: 'required' },
    });
    expect(Object.isFrozen(err.details)).toBe(true);
  });

  it('toJSON emits SerializedAppError with kind/message/details', () => {
    const err = new ValidationError({
      message: 'bad',
      details: { field: 'x', constraint: 'required' },
    });
    const j = err.toJSON();
    expect(j.kind).toBe(ErrorKind.VALIDATION);
    expect(j.message).toBe('bad');
    expect(j.details).toEqual({ field: 'x', constraint: 'required' });
    expect(j.cause).toBeUndefined();
  });

  it('toJSON serializes nested AppError cause', () => {
    const inner = new ValidationError({
      message: 'inner',
      details: { field: 'a', constraint: 'min' },
    });
    const outer = new ValidationError({
      message: 'outer',
      details: { field: 'b', constraint: 'max' },
      cause: inner,
    });
    const j = outer.toJSON();
    expect(j.cause).toBeDefined();
    expect((j.cause as { kind?: unknown }).kind).toBe(ErrorKind.VALIDATION);
    expect((j.cause as { message?: unknown }).message).toBe('inner');
  });

  it('name reflects subclass constructor name', () => {
    const err = new ValidationError({
      message: 'bad',
      details: { field: 'x', constraint: 'required' },
    });
    expect(err.name).toBe('ValidationError');
  });

  it('accepts unknown values as cause', () => {
    const err = new ValidationError({
      message: 'bad',
      details: { field: 'x', constraint: 'required' },
      cause: 'plain string cause',
    });
    expect(err.cause).toBe('plain string cause');
  });
});
