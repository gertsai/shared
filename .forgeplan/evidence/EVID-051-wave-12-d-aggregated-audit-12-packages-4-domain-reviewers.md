---
depth: standard
id: EVID-051
kind: evidence
last_modified_at: 2026-05-16T21:44:46.598584+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-035
  relation: informs
status: active
title: Wave 12.D aggregated audit — 12 packages × 4 domain reviewers
---

# EVID-051 — Wave 12.D aggregated audit findings

Multi-expert audit of 12 packages (10 Tier-3-5 + 2 missed Tier-1 — async-utils + logger-factory inadvertently omitted from Wave 12.B). 4 parallel domain reviewers per RFC-024.

## Structured Fields

- **verdict:** `weakens` — 1 CRITICAL surface in **published** `@gertsai/api-rlr`: imports `Errors` namespace from `moleculer` in `dist/index.d.ts:4` but `moleculer` is declared ONLY in `devDependencies` (not peer-deps). Consumers installing without moleculer get unresolved type imports — exact Wave-13-pattern that PR-fix-1 + 12.B/12.C-fix-1 closed elsewhere. Plus ~19 unique HIGH findings spanning logic correctness, type-system tightness, security hardening (Logger shallow redaction, REDACTION_KEYS gaps, LLM provider SSRF, Vault cleartext, entity-storage IDOR surface), and architectural inconsistencies (dead peer-deps, missing `engines.node`, shared-kernel duplications).
- **congruence_level:** `CL3` — same target system, internal validation by 4 specialised agents.
- **evidence_type:** `internal_audit`.
- **R_eff per-finding:** `0.5 − 0.0 = 0.5` (verdict=weakens). Above threshold.
- **Wallclock:** ~25 min wallclock across 4 parallel reviewers.

## Executive Summary

| Severity | Logic | Arch | Type | Sec | **Raw** | **After collapse** |
|---|---:|---:|---:|---:|---:|---:|
| CRITICAL | 0 | 0 | 1 | 0 | 1 | **1** (Type/Arch collapsed) |
| HIGH | 7 | 5 | 6 | 5 | 23 | **~19** |
| MEDIUM | 14 | 5 | 10 | 7 | 36 | ~30 |
| LOW | 9 | 2 | 5 | 2 | 18 | ~15 |
| INFO | — | — | — | 1 | 1 | 1 |

**Bottom line:** Wave 12.D surfaces a single recurrent Wave-13-pattern CRITICAL in api-rlr (analog to Wave 12.C CRIT-1 + Wave 12.B CRIT-1/2) plus actionable HIGH density across all 4 domains. **core sampled 16%** across reviewers — adequate; logic reviewer recommends Wave 12.D2 sub-audit for un-sampled 84% (agent.ts, query, session, llm/providers).

## CRITICAL findings

### CRIT-1 — `@gertsai/api-rlr` Wave-13 external-type-leak (moleculer not in peer-deps)

**Domains:** Type (CRITICAL) + Architecture (HIGH) — collapsed.

**Files:**
- `packages/api-rlr/dist/index.d.ts:4` — `import { Errors } from 'moleculer'`
- `packages/api-rlr/src/errors/RateLimitError.ts:2` — root cause (`RateLimitError extends MoleculerError`)
- `packages/api-rlr/package.json` — `moleculer` only in `devDependencies`, NOT `peerDependencies` (only `ioredis` + `moleculer-web` declared as peers)

**Issue:** consumers installing `@gertsai/api-rlr` without `moleculer` get unresolved type imports — exact pattern Wave 12.B-fix-1 + 12.C-fix-1 + 12.C-fix-2+3 fixed elsewhere. Despite Wave 12.C-fix-2+3's queue/rest-rm fixes, the api-rlr regression was missed in scope.

**Remediation (Wave 12.D-fix-1 sub-wave):** add `moleculer` to `peerDependencies` (peer-optional pattern: `"moleculer": "^0.14.0"` + `peerDependenciesMeta.moleculer.optional: true`). OR inline minimal `MoleculerError` shape locally if api-rlr's RateLimitError can stand without moleculer-base. Trivial 4-line `package.json` fix.

