---
'@gertsai/runtime-context': minor
---

Sprint 3.10 — `TypedToken<T>` wrapper for `ProviderContext.get<T>(token)`.

NEW additive API in `@gertsai/runtime-context`:

- `defineToken<T>(name: string): TypedToken<T>` — type-narrowing wrapper around module-private `Symbol(...)` (NOT `Symbol.for` per CWE-1321 prevention). Returned object is `Object.freeze`-wrapped.
- `isTypedToken(value): value is TypedToken<unknown>` — brand-check predicate using `Object.prototype.hasOwnProperty.call` (NOT prototype-walking — Object.prototype pollution-resistant).
- `TypedToken<T>` interface — `{ symbol, name, [TYPED_TOKEN_BRAND]: true }`. Required brand is sole runtime discriminator (no phantom field per ADR-010 Amendment 1 §I-12 — optional readonly fields are covariant under TS `strict`, do not anchor invariance).

`ProviderContext.get<T>` and `getOptional<T>` gain `TypedToken<T>` overloads (existing `symbol` overloads preserved). `DefaultProviderContext` extracts `.symbol` from TypedToken BEFORE existing `assertSymbolToken(sym)` guard per Amendment 1 §I-13:

```typescript
const sym = isTypedToken(token) ? token.symbol : token;
assertSymbolToken(sym);
```

Without this branch, `assertSymbolToken` would throw `TypeError` for any TypedToken caller.

Quickstart:

```typescript
import { defineToken } from '@gertsai/runtime-context';

interface UserService { findById(id: string): Promise<User>; }
const USER_TOKEN = defineToken<UserService>('UserService');

ctx.providers.register(USER_TOKEN.symbol, userServiceImpl);
const userSvc = ctx.providers.get(USER_TOKEN); // typed: UserService (not unknown)
```

Mitigates Sprint 3.7 R-2 token type-erasure risk. Backward compat: existing `symbol`-keyed callers continue to work unchanged.

Refs ADR-010 §D (revised) + Amendment 1 §A1.4 + §I-12 (brand-only discrimination) + §I-13 (assertSymbolToken extraction).
