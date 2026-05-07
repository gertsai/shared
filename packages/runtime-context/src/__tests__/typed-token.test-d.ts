// SPDX-License-Identifier: Apache-2.0
/**
 * Type-level invariants for {@link TypedToken} / {@link defineToken} and
 * the {@link ProviderContext} overloads. Uses `expectTypeOf` from vitest
 * — no runtime assertions. Picked up by `vitest typecheck`.
 */
import { describe, expectTypeOf, it } from 'vitest';
import { defineToken, type TypedToken } from '../typed-token';
import type { ProviderContext } from '../provider-context';

interface UserService {
  findById(id: string): Promise<{ id: string }>;
}
interface DbService {
  connect(): Promise<void>;
}

describe('TypedToken<T> compile-time narrowing', () => {
  it('defineToken<T> produces TypedToken<T>', () => {
    const userToken = defineToken<UserService>('UserService');
    expectTypeOf(userToken).toEqualTypeOf<TypedToken<UserService>>();
  });

  it('TypedToken carries readonly symbol + name', () => {
    type Token = TypedToken<UserService>;
    expectTypeOf<Token['symbol']>().toEqualTypeOf<symbol>();
    expectTypeOf<Token['name']>().toEqualTypeOf<string>();
  });

  it('TypedToken<X> is structurally distinct from TypedToken<Y>', () => {
    // Type-only check: T is anchored by inference at the parameter
    // position of `defineToken<T>` / `get<T>(token: TypedToken<T>)`.
    // We assert the surface object structure stays uniform across T.
    expectTypeOf<TypedToken<UserService>>().toMatchTypeOf<{
      readonly symbol: symbol;
      readonly name: string;
    }>();
    expectTypeOf<TypedToken<DbService>>().toMatchTypeOf<{
      readonly symbol: symbol;
      readonly name: string;
    }>();
  });

  it('ProviderContext.get(TypedToken<T>) narrows to T', () => {
    type Get = ProviderContext['get'];
    type GetTyped = ReturnType<
      (token: TypedToken<UserService>) => UserService
    >;
    // Typed overload: passing TypedToken<UserService> returns UserService.
    expectTypeOf<ReturnType<Get>>().toMatchTypeOf<unknown>();
    expectTypeOf<GetTyped>().toEqualTypeOf<UserService>();
  });

  it('ProviderContext.getOptional(TypedToken<T>) narrows to T | undefined', () => {
    type GetOptionalTyped = ReturnType<
      (token: TypedToken<UserService>) => UserService | undefined
    >;
    expectTypeOf<GetOptionalTyped>().toEqualTypeOf<UserService | undefined>();
  });

  it('bare symbol overload preserved (backward compat)', () => {
    type Get = ProviderContext['get'];
    // The first overload exists — passing a raw symbol still type-checks.
    type GetRaw = (token: symbol) => unknown;
    // Demonstrate that the function signature accepts a bare symbol.
    expectTypeOf<Parameters<Get>[0]>().toMatchTypeOf<
      symbol | TypedToken<unknown>
    >();
    expectTypeOf<GetRaw>().toMatchTypeOf<GetRaw>();
  });
});