## HIGH findings (consolidated, ~19 unique)

### Logic correctness (7 unique)

| # | Package | Finding | Files |
|---|---|---|---|
| L-1 | `@gertsai/async-utils` | retry cancellation race — signal not propagated into sleep | `retry.ts:52-65` |
| L-2 | `@gertsai/session-guard` | `isImpersonating` throws on missing UUIDs (predicate-named function) | `guards.ts:62-78` |
| L-3 | `@gertsai/runtime-context` | `$freeze()` race with concurrent `$setSession` after `await` | `request-context.ts:172-184,138-150` |
| L-4 | `@gertsai/runtime-context` | `DefaultFeatureContext.isEnabled` swallows ALL exceptions blanket-catch | `feature-context.ts:44-48` |
| L-5 | `@gertsai/entity-storage` | upsert 2-RTT fallback TOCTOU race + `_assertAlive` not re-checked after await | `BaseEntityStorageService.ts:513-523,250-282` |
| L-6 | `@gertsai/auth-openfga` | `initialize()` race — failed `initPromise` never cleared | `client.ts:256-269` |
| L-7 | `@gertsai/core` (sampled) | `HookExecutor.executePreHooks` background mode fire-and-forget + JSON-deep-copy lossy + drain() polling 10ms forever | `hooks/executor.ts:296-318,118-131,207-218` |

### Architecture (4 unique, 1 collapsed with Type CRIT-1)

| # | Package | Finding | Files |
|---|---|---|---|
| A-1 | `@gertsai/api-rlr` | Naming collision — `RequestContext` class conflicts with `@gertsai/runtime-context.RequestContext` | `context/RequestContext.ts:26`, `index.ts:56` |
| A-2 | `@gertsai/api-rlr` | Global state in `globalThis.__RLR_STORES__` (anti-pattern post-ADR-012) | `middleware/MiddlewareFactory.ts:16,56-84` |
| A-3 | `@gertsai/hsm` | Dead peer-dep `@gertsai/core` (not imported in source) | `package.json` peerDeps |
| A-4 | `@gertsai/entity-storage` | Dead peer-dep `@gertsai/entity` (not imported in source) | `package.json:51` |

### Type system (5 unique, 1 collapsed)

| # | Package | Finding | Files |
|---|---|---|---|
| T-1 | `@gertsai/api-rlr` | `any[]` in exported `TypedLuaScript<TKeys, TArgs extends readonly any[]>` generic constraint | `scripts/TypedLuaScript.ts:14,179,189` |
| T-2 | `@gertsai/api-rlr` | `RateLimitTestUtils.testMiddleware` exports `next?: any` in public .d.ts | `test-utils/RateLimitTestUtils.ts:252,257` |
| T-3 | `@gertsai/api-rlr` | `null as any` runtime hole for `store` field | `core/RateLimiter.ts:97-105` |
| T-4 | `@gertsai/core` | `IAgent.run(input: string \| any, ...)` collapses to `any` | `agent.ts:85` |
| T-5 | `@gertsai/core` | `AgentFactoryConfig.model: any` + `tools?: any[]` — public surface erodes LLM-model type safety | `agent.ts:116,122` |

### Security (5 unique)

| # | Package | Finding (CWE) | Files |
|---|---|---|---|
| S-1 | `@gertsai/logger-factory` | CWE-532 — `applyRedaction` ONLY top-level (nested objects with passwords/tokens passed through) | `src/logger.ts:72-82` |
| S-2 | `@gertsai/errors` | CWE-532 — `REDACTION_KEYS` exact-match misses `apiToken`/`accessToken`/`refreshToken`/`bearerToken`/`clientSecret`/`x-api-key`/`jwt`/etc | `src/redaction.ts:11-26` |
| S-3 | `@gertsai/core` | CWE-918 SSRF — LLM provider `baseUrl` unvalidated; attacker-controlled URL receives platform API key | `llm/providers/{openai,anthropic,gemini}.ts` (lines 33-34, 261, 333-341, 447 etc) |
| S-4 | `@gertsai/hsm` | CWE-319 cleartext token over HTTP — `VaultConfig.address` accepts `http://`, sends `X-Vault-Token` plaintext | `providers/vault.provider.ts:114,598,604-606` |
| S-5 | `@gertsai/entity-storage` | CWE-639 IDOR — tenant scoping NOT enforced; class is "audit-aware", not "scope-enforcing"; misleading docs | `BaseEntityStorageService.ts:191-528,527-578` |

