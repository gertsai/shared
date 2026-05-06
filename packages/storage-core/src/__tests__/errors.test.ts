// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import {
  ListenersNotSupportedError,
  TransactionConflictError,
} from '../errors';

describe('ListenersNotSupportedError', () => {
  it('extends Error', () => {
    const err = new ListenersNotSupportedError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ListenersNotSupportedError);
  });

  it('uses a stable name (cross-realm-safe)', () => {
    const err = new ListenersNotSupportedError();
    expect(err.name).toBe('ListenersNotSupportedError');
  });

  it('has a default message when none supplied', () => {
    const err = new ListenersNotSupportedError();
    expect(err.message).toMatch(/listeners/i);
  });

  it('honours an explicit message', () => {
    const err = new ListenersNotSupportedError('postgres adapter');
    expect(err.message).toBe('postgres adapter');
  });

  it('chains a cause through ErrorOptions', () => {
    const original = new Error('underlying');
    const err = new ListenersNotSupportedError('wrap', { cause: original });
    expect(err.cause).toBe(original);
  });

  it('keeps prototype chain after `throw new`', () => {
    try {
      throw new ListenersNotSupportedError();
    } catch (caught) {
      expect(caught).toBeInstanceOf(ListenersNotSupportedError);
    }
  });
});

describe('TransactionConflictError', () => {
  it('extends Error', () => {
    const err = new TransactionConflictError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TransactionConflictError);
  });

  it('uses a stable name', () => {
    const err = new TransactionConflictError();
    expect(err.name).toBe('TransactionConflictError');
  });

  it('has a default message about conflict', () => {
    const err = new TransactionConflictError();
    expect(err.message).toMatch(/conflict/i);
  });

  it('honours an explicit message + cause', () => {
    const original = new Error('SQLSTATE 40001');
    const err = new TransactionConflictError('serialization failure', {
      cause: original,
    });
    expect(err.message).toBe('serialization failure');
    expect(err.cause).toBe(original);
  });

  it('does not collide with ListenersNotSupportedError instanceof checks', () => {
    const tx = new TransactionConflictError();
    expect(tx).not.toBeInstanceOf(ListenersNotSupportedError);
    const ln = new ListenersNotSupportedError();
    expect(ln).not.toBeInstanceOf(TransactionConflictError);
  });
});
