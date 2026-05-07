// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { defineToken, isTypedToken } from '../typed-token.js';

interface UserService {
  findById(id: string): Promise<{ id: string }>;
}

describe('defineToken', () => {
  it('mints a unique TypedToken on each call (different symbol even with same name)', () => {
    const a = defineToken<UserService>('UserService');
    const b = defineToken<UserService>('UserService');
    expect(a).not.toBe(b);
    expect(a.symbol).not.toBe(b.symbol);
    expect(a.name).toBe('UserService');
    expect(b.name).toBe('UserService');
  });

  it('returns a frozen object', () => {
    const token = defineToken<UserService>('UserService');
    expect(Object.isFrozen(token)).toBe(true);
  });

  it('symbol description encodes the package + name', () => {
    const token = defineToken<UserService>('UserService');
    expect(token.symbol.description).toBe(
      '@gertsai/runtime-context:user-token:UserService',
    );
  });

  it('symbol is module-private (not registered with Symbol.for)', () => {
    const token = defineToken<UserService>('UserService');
    // Symbol.for would return the registry-shared symbol; defineToken's
    // private Symbol(...) must NOT be reachable through the registry.
    const fromRegistry = Symbol.for(token.symbol.description ?? '');
    expect(token.symbol).not.toBe(fromRegistry);
  });
});

describe('isTypedToken', () => {
  it('returns true for tokens minted by defineToken', () => {
    const token = defineToken<UserService>('UserService');
    expect(isTypedToken(token)).toBe(true);
  });

  it('returns false for raw symbols', () => {
    expect(isTypedToken(Symbol('raw'))).toBe(false);
    expect(isTypedToken(Symbol.for('raw-shared'))).toBe(false);
  });

  it('returns false for null / undefined / primitives', () => {
    expect(isTypedToken(null)).toBe(false);
    expect(isTypedToken(undefined)).toBe(false);
    expect(isTypedToken(42)).toBe(false);
    expect(isTypedToken('string')).toBe(false);
    expect(isTypedToken(true)).toBe(false);
  });

  it('returns false for forged objects lacking the brand', () => {
    const forged = { symbol: Symbol('forged'), name: 'Forged' };
    expect(isTypedToken(forged)).toBe(false);
  });

  it('returns false for plain objects (no Object.prototype pollution bypass)', () => {
    // Even if Object.prototype were polluted with a brand-shaped key,
    // hasOwnProperty.call would still inspect the value's OWN keys.
    // Module-private brand symbol is not reachable from test code, so
    // pollution attempts cannot mint the right key — this fixture
    // exercises the structural-rejection path.
    expect(isTypedToken({})).toBe(false);
    expect(isTypedToken(Object.create(null))).toBe(false);

    // Pollute prototype with a string-keyed analogue and verify check
    // remains false — the brand is a Symbol, not a string key, so this
    // pollution is structurally inert; the test documents the property.
    const prototypeProto = Object.prototype as unknown as Record<
      string,
      unknown
    >;
    const polluted = '__typed-token__';
    prototypeProto[polluted] = true;
    try {
      expect(isTypedToken({})).toBe(false);
      expect(isTypedToken({ symbol: Symbol('x'), name: 'x' })).toBe(false);
    } finally {
      delete prototypeProto[polluted];
    }
  });

  it('rejects an object that copies known fields but not the brand', () => {
    const real = defineToken<UserService>('UserService');
    const clone = { symbol: real.symbol, name: real.name };
    expect(isTypedToken(clone)).toBe(false);
  });
});