## Per-package summary cards (12)

### @gertsai/core — 30789 LOC (sampled 16%)
- Logic: 1 HIGH + 4 MED + 2 LOW · Arch: 2 MED + 1 LOW · Type: 2 HIGH + 3 MED + 2 LOW · Sec: 1 HIGH + 1 MED
- **Top:** L-7 HookExecutor background race + JSON-copy lossy; T-4/T-5 IAgent + AgentFactoryConfig `any`; S-3 LLM provider SSRF (baseUrl)
- **Wave 12.D2 recommendation:** logic reviewer flagged un-sampled 84% (agent.ts, query, session, llm/providers) likely harbours additional async/race issues. Consider focused D2 audit (~6-8k LOC) before promoting core to v0.2.0.

### @gertsai/api-rlr — 5798 LOC
- Logic: 1 HIGH + 3 MED + 2 LOW · Arch: 1 CRIT(collapsed) + 2 HIGH + 1 MED · Type: 3 HIGH + 1 MED + 1 LOW · Sec: 1 MED + 1 LOW
- **Top:** CRIT-1 moleculer peer-dep gap; A-1 RequestContext naming collision; A-2 globalThis __RLR_STORES__; T-1..T-3 `any` proliferation; MemoryAdapter O(n) LRU.

### @gertsai/auth-openfga — 4782 LOC
- Logic: 1 HIGH + 4 MED + 2 LOW · Arch: 1 MED · Type: clean · Sec: 1 MED + 1 INFO + 1 LOW
- **Top:** L-6 initialize race; FgaResolvedConfig.apiToken leak (CWE-200); cache key colon collision (CWE-345); IPv4 regex over-permissive.

### @gertsai/hsm — 2185 LOC
- Logic: 1 HIGH + 2 MED + 1 LOW · Arch: 1 HIGH + 1 MED · Type: clean · Sec: 1 HIGH + 1 LOW
- **Top:** A-3 dead peer-dep `@gertsai/core`; S-4 CWE-319 Vault HTTP token cleartext; MockHSM `Math.random` non-deterministic.

### @gertsai/entity-storage — 1848 LOC
- Logic: 1 HIGH + 3 MED + 1 LOW · Arch: 1 HIGH + 1 MED · Type: 1 HIGH + 1 MED · Sec: 1 HIGH + 1 MED
- **Top:** A-4 dead peer-dep `@gertsai/entity`; L-5 upsert TOCTOU + _assertAlive after-await; S-5 tenant scoping not enforced (CWE-639); 16 `as unknown as` bridging casts.

### @gertsai/runtime-context — 854 LOC
- Logic: 2 HIGH + 2 MED · Arch: 1 MED · Type: clean (exemplary TypedToken<T> per ADR-010) · Sec: 0
- **Top:** L-3 $freeze race; L-4 isEnabled blanket-catch; CLAUDE.md docs drift (session-guard peer missing from tier-table entry).

### @gertsai/session-guard — 393 LOC
- Logic: 1 HIGH + 1 MED + 1 LOW · Arch: 0 · Type: clean (exemplary CheckResult discriminated union) · Sec: 1 LOW
- **Top:** L-2 isImpersonating throws (predicate-named); empty-string tenant bypass.

### @gertsai/async-utils — 280 LOC
- Logic: 1 HIGH + 1 MED + 1 LOW · Arch: 0 (exemplary Tier-1) · Type: clean · Sec: 1 MED
- **Top:** L-1 retry signal not in sleep; withTimeout no abort propagation to action (CWE-400).

