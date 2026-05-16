---
depth: standard
id: EVID-045
kind: evidence
last_modified_at: 2026-05-16T17:16:15.400636+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-029
  relation: informs
status: active
title: Wave 12.B-fix-1 — both CRITICAL leaks closed, both packages green
---

# EVID-045 — Wave 12.B-fix-1 closure evidence

Both CRITICAL findings from EVID-044 closed by 2 parallel teammates per RFC-020. All invariants satisfied. Both packages production-ready for minor bump 0.2.0 → 0.3.0.

## Structured Fields

- **verdict:** `supports` — the published `dist/index.d.ts` for `@gertsai/fetch` AND `@gertsai/m9s-cache` no longer import external library types at root. Optional-peer-dep contract restored for m9s-cache (root import works without moleculer/ioredis installed). Both packages pass full test + typecheck after fix.
- **congruence_level:** `CL3` — same target system, internal validation via direct file inspection of emitted artefacts + vitest run + typecheck + downstream consumer build.
- **evidence_type:** `test_result` — combined automated (vitest + tsc + tsup) and manual (head -3 dist/*.d.ts, grep require) verification.
- **R_eff per-finding:** `1.0 - 0.0 = 1.0`. Threshold ≥ 0.5; passes activation.
- **Wallclock:** ~25 min total — 5 min orchestrator pre-seed + ~12 min parallel teammate work (longest of the two finished in ~6.5 min, shortest in ~3.8 min) + 5 min downstream m9s-example patch + 3 min smoke build.

## Verification matrix

| Check | @gertsai/fetch | @gertsai/m9s-cache |
|---|---|---|
| `head -3 dist/index.d.ts` no `from 'undici'` | ✅ confirmed | n/a |
| `head -3 dist/index.d.ts` no `from 'moleculer'` | n/a | ✅ confirmed |
| `head -3 dist/index.d.ts` no `from 'ioredis'` | n/a | ✅ confirmed |
| `head -3 dist/moleculer.d.ts` imports moleculer | n/a | ✅ confirmed |
| `head -3 dist/redis.d.ts` imports ioredis | n/a | ✅ confirmed |
| Module-top `require('moleculer')` removed | n/a | ✅ confirmed (`grep` empty) |
| Lazy `getMoleculer()` in function body only | n/a | ✅ Proxy-construct pattern in `dist/moleculer.js` |
| Tests pass | ✅ 64/64 | ✅ 106/106 |
| Typecheck clean | ✅ | ✅ |
| `pnpm build` full monorepo green | ✅ | ✅ |
| Downstream `m9s-example` compiles | ✅ (no fetch usage) | ✅ (imports updated to `/moleculer` + `/redis`) |
| Manual smoke (moleculer-missing) | n/a | ✅ root import succeeds, `new M9sCacheCacher()` throws contextual error |
| No `.forgeplan/` mutated via shell | ✅ MCP only | ✅ MCP only |
| LOC budget | ✅ +94 (≤150) | ✅ +~280 (≤350) |
| Out-of-scope files untouched | ✅ only `packages/fetch/**` | ✅ only `packages/m9s-cache/**` (orchestrator handled m9s-example separately per RFC-020 D-5) |

## Files changed

**@gertsai/fetch (Teammate A):**
- M `packages/fetch/src/lib/types.ts` — removed `import type { Response, RequestInit } from 'undici'`; replaced `ResponseLike extends Pick<Response, ...>` with explicit 8-property interface; replaced `RequestOptions extends Omit<RequestInit, 'headers'>` with explicit interface; added local `RequestBody` union for `resolveBody`
- M `packages/fetch/src/fetchers/undiciFetcher.ts` — removed `import type { RequestInit } from 'undici'`; replaced `UndiciRequestOptions = Parameters<typeof request>[1]` with structural interface; runtime value imports of `Headers, FormData, request` retained (bundler-external — do not appear in `.d.ts`); single boundary cast `options as unknown as Parameters<typeof request>[1]` at the `request()` call site; `globalThis.Headers` used in `UndiciRequestOptions.headers` to disambiguate from value-imported `Headers`
- Net delta: +94 LOC / -44 LOC = +50 net

**@gertsai/m9s-cache (Teammate B):**
- A `packages/m9s-cache/src/moleculer.ts` — new barrel re-exporting moleculer-coupled symbols
- A `packages/m9s-cache/src/redis.ts` — new barrel re-exporting ioredis/redlock-coupled symbols
- M `packages/m9s-cache/src/index.ts` — stripped 19 moleculer/ioredis-coupled exports; retained 27 backend-agnostic
- M `packages/m9s-cache/src/moleculer-cacher.ts` — lazy `getMoleculer()` + `getM9sCacheCacherClass()` factories; `M9sCacheCacher` now a `Proxy` whose `construct` trap reads `Moleculer.Cachers.Base` on first instantiation; `MODULE_NOT_FOUND` → contextual install hint
- M `packages/m9s-cache/package.json` — added `./moleculer` + `./redis` to `exports`; added `typesVersions` block per Sprint 3.0.1 F-4 pattern
- M `packages/m9s-cache/tsup.config.ts` — added `moleculer` and `redis` entries
- Net delta: ~+280 LOC / -25 LOC (new barrels + Proxy pattern dominate)

**Orchestrator (Phase 4 — downstream):**
- M `examples/m9s-example/moleculer.config.ts:32-33` — split single root import into 3 imports: `MemoryCacheDriver` from root, `M9sCacheCacher` from `/moleculer`, `RedisCacheDriver + RedisLike` from `/redis`. Patch bump on m9s-example per changeset.

**Changesets (2):**
- `.changeset/wave-12-b-fix-1-fetch-undici-leak.md` — `@gertsai/fetch: minor`
- `.changeset/wave-12-b-fix-1-m9s-cache-subpath-split.md` — `@gertsai/m9s-cache: minor` + `@gertsai-examples/m9s-example: patch`

## Cross-validation

- **Invariant I-1 (file ownership):** confirmed by `git status` — `packages/fetch/**` mutations are Teammate A's; `packages/m9s-cache/**` mutations are Teammate B's; `examples/m9s-example/moleculer.config.ts` mutation is orchestrator's (Phase 4 per RFC-020 D-5). No cross-contamination.
- **Invariant I-2 (no externals at root):** explicitly verified via `head -3 dist/index.d.ts` on both packages.
- **Invariant I-3 (subpath barrels work):** `dist/moleculer.d.ts` and `dist/redis.d.ts` emitted for m9s-cache; their content references external types correctly (downstream consumers who want moleculer use `@gertsai/m9s-cache/moleculer`; ioredis users use `/redis`).
- **Invariant I-4 (back-compat for fetch value-level):** type NAMES preserved — `RequestOptions`, `UndiciRequestOptions`, `ResponseLike` continue to accept the documented shapes. Two additive exports (`RequestBody`, `UndiciResolvedBody`) introduced.
- **Invariant I-5 (no module-top require in m9s root):** `grep "require.*moleculer" dist/index.js` returns empty.
- **Invariant I-6 (tests pass):** 64 + 106 = 170/170 across both packages.
- **Invariant I-7 (forgeplan MCP discipline):** PRD-029 + RFC-020 + EVID-045 all written via MCP `forgeplan_update`.

## Suggested follow-up

Per EVID-044 §"Suggested follow-up wave structure":

- **Wave 12.B-fix-2 (HIGH security closures):** URL-validator DNS-rebinding TOCTOU, AbortSignal wiring, validateKeys default inversion, RedlockLockProvider error surfacing, runBatch transaction wrapping, fetch body-size limit. ~1.5 days, ~150 LOC.
- **Wave 12.B-fix-3 (HIGH type-system closures):** collection `any` → `unknown`, brand factory validation, collection typesVersions, ws-rpc Node-only headers split. ~1 day, ~100 LOC.

These are tracked in EVID-044 but NOT consumed by this PRD-029. New PRDs will close them.

## Refs

- PRD-029 — Wave 12.B-fix-1 (this evidence informs it)
- RFC-020 — execution strategy
- EVID-044 — sources of the 2 CRITICAL items
- PRD-027 + EVID-043 — Wave 13 precedent (same-pattern surgical fix)
- Sprint 3.0.1 F-4 — typesVersions pattern (mirrored)



