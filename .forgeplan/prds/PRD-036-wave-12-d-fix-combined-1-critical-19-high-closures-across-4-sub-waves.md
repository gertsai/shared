---
depth: standard
id: PRD-036
kind: prd
last_modified_at: 2026-05-16T21:52:27.076238+00:00
last_modified_by: claude-code/2.1.142
links:
- target: EVID-051
  relation: based_on
status: active
title: Wave 12.D-fix combined — 1 CRITICAL + 19 HIGH closures across 4 sub-waves
---

# PRD-036 — Wave 12.D-fix combined — 1 CRITICAL + 19 HIGH closures

## Target Audience

- **Primary:** consumers of `@gertsai/api-rlr` (CRIT-1 blocks install without moleculer), `@gertsai/core` LLM providers (SSRF), `@gertsai/entity-storage` (IDOR + TOCTOU), `@gertsai/hsm` (Vault HTTP), `@gertsai/logger-factory` + `@gertsai/errors` (redaction gaps).
- **Secondary:** Wave 12.E (example apps) + 12.F (cross-consistency) teams — closure of all 12.D HIGH+CRIT is precondition.

## Problem Statement

EVID-051 surfaced 1 CRITICAL + 19 unique HIGH findings across 7 packages. Per EVID-051 §"Suggested follow-up", these decompose into 4 sub-waves (fix-1/2/3/4). PRD-036 combines all 4 into a single sprint using AgentsTeam parallel pattern — 4 teammates with disjoint package ownership.

## Goals

1. **All 20 actionable items closed.** Each cited EVID-051 `file:line` verifiably patched.
2. **No regression** — every affected package's tests stay green; new tests added per fix where applicable.
3. **Migration cost minimal** — additive types where possible, soft-breaking changes documented in changesets per Wave 12.B-fix + 12.C-fix precedents.

## Non-Goals

- **NG-001** — Wave 12.D2 deep-audit (core un-sampled 84%) deferred to separate sprint.
- **NG-002** — MEDIUM/LOW findings from EVID-051 → polish sprint or Wave 14.
- **NG-003** — No public-API redesign beyond surgical fixes.
- **NG-004** — No `engines.node` declaration on async-utils + rpc-proxy-builder (they have NO Node-builtin imports — Tier-1 zero-dep contract).

## Functional Requirements

### Sub-wave 12.D-fix-1 (CRIT + 4 arch HIGHs, ~80 LOC)

- [ ] **FR-001** — `@gertsai/api-rlr`: add `moleculer` to `peerDependencies` with `peerDependenciesMeta.moleculer.optional: true`. Eliminates Wave-13-pattern type-leak from `dist/index.d.ts`.
- [ ] **FR-002** — `@gertsai/api-rlr`: rename `RequestContext` class → `RlrRequestContext` to avoid collision with `@gertsai/runtime-context.RequestContext`. Update `src/index.ts` re-export.
- [ ] **FR-003** — `@gertsai/api-rlr`: replace `globalThis.__RLR_STORES__` with module-private `Map<string, RLRRedis>` keyed by SHA-256 fingerprint of `RateLimitOptions` (mirror ADR-012 + Wave 6.3 fingerprint pattern from `@gertsai/auth-openfga`). `Object.create(null)` for any persistent stores to drop prototype chain.
- [ ] **FR-004** — `@gertsai/hsm`: remove dead `@gertsai/core` peer-dep from `package.json` (not imported in source).
- [ ] **FR-005** — `@gertsai/entity-storage`: remove dead `@gertsai/entity` peer-dep from `package.json` (not imported in source).

### Sub-wave 12.D-fix-2 (5 security HIGHs + engines.node, ~120 LOC)

- [ ] **FR-006** — `@gertsai/logger-factory`: consume `redactDetails` from `@gertsai/errors` for deep + cycle-safe + breadth-bounded redaction (replace shallow-only `applyRedaction`).
- [ ] **FR-007** — `@gertsai/errors`: expand `REDACTION_KEYS` to include `apiToken`, `accessToken`, `refreshToken`, `csrfToken`, `bearerToken`, `idToken`, `sessionId`, `clientSecret`, `x-api-key`, `bearer`, `jwt`.
- [ ] **FR-008** — `@gertsai/core` LLM providers (openai/anthropic/gemini): reject non-`https://` `baseUrl` unless host is `localhost`/`127.0.0.1`. Console.warn for non-default hosts. Document operator responsibility.
- [ ] **FR-009** — `@gertsai/hsm` `VaultProvider`: reject non-`https://` `VaultConfig.address` unless host is `localhost`/`127.0.0.1`. Console.warn for non-default.
- [ ] **FR-010** — `@gertsai/entity-storage`: harden JSDoc on `BaseEntityStorageService` — "Session is consumed for audit stamping only. Tenant scoping is the caller/provider responsibility." Optionally add `tenantFilterField?` constructor opt for opt-in scoping injection.
- [ ] **FR-011** — Declare `"engines": { "node": ">=22" }` in 6 packages: `core`, `auth-openfga`, `entity-storage`, `hsm`, `logger-factory`, `runtime-context` (per post-12.C-fix-1 entity precedent).

### Sub-wave 12.D-fix-3 (5 type-system HIGHs, ~100 LOC)