### @gertsai/logger-factory — 263 LOC
- Logic: 3 MED + 1 LOW · Arch: 1 MED · Type: clean · Sec: 1 HIGH
- **Top:** S-1 shallow redaction misses nested secrets; should consume `redactDetails` from `@gertsai/errors`.

### @gertsai/rpc-proxy-builder — 104 LOC
- Logic: 1 MED + 1 LOW · Arch: 1 LOW · Type: clean (exemplary) · Sec: 0
- **Top:** Minor — peer-dep heaviness for single type import; otherwise reference-quality 100-LOC utility.

## Cross-package observations

1. **Wave-13-pattern recurrence #4** — api-rlr `moleculer` peer-dep gap. After Wave 12.B-fix-1 (fetch undici + m9s-cache moleculer/ioredis), 12.C-fix-2+3 (queue bullmq + rest-request-manager logger-factory), the pattern surfaces once more. Should be the LAST recurrence; suggests adding a CI check (`grep "import.*from .moleculer'" dist/`) per package.
2. **REDACTION_KEYS gaps** (Sec-2) — single 5-min fix in `@gertsai/errors` benefits ALL packages that consume redactDetails. Add `apiToken`, `accessToken`, `refreshToken`, `csrfToken`, `bearerToken`, `idToken`, `sessionId`, `clientSecret`, `x-api-key`, `bearer`, `jwt`.
3. **Deep redaction NOT consumed everywhere** (Sec-1) — `@gertsai/errors.redactDetails` is depth-5 + cycle-safe (Sprint 3.10), but `@gertsai/logger-factory` re-implements shallow-only redaction. Consume the kernel.
4. **engines.node coverage gap** — `core`, `auth-openfga`, `entity-storage`, `hsm`, `logger-factory`, `runtime-context` all import Node built-ins (`crypto`, `events`, `node:crypto`, `node:module`) but only `api-rlr` declares `engines.node`. Post-Wave 12.C-fix-1 entity precedent should apply.
5. **Shared-kernel duplication candidates:**
   - `IDestroyable` in BOTH `@gertsai/core/session/types.ts:330` AND `@gertsai/di/src/types.ts:38` (structurally identical, distinct identity)
   - LRU caches in `@gertsai/core/lru-cache.ts` (541 LOC), `@gertsai/auth-openfga/internal/lru-ttl-map.ts` (~110), `@gertsai/rest-request-manager`'s circuit-breaker LRU. Extract to Tier-1.
   - `RequestContext` class name collision (api-rlr vs runtime-context) — rename rate-limit one to `RlrRequestContext`
   - `GraphRAGSessionContext` (core) vs `Session` (Wave-5 canonical) — mark deprecated
   - `logger-factory.applyRedaction` shallow vs `errors.redactDetails` deep — consume the kernel
6. **Dead peer-deps** — `hsm` declares `@gertsai/core` peer; `entity-storage` declares `@gertsai/entity` peer. Neither imports the declared peer in source. Remove from package.json to reduce closure inflation.
7. **Retry/jitter inconsistency across 5 packages** — async-utils canonical (`jitter: 'full'` per ADR-009), but core/retry, hsm/utils/retry, auth-openfga.withRetry, api-rlr/ResilientRedisAdapter each have own jitter strategy. Migrate to async-utils.
8. **core sampling adequate** — 16% coverage found 1 HIGH + 4 MED + 2 LOW logic items, plus type/security items. Logic reviewer recommends Wave 12.D2 sub-audit for un-sampled 84% (agent.ts, query, session, llm/providers).
9. **Strongest Tier-3-5 packages**: `@gertsai/async-utils` (exemplary Tier-1, zero deps), `@gertsai/rpc-proxy-builder` (exemplary 100-LOC utility), `@gertsai/runtime-context` (TypedToken<T> reference impl). **Weakest by finding density**: `@gertsai/api-rlr` (CRIT + 3 HIGH + 4 MED), `@gertsai/core` (sampled — already shows 3 HIGH).
10. **CLAUDE.md tier-table docs drift** — runtime-context's tier-table entry lists "errors, session, tenant-resolver, di (peers); moleculer (peer-optional)" but `session-guard` peer is missing from docs (package.json declares it; auth-context.ts imports DataAccessUuidMissingError from session-guard). Update.

