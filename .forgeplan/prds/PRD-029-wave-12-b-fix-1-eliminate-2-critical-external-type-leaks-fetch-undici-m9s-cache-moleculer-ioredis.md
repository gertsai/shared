---
depth: standard
id: PRD-029
kind: prd
last_modified_at: 2026-05-16T17:02:26.109994+00:00
last_modified_by: claude-code/2.1.142
links:
- target: EVID-044
  relation: based_on
status: active
title: Wave 12.B-fix-1 — eliminate 2 CRITICAL external-type-leaks (fetch undici, m9s-cache moleculer/ioredis)
---

# PRD-029 — Wave 12.B-fix-1 — eliminate 2 CRITICAL external-type-leaks

## Target Audience

- **Primary:** downstream npm consumers of `@gertsai/fetch` and `@gertsai/m9s-cache` (internal services in `gertsai_codex`, `GertsHub`, and any future external consumers via GitHub Packages). They suffer from the leaks today via `tsc` resolution overhead and a hard crash on `import { CacheStore } from '@gertsai/m9s-cache'` without moleculer.
- **Secondary:** maintainers of `@gertsai/*` substrate — Wave-13 pattern recurred in 2 packages; this PRD closes the loop on the audit (EVID-044) and demonstrates the canonical fix-pattern for future similar findings.
- **Tertiary:** Wave 12.B-fix-2 + 12.B-fix-3 teams — this PRD's RFC-020 (subpath split + lazy `createRequire`) establishes the pattern they will inherit for HIGH-severity follow-ups.

## Problem Statement

EVID-044 surfaced **2 CRITICAL** findings via Wave 12.B audit:

1. **`@gertsai/fetch@0.2.0`** — published `dist/index.d.ts:1` does `import { RequestInit, Response, request } from 'undici';` because the root re-exports `UndiciRequestOptions = Parameters<typeof request>[1]` and `RequestOptions extends Omit<RequestInit, 'headers'>`. Every downstream `tsc` invocation must resolve undici's full type surface. Version-pin drift between consumer's `undici` and fetch's pinned `^7.2.3` breaks structural compatibility on `RequestInit`. This is exactly the Wave-13 pattern that broke m9s-example after Wave 13 `defineAction` tightening.

2. **`@gertsai/m9s-cache@0.2.0`** — root barrel `packages/m9s-cache/src/index.ts` re-exports `M9sCacheCacher`, `moleculerDbCacheMixin`, `CacheEnabledService`, `CacheEnabledBroker`, `EntityChangedHandler` — all moleculer-typed. `dist/index.d.ts:1-2` imports from `'ioredis'` AND `'moleculer'`. `moleculer-cacher.ts:6` does `require('moleculer')` at module top-level. `moleculer` and `ioredis` are declared as **optional** peer-dependencies (`package.json#peerDependenciesMeta`), but the "optional" contract is broken: consumers using only `MemoryCacheDriver` crash at module-load with `MODULE_NOT_FOUND` for moleculer; consumers without ioredis types installed get unhelpful `tsc` errors. Both leaks pollute the published `.d.ts` of every downstream consumer.

Both packages are **live on GitHub Packages today** (`npm.pkg.github.com/@gertsai/{fetch,m9s-cache}@0.2.0`). Internal-testing consumers will hit these immediately on import.

## Goals

1. **Zero external type imports from external libs at root** — emitted `dist/index.d.ts` for `@gertsai/fetch` and `@gertsai/m9s-cache` MUST not begin with `import ... from 'undici' | 'moleculer' | 'ioredis'` after this PR merges. Validated by reading the file after build.
2. **Optional-peer-dep contract honored** — `import { ... } from '@gertsai/m9s-cache'` (root) MUST work with `moleculer` and `ioredis` UNINSTALLED. Validated by a CI step that installs only mandatory deps and runs `node -e "require('@gertsai/m9s-cache')"`. Out of scope for this PR if CI cap requires; manual check suffices.
3. **No silent breaking changes** — for consumers who already use `@gertsai/m9s-cache` with moleculer or ioredis, the canonical access paths SHOULD remain available via subpaths (`@gertsai/m9s-cache/moleculer`, `/redis`). For consumers of `@gertsai/fetch`, the public re-exports (`UndiciRequestOptions`, `RequestOptions`) MUST remain structurally compatible — values flowing through them keep working without code change at the consumer site.

## Non-Goals

