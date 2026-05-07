// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  DefaultProviderContext,
  requestContextIdentifier,
} from '../provider-context.js';
import { ProviderNotFoundError } from '../errors.js';
import { defineToken } from '../typed-token.js';

interface UserService {
  findById(id: string): Promise<{ id: string }>;
}

const TOKEN_A = Symbol.for('test:a');
const TOKEN_B = Symbol.for('test:b');

describe('DefaultProviderContext', () => {
  it('get<T> resolves Map binding', () => {
    const ctx = new DefaultProviderContext({
      bindings: new Map<symbol, unknown>([[TOKEN_A, 'value-a']]),
    });
    expect(ctx.get<string>(TOKEN_A)).toBe('value-a');
  });

  it('get<T> falls back to resolver on Map miss', () => {
    const ctx = new DefaultProviderContext({
      resolver: <T>(token: symbol): T | undefined => {
        if (token === TOKEN_B) return 'value-b' as unknown as T;
        return undefined;
      },
    });
    expect(ctx.get<string>(TOKEN_B)).toBe('value-b');
  });

  it('get<T> throws ProviderNotFoundError when neither binds', () => {
    const ctx = new DefaultProviderContext({});
    expect(() => ctx.get<unknown>(TOKEN_A)).toThrow(ProviderNotFoundError);
  });

  it('getOptional returns undefined when not bound', () => {
    const ctx = new DefaultProviderContext({});
    expect(ctx.getOptional<unknown>(TOKEN_A)).toBeUndefined();
  });

  it('getOptional returns the bound value', () => {
    const ctx = new DefaultProviderContext({
      bindings: new Map<symbol, unknown>([[TOKEN_A, 1]]),
    });
    expect(ctx.getOptional<number>(TOKEN_A)).toBe(1);
  });

  it('rejects non-symbol token in get<T> with TypeError (ADR-007 I-17)', () => {
    const ctx = new DefaultProviderContext({});
    expect(() =>
      ctx.get<unknown>('string-token' as unknown as symbol),
    ).toThrow(TypeError);
  });

  it('rejects non-symbol token in getOptional<T> with TypeError', () => {
    const ctx = new DefaultProviderContext({});
    expect(() =>
      ctx.getOptional<unknown>(123 as unknown as symbol),
    ).toThrow(TypeError);
  });

  it('Map bindings take precedence over resolver', () => {
    const ctx = new DefaultProviderContext({
      bindings: new Map<symbol, unknown>([[TOKEN_A, 'from-map']]),
      resolver: () => 'from-resolver',
    });
    expect(ctx.get<string>(TOKEN_A)).toBe('from-map');
  });

  it('exports requestContextIdentifier as a stable Symbol.for', () => {
    expect(typeof requestContextIdentifier).toBe('symbol');
    expect(requestContextIdentifier.toString()).toContain(
      '@gertsai/runtime-context:RequestContext',
    );
  });

  describe('TypedToken<T> overloads (Sprint 3.10 / ADR-010 §D)', () => {
    it('get(TypedToken<T>) resolves binding via token.symbol', () => {
      const USER_TOKEN = defineToken<UserService>('UserService');
      const stub: UserService = {
        findById: async (id: string) => ({ id }),
      };
      const ctx = new DefaultProviderContext({
        bindings: new Map<symbol, unknown>([[USER_TOKEN.symbol, stub]]),
      });
      expect(ctx.get(USER_TOKEN)).toBe(stub);
    });

    it('get(TypedToken<T>) does NOT throw TypeError (assertSymbolToken extraction path)', () => {
      const USER_TOKEN = defineToken<UserService>('UserService');
      const stub: UserService = {
        findById: async (id: string) => ({ id }),
      };
      const ctx = new DefaultProviderContext({
        bindings: new Map<symbol, unknown>([[USER_TOKEN.symbol, stub]]),
      });
      expect(() => ctx.get(USER_TOKEN)).not.toThrow(TypeError);
    });

    it('getOptional(TypedToken<T>) returns undefined on miss', () => {
      const USER_TOKEN = defineToken<UserService>('UserService');
      const ctx = new DefaultProviderContext({});
      expect(ctx.getOptional(USER_TOKEN)).toBeUndefined();
    });

    it('getOptional(TypedToken<T>) returns the bound value', () => {
      const USER_TOKEN = defineToken<UserService>('UserService');
      const stub: UserService = {
        findById: async (id: string) => ({ id }),
      };
      const ctx = new DefaultProviderContext({
        bindings: new Map<symbol, unknown>([[USER_TOKEN.symbol, stub]]),
      });
      expect(ctx.getOptional(USER_TOKEN)).toBe(stub);
    });

    it('get(TypedToken<T>) throws ProviderNotFoundError when unbound', () => {
      const USER_TOKEN = defineToken<UserService>('UserService');
      const ctx = new DefaultProviderContext({});
      expect(() => ctx.get(USER_TOKEN)).toThrow(ProviderNotFoundError);
    });

    it('raw symbol callers continue to work (backward compat)', () => {
      const RAW = Symbol.for('test:raw');
      const ctx = new DefaultProviderContext({
        bindings: new Map<symbol, unknown>([[RAW, 'raw-value']]),
      });
      expect(ctx.get<string>(RAW)).toBe('raw-value');
    });

    it('falls back to resolver via token.symbol', () => {
      const USER_TOKEN = defineToken<UserService>('UserService');
      const stub: UserService = {
        findById: async (id: string) => ({ id }),
      };
      const ctx = new DefaultProviderContext({
        resolver: <T>(token: symbol): T | undefined => {
          if (token === USER_TOKEN.symbol) return stub as unknown as T;
          return undefined;
        },
      });
      expect(ctx.get(USER_TOKEN)).toBe(stub);
    });
  });
});
