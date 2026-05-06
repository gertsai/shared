// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  DefaultProviderContext,
  requestContextIdentifier,
} from '../provider-context.js';
import { ProviderNotFoundError } from '../errors.js';

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
});
