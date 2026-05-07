// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ErrorKind } from '../error-kind.js';
import { InternalError } from '../errors/internal.js';
import { ValidationError } from '../errors/validation.js';
import { isAppError, wrapUnknownError } from '../helpers.js';
import { getUserMessage, registerErrorLocale } from '../locale.js';

describe('isAppError', () => {
  it('returns true for AppError subclass instances', () => {
    expect(
      isAppError(
        new ValidationError({ message: 'x', details: { field: 'a', constraint: 'b' } }),
      ),
    ).toBe(true);
  });

  it('returns false for native Error / non-Error / null / undefined', () => {
    expect(isAppError(new Error('plain'))).toBe(false);
    expect(isAppError('string')).toBe(false);
    expect(isAppError(42)).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
    expect(isAppError({})).toBe(false);
  });
});

describe('wrapUnknownError', () => {
  it('returns AppError instance unchanged (no double-wrap)', () => {
    const err = new ValidationError({
      message: 'x',
      details: { field: 'a', constraint: 'b' },
    });
    expect(wrapUnknownError(err)).toBe(err);
  });

  it('wraps native Error preserving cause', () => {
    const native = new TypeError('bad type');
    const wrapped = wrapUnknownError(native);
    expect(wrapped).toBeInstanceOf(InternalError);
    expect(wrapped.kind).toBe(ErrorKind.INTERNAL);
    expect(wrapped.message).toBe('bad type');
    expect(wrapped.cause).toBe(native);
    expect(wrapped.details.name).toBe('TypeError');
  });

  it('wraps non-Error values (string, number, object)', () => {
    const w1 = wrapUnknownError('plain string');
    expect(w1).toBeInstanceOf(InternalError);
    expect(w1.message).toBe('Unknown error');
    expect(w1.details.value).toBe('plain string');

    const w2 = wrapUnknownError(42);
    expect(w2.details.value).toBe('42');

    const w3 = wrapUnknownError({ foo: 'bar' });
    expect(w3.details.value).toBe('[object Object]');
  });

  it('attaches correlationId when provided', () => {
    const wrapped = wrapUnknownError(new Error('boom'), 'INTERNAL', 'corr-1');
    expect(wrapped.correlationId).toBe('corr-1');
  });

  it('default kind is INTERNAL — wrap returns InternalError', () => {
    const wrapped = wrapUnknownError(new Error('default'));
    expect(wrapped).toBeInstanceOf(InternalError);
    expect(wrapped.kind).toBe(ErrorKind.INTERNAL);
  });

  it('explicit kind=EXTERNAL still resolves to InternalError (placeholder until dedicated subclass)', () => {
    const wrapped = wrapUnknownError(new Error('ext'), 'EXTERNAL');
    expect(wrapped).toBeInstanceOf(InternalError);
    expect(wrapped.kind).toBe(ErrorKind.INTERNAL);
  });

  it('adversarial: kind override on already-typed AppError is ignored (ADR-010 I-11)', () => {
    const original = new InternalError({
      message: 'pre-classified',
      details: { reason: 'x' },
    });
    const result = wrapUnknownError(original, 'EXTERNAL');
    expect(result).toBe(original);
    expect(result).toBeInstanceOf(InternalError);
    expect(result.kind).toBe(ErrorKind.INTERNAL);
    expect(result.message).toBe('pre-classified');
  });

  it('adversarial: non-INTERNAL/EXTERNAL kind rejected at compile time', () => {
    // The following lines, if uncommented, MUST fail TS strict compilation
    // (closed allow-list per ADR-010 I-11):
    //   wrapUnknownError(new Error('x'), 'NOT_FOUND');
    //   wrapUnknownError(new Error('x'), 'FORBIDDEN');
    //   wrapUnknownError(new Error('x'), 'VALIDATION');
    //   wrapUnknownError(new Error('x'), 'CONFLICT');
    // Runtime sanity: the type-level guard is the primary defence; this
    // test asserts the allow-list values themselves still work.
    const internal = wrapUnknownError(new Error('a'), 'INTERNAL');
    const external = wrapUnknownError(new Error('b'), 'EXTERNAL');
    expect(internal.kind).toBe(ErrorKind.INTERNAL);
    expect(external.kind).toBe(ErrorKind.INTERNAL);
  });
});

describe('getUserMessage', () => {
  it('returns default English message for unknown locale', () => {
    const err = new ValidationError({
      message: 'raw',
      details: { field: 'a', constraint: 'b' },
    });
    expect(getUserMessage(err)).toBe('The submitted data is invalid.');
    expect(getUserMessage(err, 'klingon')).toBe('The submitted data is invalid.');
  });

  it('returns localized message after registerErrorLocale', () => {
    registerErrorLocale('ru', {
      [ErrorKind.VALIDATION]: 'Неверные данные.',
    });
    const err = new ValidationError({
      message: 'raw',
      details: { field: 'a', constraint: 'b' },
    });
    expect(getUserMessage(err, 'ru')).toBe('Неверные данные.');
  });

  it('falls back to default when locale lacks key', () => {
    registerErrorLocale('partial', {
      [ErrorKind.VALIDATION]: 'partial msg',
    });
    const err = new InternalError({ message: 'oops', details: {} });
    expect(getUserMessage(err, 'partial')).toBe(
      'An internal error occurred. Please try again later.',
    );
  });
});
