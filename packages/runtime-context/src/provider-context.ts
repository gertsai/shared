// SPDX-License-Identifier: Apache-2.0
import { ProviderNotFoundError } from './errors.js';
import { isTypedToken, type TypedToken } from './typed-token.js';

/**
 * Initialiser for {@link DefaultProviderContext}. Bindings take precedence
 * over `resolver`; if neither resolves a token, `get<T>` throws.
 */
export interface ProviderContextInit {
  readonly resolver?: <T>(token: symbol) => T | undefined;
  readonly bindings?: ReadonlyMap<symbol, unknown>;
}

/**
 * DI-aware lookup surface exposed via {@link RequestContext.providers}.
 *
 * Tokens MUST be `symbol` per ADR-007 I-17 — strings are rejected at
 * runtime to mitigate type confusion (CWE-843). Consumers that need a
 * named token MUST wrap via `Symbol.for('<package>:<name>')` at the call
 * site so the surface area for accidental collisions is compile-time-known.
 *
 * For typed lookups without `unknown` casts, prefer the {@link TypedToken}
 * overloads (Sprint 3.10 / ADR-010 §D). Overload order: bare `symbol`
 * FIRST, `TypedToken<T>` SECOND — TypeScript resolves overloads by
 * declaration order, and a `TypedToken` value is structurally an `object`
 * (not assignable to bare `symbol`), so the typed overload wins for any
 * `TypedToken` argument while raw `symbol` callers continue to match the
 * first overload (returning `T = unknown` unless caller annotates).
 */
export interface ProviderContext {
  get<T>(token: symbol): T;
  get<T>(token: TypedToken<T>): T;
  getOptional<T>(token: symbol): T | undefined;
  getOptional<T>(token: TypedToken<T>): T | undefined;
}

/**
 * Stable identifier for storing a {@link RequestContext} in a DI-style
 * binding map. Mirrors the convention established by
 * `@gertsai/storage-core` (`storageProviderIdentifier`).
 */
export const requestContextIdentifier = Symbol.for(
  '@gertsai/runtime-context:RequestContext',
);

function assertSymbolToken(token: unknown): asserts token is symbol {
  if (typeof token !== 'symbol') {
    throw new TypeError(
      `ProviderContext token must be symbol; received ${typeof token}`,
    );
  }
}

/**
 * Default {@link ProviderContext} backed by an immutable Map of bindings
 * and an optional resolver function. Bindings are consulted first; on a
 * miss the resolver is invoked. Both legs may produce `undefined`, which
 * `get<T>` translates into {@link ProviderNotFoundError}.
 */
export class DefaultProviderContext implements ProviderContext {
  private readonly _bindings: ReadonlyMap<symbol, unknown>;
  private readonly _resolver?: <T>(token: symbol) => T | undefined;

  constructor(init: ProviderContextInit) {
    this._bindings = init.bindings ?? new Map<symbol, unknown>();
    if (init.resolver !== undefined) {
      this._resolver = init.resolver;
    }
  }

  get<T>(token: symbol): T;
  get<T>(token: TypedToken<T>): T;
  get<T>(token: symbol | TypedToken<T>): T {
    // Extract `.symbol` from TypedToken BEFORE assertSymbolToken (per
    // ADR-010 I-13 — without this branch the existing TypeError guard
    // rejects every TypedToken caller).
    const sym = isTypedToken(token) ? token.symbol : token;
    assertSymbolToken(sym);
    const result = this._lookup(sym);
    if (!result.present) {
      throw new ProviderNotFoundError({
        message: `Provider not bound for token ${this._tokenLabel(sym)}`,
        details: { token: this._tokenLabel(sym) },
      });
    }
    return result.value as T;
  }

  getOptional<T>(token: symbol): T | undefined;
  getOptional<T>(token: TypedToken<T>): T | undefined;
  getOptional<T>(token: symbol | TypedToken<T>): T | undefined {
    const sym = isTypedToken(token) ? token.symbol : token;
    assertSymbolToken(sym);
    const result = this._lookup(sym);
    return result.present ? (result.value as T) : undefined;
  }

  /**
   * Discriminated lookup result — `present: true` means the binding (or
   * resolver) returned a value, even when that value is `undefined`.
   * Wave 26 (EVID-080 H2): without this discriminator, `get` could not
   * distinguish "bound to undefined" from "not bound" and threw
   * `ProviderNotFoundError` in both cases.
   */
  private _lookup(token: symbol): { present: boolean; value: unknown } {
    if (this._bindings.has(token)) {
      return { present: true, value: this._bindings.get(token) };
    }
    if (this._resolver !== undefined) {
      const resolved = this._resolver<unknown>(token);
      if (resolved !== undefined) {
        return { present: true, value: resolved };
      }
    }
    return { present: false, value: undefined };
  }

  private _tokenLabel(token: symbol): string {
    return token.description ?? token.toString();
  }
}
