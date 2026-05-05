// SPDX-License-Identifier: Apache-2.0
/**
 * @fileoverview
 * Tests for runtime type guards added in Sprint 3.4 (W-4A-4).
 */

import { describe, expect, it } from 'vitest';
import EventEmitter from 'events';

import {
  assertServiceIdentifier,
  isDestroyable,
  isServiceIdentifier,
} from '../guards';
import { createIdentifier } from '../identifier';
import type { IGlobalService } from '../types';

class FakeGlobalService extends EventEmitter implements IGlobalService {
  get isReady() {
    return Promise.resolve();
  }
  $destroy() {}
}

describe('isDestroyable', () => {
  it('returns true for objects with a $destroy function', () => {
    const obj = { $destroy() {} };
    expect(isDestroyable(obj)).toBe(true);
  });

  it('returns true for class instances implementing IDestroyable', () => {
    expect(isDestroyable(new FakeGlobalService())).toBe(true);
  });

  it('returns false for null and undefined', () => {
    expect(isDestroyable(null)).toBe(false);
    expect(isDestroyable(undefined)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isDestroyable(42)).toBe(false);
    expect(isDestroyable('hello')).toBe(false);
    expect(isDestroyable(true)).toBe(false);
    expect(isDestroyable(Symbol('x'))).toBe(false);
  });

  it('returns false for objects without a $destroy method', () => {
    expect(isDestroyable({})).toBe(false);
    expect(isDestroyable({ destroy: () => {} })).toBe(false);
    expect(isDestroyable({ $destroy: 'not-a-function' })).toBe(false);
  });

  it('narrows the type so $destroy can be called', () => {
    const candidate: unknown = { $destroy: () => {} };
    if (isDestroyable(candidate)) {
      // If the guard didn't narrow, this line would fail typecheck.
      candidate.$destroy();
    }
    expect.assertions(0);
  });
});

describe('isServiceIdentifier', () => {
  it('returns true for an identifier produced by createIdentifier', () => {
    const id = createIdentifier<FakeGlobalService, 'svc'>('svc');
    expect(isServiceIdentifier(id)).toBe(true);
  });

  it('returns true for any plain symbol', () => {
    expect(isServiceIdentifier(Symbol('anything'))).toBe(true);
  });

  it('returns false for plain strings', () => {
    expect(isServiceIdentifier('looks-like-an-id')).toBe(false);
  });

  it('returns false for null/undefined/objects/numbers', () => {
    expect(isServiceIdentifier(null)).toBe(false);
    expect(isServiceIdentifier(undefined)).toBe(false);
    expect(isServiceIdentifier({})).toBe(false);
    expect(isServiceIdentifier(7)).toBe(false);
  });
});

describe('assertServiceIdentifier', () => {
  it('passes silently when value is a symbol', () => {
    const id = createIdentifier<FakeGlobalService, 'svc'>('svc');
    expect(() => assertServiceIdentifier(id)).not.toThrow();
  });

  it('throws TypeError for non-symbol values', () => {
    expect(() => assertServiceIdentifier('nope')).toThrow(TypeError);
    expect(() => assertServiceIdentifier(undefined)).toThrow(TypeError);
    expect(() => assertServiceIdentifier(42)).toThrow(TypeError);
  });

  it('includes the provided label in the error message', () => {
    let caught: unknown;
    try {
      assertServiceIdentifier('bad', 'config.serviceKey');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TypeError);
    expect((caught as Error).message).toContain('config.serviceKey');
    expect((caught as Error).message).toContain('string');
  });

  it('uses default label when none provided', () => {
    let caught: unknown;
    try {
      assertServiceIdentifier(undefined);
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toContain('value');
  });
});