- **NG-001 — No HIGH/MEDIUM fixes in this PRD.** The 22 HIGH and 46 MEDIUM findings from EVID-044 ship as separate Wave 12.B-fix-2 (security HIGHs) and Wave 12.B-fix-3 (type-system HIGHs) sub-waves.
- **NG-002 — No tier-table reconciliation here.** The CLAUDE.md `audit-primitives` Tier-1-vs-Tier-2 question (EVID-044 obs #10) is a documentation fix, not code; separate ticket.
- **NG-003 — No URL-validator consolidation.** EVID-044 obs #2 noted two SSRF URL validators (fetch + utils) — consolidation is Wave 12.B-fix-2 scope.
- **NG-004 — No Storybook/CI changes.** Pure source-code + package.json + tsup.config fix. CI runs the existing release.yml flow unchanged.
- **NG-005 — No breaking changes to runtime semantics.** Method signatures, error types, returned shapes are unchanged. Subpath split is purely an import-path refactor with full backward compatibility via re-exports.

## Functional Requirements

- [ ] **FR-001 — `@gertsai/fetch` local Undici types.** Replace `UndiciRequestOptions = Parameters<typeof request>[1]` with a structural interface (e.g. `UndiciRequestOptions { method?: HttpMethod; headers?: ...; body?: ...; signal?: AbortSignal; ...}`). Replace `extends Omit<RequestInit, 'headers'>` with explicit fields from `RequestInit` that the package actually consumes. Verify: `head -5 packages/fetch/dist/index.d.ts` does NOT start with `import ... from 'undici'`.
- [ ] **FR-002 — `@gertsai/m9s-cache` subpath split — `/moleculer`.** Create `./moleculer` subpath export. Move `M9sCacheCacher`, `M9sCacheCacherOptions`, `moleculerDbCacheMixin`, `MoleculerDbModel`, `CacheableEntity`, `CacheEnabledService`, `CacheEnabledBroker`, `EntityEventType`, `EntityChangedHandler`, `MoleculerContext`, `MoleculerCachedAction`, `MoleculerCacheOptions` to it. Update `package.json#exports`, `tsup.config.ts`, `typesVersions` for Node10 fallback.
- [ ] **FR-003 — `@gertsai/m9s-cache` subpath split — `/redis`.** Create `./redis` subpath. Move `RedisCacheDriver`, `RedisCacheDriverOptions`, `RedisLike` to it. Update `package.json#exports`, `tsup.config.ts`, `typesVersions`.
- [ ] **FR-004 — Lazy `createRequire` in m9s-cache integration code.** `moleculer-cacher.ts` MUST NOT `require('moleculer')` at module top-level. Switch to `createRequire(import.meta.url)` inside constructor or factory. Same for ioredis where applicable. Verified by `grep "require\\.\\.\\.moleculer" packages/m9s-cache/src/*.ts` returning only lazy occurrences.
- [ ] **FR-005 — Root barrel reduction.** `packages/m9s-cache/src/index.ts` retains ONLY backend-agnostic exports: `CacheStore`, `MemoryCacheDriver`, `JsonSerializer`/`TypedSerializer`/`BinarySerializer`/`PassthroughSerializer`, `NoopLockProvider`/`RedlockLockProvider` (redlock is peer-optional; constructor uses lazy require), `validateCacheKey`/`isCacheKey`/`createCacheKey`, generic `CacheError` types, `validateTTL`, `generateTags`, and ALL type-only declarations that don't reference moleculer or ioredis.
- [ ] **FR-006 — Tests pass.** `pnpm --filter @gertsai/fetch test` and `pnpm --filter @gertsai/m9s-cache test` MUST pass after the fix. New tests covering the subpath imports SHOULD be added (`@gertsai/m9s-cache/moleculer` and `/redis`).
- [ ] **FR-007 — Build is green.** Full monorepo `pnpm build` must complete without errors. Verifies no downstream package (api-core, m9s-example) is unintentionally broken by the import-path refactor.
- [ ] **FR-008 — Changesets.** 2 changesets — `@gertsai/fetch: minor` and `@gertsai/m9s-cache: minor`. Bodies cite this PRD-029 and the specific EVID-044 CRITICALs. Triggers v0.3.0 publish on merge.

## Non-Functional Requirements

- **NFR-001 — Backward compatibility preserved.** Consumers who imported `RedisCacheDriver` from `@gertsai/m9s-cache` root continue to work IF a re-export shim is left in the root barrel pointing to `./redis`. **Decision (RFC-020 D-2):** because the root barrel is the leak vector, root re-exports of subpath symbols are NOT preserved. Consumers MUST update imports to `@gertsai/m9s-cache/moleculer` or `/redis`. Minor SemVer bump per pre-1.0 convention (CLAUDE.md). Migration is mechanical: search-and-replace.
- **NFR-002 — Surface stability for `@gertsai/fetch`.** `RequestOptions`, `UndiciRequestOptions` type NAMES and their consumer-visible structural shape MUST remain the same. Internal implementation switches from `Parameters<typeof request>` to explicit interface. Test: `import type { RequestOptions } from '@gertsai/fetch'; const x: RequestOptions = { method: 'GET', headers: {...} };` continues to compile.
- **NFR-003 — Build time.** `pnpm --filter @gertsai/m9s-cache build` must complete in under 10s (vs ~5s today; subpath split adds 2 entries). Acceptable budget.
- **NFR-004 — Bundle impact.** Root-only consumers of `@gertsai/m9s-cache` should see SMALLER dist size (moleculer + ioredis code moved out of root). Tree-shaking-aware consumers benefit. No regression for moleculer/redis users (they import the subpath).
- **NFR-005 — Forgeplan safety.** Markdown artifacts mutated only via MCP, per CLAUDE.md red lines.
- **NFR-006 — File ownership for parallel teammates.** Per RFC-020 D-1, two teammates work on disjoint package directories (no cross-package edits). Pre-seed by orchestrator: no shared files exist — pure parallel.
- **NFR-007 — Reuse Wave 13 pattern.** Surgical fix-wave, 2 affected packages, modelled on PRD-027 (Wave 13 closures from EVID-043). Consistent commit format, PR description shape, changeset body.

## Related Artifacts

- **EVID-044** — Wave 12.B audit findings; sources both CRITICAL items being fixed.
- **PRD-028** — Wave 12.B audit plan (parent — this PRD's fix wave was suggested in EVID-044 §"Suggested follow-up").
- **RFC-019** — Wave 12.B audit strategy (parent — RFC-020 inherits "modelled on Wave 13" mantra).
- **RFC-018** — Wave 12 super-strategy.
- **PRD-027** — Wave 13 fix-wave precedent (same shape: surgical fixes closing CRITICAL from audit evidence).
- **EVID-043** — Wave 12.A api-core audit (where Wave-13 pattern was first encountered).
- **CLAUDE.md** — tier table + red lines on irreversible publish.

Refs: PRD-027 (precedent), EVID-044 (sources), RFC-019 (audit strategy), RFC-020 (execution).





