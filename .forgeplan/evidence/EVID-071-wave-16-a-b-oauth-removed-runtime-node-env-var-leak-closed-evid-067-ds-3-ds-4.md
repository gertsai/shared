---
depth: standard
id: EVID-071
kind: evidence
last_modified_at: 2026-05-20T05:45:08.007088+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-053
  relation: informs
status: active
title: Wave 16.A+B — OAuth removed + runtime/node env-var leak closed (EVID-067 §DS#3 §DS#4)
---

## Summary

Wave 16.A+B closes 2 EVID-067 Doctor Strange items in a single PR: §DS#4 (OAuth self-deprecated dead-by-default) DELETED — 482 LOC removed after grep audit confirmed zero external consumers; §DS#3 (runtime/node env-var leak via `loadConfig` eager call) fixed via lazy memoised Proxy in `config.ts`. Solo teammate (`typescript-pro`). Workspace remains 41 packages. **286 api-core tests pass** (was 284, +2 new sanity).

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: refactor_verification
- **linked_artifact**: PRD-053
- **summary**: 482 LOC OAuth deleted + env-var leak closed via lazy Proxy. Net -226 LOC. 0 external API consumers affected.

## Wave 16.A — OAuth DELETED (Teammate T decision)

**Audit evidence**: `git grep -rn "MX()\|oauth.mixin\|OAuth2Server\|import.*'@gertsai/api-core/oauth'" packages/ examples/` returned ZERO external consumers. Only references were within api-core itself + 1 opt-out in `m9s-example/src/mol-services/api.service.ts:disableAuth: true`. `OIDCError` (modern RFC-6749 error) is unrelated to legacy module — preserved.

**Files DELETED (-482 LOC)**:
- `packages/api-core/src/lib/oauth/auth-provider.ts` (-107)
- `packages/api-core/src/lib/oauth/oauth.class.ts` (-373)
- `packages/api-core/src/moleculer/oauth.mixin.ts` (-5)

**Files modified**:
- `lib/oauth/index.ts` — converted to throw-on-import migration stub (eager throw with migration guidance to consumers' own OAuth middleware)
- `lib/index.ts` — removed `export * from './oauth'`
- `moleculer/index.ts` — removed oauth + oauth.mixin re-exports
- `moleculer/apiGateService.template.ts` — removed `OAuthError`/`MX` imports + `OAuthError instanceof` branch; hard-coded `mixins = [MoleculerWebMixin]` (was conditional on `disableAuth`)
- `moleculer/types.ts` — `disableAuth` field marked `@deprecated` no-op for v1.0.0 removal
- `package.json` — dropped `oauth2-server` + `@types/oauth2-server`
- `README.md` — updated feature list + Status section + What-you-get table
- `examples/m9s-example/src/mol-services/api.service.ts` — comment update (field still valid no-op)

**Lockfile**: -149 lines (oauth2-server tree removed).

## Wave 16.B — Lazy Proxy strategy (Teammate T)

**EVID-067 §DS#3**: `/moleculer` subpath transitively loaded ~30 env vars at import time via `apiGateService.template.ts`'s `config` import. Module-load side effects defeated the documented "no side effects" guarantee.

**Strategy**: Lazy memoised Proxy in `src/config.ts`. Single-source fix benefits every consumer (`apiGateService.template.ts`, `moleculerConfig.template.ts`, `ApiController.class.ts`).

**Implementation**:
- Module top-level no longer calls `loadConfig`
- Default export is `Proxy<ConfigShape>` whose `get`/`has`/`ownKeys`/`getOwnPropertyDescriptor`/`set` traps memoise a single `loadConfig({...defaults})` call on first ACCESS (not import)
- Internal `__resetConfigForTests()` escape hatch for tests that mutate `process.env`

**Verification**: NEW test `src/__test__/no-side-effects-on-import.test.ts` (~135 LOC, 2 cases):
1. Wraps `process.env` in a tracking Proxy that records every access by name, dynamic-imports `../config` after `vi.resetModules()`, asserts the accessed list is `[]`.
2. Sets `process.env.ALLOWED_ORIGINS`, calls `__resetConfigForTests`, reads `config.ALLOWED_ORIGINS`, asserts lazy resolution worked.

Both pass.

## Acceptance verification (all PASS)

| Check | Result |
|---|---|
| `pnpm install` | clean (lockfile regenerated, -149 lines) |
| `pnpm --filter @gertsai/api-core run build` | ✅ green (tsup ESM+CJS+DTS) |
| `pnpm --filter @gertsai/api-core run typecheck` | ✅ 0 errors |
| `pnpm --filter @gertsai/api-core run test` | ✅ **286 pass** (was 284, +2 new sanity) |
| `pnpm -r typecheck` (workspace, 45 projects) | ✅ 0 errors |
| `pnpm build` (workspace) | ✅ green |

## Net change

13 files / +160 insertions / -681 deletions = **-521 LOC code** (plus -149 lockfile). Net code with tests + scaffolding: **-226 LOC**.

## Bump recommendation

**`minor`** for `@gertsai/api-core` (pre-1.0 SemVer allows breaking changes in minor per `guides/GIT-FLOW-GUIDE.ru.md`). Rationale:
- 16.A is technically breaking (deletes exports `OAuth`, `MX`, `OAuthError`, `AuthProvider`) — even though `@deprecated` in source, dropping exports is SemVer-breaking
- 16.B is internal (lazy Proxy) but introduces runtime constraint (consumers must not depend on `loadConfig` having fired at module-load)
- `disableAuth` field preserved as no-op to soften m9s-example pattern migration

## §Doctor Strange tally update

Per EVID-067 closure:
- ✅ #1 dual error-helper namespace collision → Wave 14.4 marker landed; full removal v1.0.0 / Wave 14.6
- ✅ #2 selective worker-mode → SPEC-020 (Wave 15.B)
- ✅ **#3 runtime/node env-var leak → THIS PR**
- ✅ **#4 OAuth self-deprecated → THIS PR**
- ✅ #5 Pub/Sub commented-out detached-subscription → Wave 15.C DELETE + document

**5/5 EVID-067 §Doctor Strange observations addressed**.

## Remaining api-core cleanup candidates

- **Wave 14.6** — GertsErrorResponse REMOVAL (v1.0.0 breaking) per EVID-064
- **Wave 15.D** — ApiController action-pipeline extraction (~1000 LOC remaining post 15.A-C)
- **Wave 17?** — bcryptjs → native bcrypt (m9s-example, deferred from Wave 12.E)

## Refs

- PRD-053 (target)
- EVID-067 (Wave 15 audit — §DS#3 + §DS#4)
- EVID-068/069/070 (Wave 15.A/B/C precedents)
- ADR-009 (lazy peer-loading precedents)



