---
'@gertsai/api-rlr': minor
---

Wave 12.D-fix Teammate A — close 1 CRITICAL + 4 HIGH findings per PRD-036.

**CRIT-1 / FR-001 — moleculer peer-dep gap (Wave-13 pattern #4)**

`dist/index.d.ts:4` imported `Errors` namespace from `moleculer` (because `RateLimitError extends MoleculerError`), but `moleculer` was declared ONLY in `devDependencies`. Consumers installing without moleculer got unresolved type imports. Fix: added `moleculer` to `peerDependencies` (`^0.14.0`) with `peerDependenciesMeta.moleculer.optional: true`.

**FR-002 — `RequestContext` → `RlrRequestContext` rename**

Resolved name collision with `@gertsai/runtime-context.RequestContext` (ADR-007 canonical composition root). Public canonical name: `RlrRequestContext`. Legacy `RequestContext` alias retained with `@deprecated` JSDoc — to be removed in next major.

**FR-003 — `globalThis.__RLR_STORES__` → module-private SHA-256 fingerprint Map**

Replaced the anti-pattern global store cache with module-private `Map<string, RLRRedis>` keyed by SHA-256 fingerprint of identity-affecting fields (mirrors ADR-012 + auth-openfga Wave 6.3 pattern). Eliminates: (a) ESM/CJS dual-build duplicate-state bugs (two factory instances seeing two globals), (b) Vitest worker-isolation issues, (c) serverless cold-start cross-tenant leakage. New `__resetStoreInstancesForTesting()` + `__getStoreInstancesSizeForTesting()` `@internal` helpers for test isolation. `assertSafeKey` rejects `__proto__`/`constructor`/`prototype` (CWE-1321 defense).

**FR-012 / FR-013 / FR-014 — type tightenings**

- `TypedLuaScript<TKeys, TArgs extends readonly any[]>` → `readonly unknown[]`. Same for `TypedScriptManager.register/get`.
- `RateLimitTestUtils.testMiddleware` `next?: any` → `next?: NextFunction`.
- `RateLimiter.checkLimit` removed `store: null as any` dead-code coupling (StrategyExecuteArgs lost the unused `store` field entirely).

**Tests:** +9 new tests (3 export-rename, 5 fingerprint-Map behaviour, 3 type-tightenings). 298/298 pass. Wave-13 regression check: `head -3 dist/index.d.ts` confirms moleculer import is now backed by declared peer-dep.

Refs: PRD-036, EVID-051 (CRIT-1, A-1, A-2, T-1, T-2, T-3), ADR-012.
