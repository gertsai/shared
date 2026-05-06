// SPDX-License-Identifier: Apache-2.0
import { ProviderNotFoundError } from './errors.js';

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
 */
export interface ProviderContext {
  get<T>(token: symbol): T;
  getOptional<T>(token: symbol): T | undefined;
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

  get<T>(token: symbol): T {
    assertSymbolToken(token);
    const found = this._lookup<T>(token);
    if (found === undefined) {
      throw new ProviderNotFoundError({
        message: `Provider not bound for token ${this._tokenLabel(token)}`,
        details: { token: this._tokenLabel(token) },
      });
    }
    return found;
  }

  getOptional<T>(token: symbol): T | undefined {
    assertSymbolToken(token);
    return this._lookup<T>(token);
  }

  private _lookup<T>(token: symbol): T | undefined {
    if (this._bindings.has(token)) {
      return this._bindings.get(token) as T;
    }
    if (this._resolver !== undefined) {
      return this._resolver<T>(token);
    }
    return undefined;
  }

  private _tokenLabel(token: symbol): string {
    return token.description ?? token.toString();
  }
}