## Suggested follow-up wave structure

Per Wave 12.B + 12.C precedents:

**Sub-wave 12.D-fix-1 (CRITICAL + arch HIGH):**
- CRIT-1 api-rlr moleculer peer-dep (~5 min, `package.json` change)
- A-1 api-rlr RequestContext rename (~20 min)
- A-2 api-rlr globalThis __RLR_STORES__ → module-private Map (mirror ADR-012 fingerprint pattern)
- A-3/A-4 hsm + entity-storage dead peer-deps removal (~5 min)
- Estimated: ~80 LOC, 0.5 day.

**Sub-wave 12.D-fix-2 (security HIGHs + engines.node):**
- S-1 logger-factory consume errors.redactDetails (deep redaction)
- S-2 errors.REDACTION_KEYS expansion (apiToken/accessToken/etc.)
- S-3 core LLM provider baseUrl validation (HTTPS-outside-localhost)
- S-4 hsm Vault address HTTPS validation
- S-5 entity-storage docs hardening + optional tenant filter
- engines.node declaration on 6 packages
- Estimated: ~120 LOC, 1 day.

**Sub-wave 12.D-fix-3 (type-system HIGHs):**
- T-1..T-3 api-rlr `any[]`/`any`/`null as any` → `unknown`/proper types (~5 sites)
- T-4 core IAgent.run signature fix
- T-5 core AgentFactoryConfig opaque IBaseLLM/ITool interfaces
- Estimated: ~100 LOC, 1 day.

**Sub-wave 12.D-fix-4 (logic HIGHs):**
- L-1 async-utils retry signal in sleep
- L-2 session-guard isImpersonating → checkImpersonating variant
- L-3/L-4 runtime-context $freeze race + isEnabled
- L-5 entity-storage upsert TOCTOU + _assertAlive after-await
- L-6 auth-openfga initialize race
- L-7 core HookExecutor background mode + structuredClone
- Estimated: ~150 LOC, 1.5 days.

**Sub-wave 12.D2 (deferred deep-audit, optional):**
- core un-sampled 84% (agent.ts, query, session, llm/providers) — ~6-8k LOC focused audit before core v0.2.0.

**Deferred:** ~30 MEDIUM + ~15 LOW → Wave 12.D-polish or Wave 14.

## Methodology

Per RFC-024:
- 4 parallel `code-analyzer` ×3 + `security-expert` ×1 agents
- Each got ONE prompt covering all 12 packages in its domain
- core sampled 15-25% explicitly per reviewer with documented blind spots
- Read-only audit
- Cross-validation by orchestrator (same-file-line collapse, severity max-merge)
- Total wallclock ~25 min, ~620k tokens combined across 4 reviewers

## Refs

- **PRD-035** — Wave 12.D audit plan
- **RFC-024** — execution strategy with core sampling
- **EVID-043** — Wave 12.A api-core (precedent)
- **EVID-044** — Wave 12.B Tier-1 (precedent)
- **EVID-048** — Wave 12.C Tier-2 (most-recent precedent)
- **EVID-049 + EVID-050** — Wave 12.C-fix-1 + fix-2+3 closure precedents
- **PRDs 029/030/031/033/034** — Wave 12.B-fix + 12.C-fix sub-wave PRDs
- **ADR-007** — runtime-context architecture
- **ADR-009** — async-utils invariants (jitter, AbortSignal)
- **ADR-010** — TypedToken<T> per Amendment 1
- **ADR-012** — auth-openfga multi-instance scoping (precedent for api-rlr globalThis fix)
- **CLAUDE.md** — tier-table (needs runtime-context session-guard peer + storage-core capabilities shape updates)




