// SPDX-License-Identifier: Apache-2.0

/**
 * Module-private brand symbol — `Symbol(...)`, NOT `Symbol.for(...)`, per
 * Sprint 3.8 I-11 (CWE-1321 prevention). External code cannot mint a value
 * carrying this brand because the symbol is not reachable through the
 * registry.
 */
const TYPED_TOKEN_BRAND: unique symbol = Symbol('typed-token');

/**
 * Type-narrowing wrapper for DI tokens used with
 * {@link ProviderContext.get} / {@link ProviderContext.getOptional}.
 *
 * The required brand `[TYPED_TOKEN_BRAND]: true` is the sole runtime
 * discriminator (per ADR-010 Amendment 1 §I-12). The type parameter `T`
 * exists only at compile time — TypeScript infers it from parameter
 * position `get<T>(token: TypedToken<T>): T`, so no anchor field is
 * required (and an optional `__phantom_T__?: T` would be covariant under
 * `strict`, not invariant).
 */
// `T` is intentionally unused at runtime — TypeScript infers it from the
// `defineToken<T>` / `get<T>(token: TypedToken<T>)` parameter positions.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface TypedToken<T> {
  readonly symbol: symbol;
  readonly name: string;
  readonly [TYPED_TOKEN_BRAND]: true;
}

/**
 * Build a typed token. Each call mints a unique module-private `Symbol`
 * — calling `defineToken<X>('foo')` twice yields two structurally
 * distinct tokens. The returned object is `Object.freeze`-wrapped so
 * downstream code cannot mutate the brand or symbol after creation.
 *
 * @example
 * ```ts
 * interface UserService { findById(id: string): Promise<User>; }
 * const USER_TOKEN = defineToken<UserService>('UserService');
 * ctx.providers.register(USER_TOKEN.symbol, userServiceImpl);
 * const userSvc = ctx.providers.get(USER_TOKEN); // typed: UserService
 * ```
 */
export function defineToken<T>(name: string): TypedToken<T> {
  return Object.freeze({
    symbol: Symbol(`@gertsai/runtime-context:user-token:${name}`),
    name,
    [TYPED_TOKEN_BRAND]: true as const,
  }) as TypedToken<T>;
}

/**
 * Brand-check predicate. Uses `Object.prototype.hasOwnProperty.call`
 * (NOT prototype-walking property access) so Object.prototype pollution
 * cannot bypass the check.
 */
export function isTypedToken(value: unknown): value is TypedToken<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.prototype.hasOwnProperty.call(value, TYPED_TOKEN_BRAND)
  );
}