- [ ] **FR-012** — `@gertsai/api-rlr`: `TypedLuaScript<TKeys, TArgs extends readonly any[]>` → `readonly unknown[]`. Same for `TypedScriptManager.register/get`.
- [ ] **FR-013** — `@gertsai/api-rlr`: `RateLimitTestUtils.testMiddleware` `next?: any` → `next?: (err?: unknown) => void`.
- [ ] **FR-014** — `@gertsai/api-rlr`: `RateLimiter.checkLimit` remove `store: null as any` — drop `store` from `StrategyExecuteArgs` interface entirely (dead-code coupling per EVID-051 T-3).
- [ ] **FR-015** — `@gertsai/core` `agent.ts`: `IAgent.run(input: string | any, ...)` → `string | unknown` (or proper `Message` union).
- [ ] **FR-016** — `@gertsai/core` `agent.ts`: introduce opaque `IBaseLLM` + `ITool` minimum interfaces inline; replace `model: any` + `tools?: any[]` in `AgentFactoryConfig`.

### Sub-wave 12.D-fix-4 (7 logic HIGHs, ~150 LOC)

- [ ] **FR-017** — `@gertsai/async-utils` `retry`: pass `signal` into `sleep(delayMs, signal)` so AbortSignal interrupts the wait. Add re-check of `signal?.aborted` after sleep.
- [ ] **FR-018** — `@gertsai/session-guard`: rename `isImpersonating` → `assertImpersonating` (signals throwing semantics), OR add `checkImpersonating` returning `CheckResult` shape. Prefer adding `check*` variant per existing pattern.
- [ ] **FR-019** — `@gertsai/runtime-context` `$freeze()`: document the single-middleware invariant in JSDoc + add `assert(!this._frozen)` guard at `$setSession` to detect post-freeze writes (currently silent overwrite).
- [ ] **FR-020** — `@gertsai/runtime-context` `DefaultFeatureContext.isEnabled`: accept optional `logger?: Logger` constructor arg; log swallowed exceptions via `logger.warn(...)` instead of blanket-silent default.
- [ ] **FR-021** — `@gertsai/entity-storage` upsert: `_assertAlive()` re-check after every `await`; skip `emit(...)` if `_destroyed` flipped during the await.
- [ ] **FR-022** — `@gertsai/auth-openfga` `initialize()`: clear `this.initPromise = null` in the catch path before re-throwing so retries can succeed.
- [ ] **FR-023** — `@gertsai/core` `HookExecutor`:
  - replace `JSON.parse(JSON.stringify(value))` with `structuredClone(value)` (Node 17+ available); fallback to shallow copy on cycles
  - separate `canRunInBackground` (hook opt-in) from `runInBackground` workflow flag; reject background mode for hooks tagged `blocking: true`
  - replace `BackgroundQueue.drain()` 10ms polling with `Deferred<void>` resolved when queue empty + running zero

### Cross-cutting (changesets)

- [ ] **FR-024** — Changesets per affected package (5 minor bumps): `@gertsai/api-rlr`, `@gertsai/core`, `@gertsai/entity-storage`, `@gertsai/hsm`, `@gertsai/logger-factory`, `@gertsai/errors`, `@gertsai/auth-openfga`, `@gertsai/runtime-context`, `@gertsai/session-guard`, `@gertsai/async-utils`. Each cites the closed `file:line` items from EVID-051.

## Non-Functional Requirements

- **NFR-001 — Backward-compat additive.** New types/exports additive; soft-breaking changes (RlrRequestContext rename, signal-aware sleep, assert/check pattern split) documented in changeset migration guides.
- **NFR-002 — Test budget.** Each affected package gains tests for its fixes; ~30-50 new tests across 10 packages.
- **NFR-003 — File ownership disjoint per teammate.** 4 teammates:
  - **A (heaviest)**: api-rlr (CRIT + arch + type + middleware globalThis cleanup)
  - **B**: core (LLM providers SSRF + IAgent/AgentFactoryConfig + HookExecutor)
  - **C**: errors + logger-factory + hsm + auth-openfga (security-domain cluster)
  - **D**: async-utils + runtime-context + session-guard + entity-storage (logic-domain cluster)
- **NFR-004 — Forgeplan safety.** MCP only.
- **NFR-005 — Time bound.** Single session, ≤4 hours wallclock including spawn + parallel teammates + verification + commit + PR.
- **NFR-006 — Wave-13-pattern regression check.** After all teammates, verify `head -3 dist/index.d.ts` for all affected packages — especially api-rlr post FR-001 (should no longer leak `moleculer` types).

## Related Artifacts

- **EVID-051** — sources all 20 items (CRIT-1 + 19 unique HIGH)
- **PRD-035** — Wave 12.D audit parent
- **PRD-029/030/031/033/034 + EVID-045/046/047/049/050** — Wave 12.B-fix-1/2/3 + 12.C-fix-1 + 12.C-fix-2+3 precedents
- **ADR-009** — async-utils invariants (retry signal)
- **ADR-010** — TypedToken<T> per Amendment 1
- **ADR-012** — auth-openfga multi-instance scoping (precedent for FR-003)
- **Sprint 3.10 §A1.1** — SessionDestroyedError relocation (precedent for shared-kernel discipline)

Refs: PRD-033/034 (precedents), EVID-051 (sources).




