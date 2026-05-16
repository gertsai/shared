---
depth: standard
id: EVID-052
kind: evidence
last_modified_at: 2026-05-16T22:06:49.077632+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-036
  relation: informs
status: active
title: Wave 12.D-fix combined — 1 CRITICAL + 19 HIGH closures across 10 packages
---

# EVID-052 — Wave 12.D-fix combined closure evidence

1 CRITICAL + 19 unique HIGH findings from EVID-051 closed across 10 packages by 4 parallel teammates per PRD-036.

## Structured Fields

- **verdict:** `supports` — all cited `file:line` items verifiably patched. Wave-13 CRITICAL leak in api-rlr resolved (moleculer added to peer-deps). 10 packages pass full test + typecheck + build green.
- **congruence_level:** `CL3` — same target system, internal validation.
- **evidence_type:** `test_result`.
- **R_eff per-finding:** `1.0 − 0.0 = 1.0`. Above threshold.
- **Wallclock:** ~30 min wallclock across 4 parallel teammates.

## Verification matrix (20 items)

| FR | Severity | Package | File:line | Teammate | Test added |
|---|---|---|---|---|---|
| FR-001 | CRIT | api-rlr | package.json peerDependencies | A | type-test |
| FR-002 | HIGH arch | api-rlr | context/RequestContext.ts:26 | A | export.test |
| FR-003 | HIGH arch | api-rlr | middleware/MiddlewareFactory.ts:16,56-84 | A | fingerprint.test +5 |
| FR-004 | HIGH arch | hsm | package.json peerDeps | C | n/a |
| FR-005 | HIGH arch | entity-storage | package.json:51 | C | n/a |
| FR-006 | HIGH sec | logger-factory | src/logger.ts:72-82 | C | nested-redaction +1 |
| FR-007 | HIGH sec | errors | src/redaction.ts:11-26 | C | redaction-expanded +7 |
| FR-008 | HIGH sec | core | llm/providers/{openai,anthropic,gemini}.ts | B | base-url-validator +14 |
| FR-009 | HIGH sec | hsm | vault.provider.ts:114 | C | vault.address +7 |
| FR-010 | HIGH sec | entity-storage | JSDoc hardening | D | n/a (docs) |
| FR-011 | HIGH arch | 6 packages | package.json engines | B/C/D | n/a |
| FR-012 | HIGH type | api-rlr | scripts/TypedLuaScript.ts | A | wave12d-type +3 |
| FR-013 | HIGH type | api-rlr | test-utils/RateLimitTestUtils.ts | A | included |
| FR-014 | HIGH type | api-rlr | core/RateLimiter.ts:97-105 | A | included |
| FR-015 | HIGH type | core | agent.ts:85 | B | agent.test +5 |
| FR-016 | HIGH type | core | agent.ts:116,122 | B | included |
| FR-017 | HIGH logic | async-utils | retry.ts:52-65, sleep.ts | D | abort +6 |
| FR-018 | HIGH logic | session-guard | guards.ts:62-78 + check.ts + assertions.ts | D | guards/check/assertions +14 |
| FR-019 | HIGH logic | runtime-context | request-context.ts:172-184,138-150 | D | included |
| FR-020 | HIGH logic | runtime-context | feature-context.ts:44-48 | D | feature-context +2 |
| FR-021 | HIGH logic | entity-storage | BaseEntityStorageService.ts (5+ sites) | D | destroy-mid-set +1 |
| FR-022 | HIGH logic | auth-openfga | client.ts:256-269 | C | initialize-retry +2 |
| FR-023 | HIGH logic | core | hooks/executor.ts (3-part) | B | hooks +7 |

**Total new tests:** ~75 net across 10 packages.

## Cross-validation

- **I-1 file ownership disjoint:** Teammate A → api-rlr; Teammate B → core; Teammate C → errors+logger-factory+hsm+auth-openfga; Teammate D → async-utils+runtime-context+session-guard+entity-storage. No overlaps confirmed via git status.
- **I-2 Wave-13 regression check** — verified `head -3 dist/index.d.ts` for 10 affected packages:
  - api-rlr: `moleculer` import legit (now in peer-deps) ✅
  - core: zod (declared dep), no peer-optional leak
  - errors: redactDetails + REDACTION_KEYS exported from root (FR-007 + re-export confirmed)
  - logger-factory: pure relative imports
  - hsm/auth-openfga: clean
  - async-utils: ZERO external imports (exemplary)
  - runtime-context/session-guard/entity-storage: only @gertsai/* peer-deps
- **I-3 tests pass:** all 10 affected packages green. ~75 new tests.
- **I-4 no new deps:** all packages.
- **I-5 forgeplan MCP discipline:** PRD-036 + EVID-052 via MCP.
- **I-6 backward-compat:** new exports additive (`RlrRequestContext` keeps `RequestContext` deprecated alias; `IBaseLLM`/`ITool` opaque interfaces; `checkImpersonating`/`assertImpersonating` additive; `validateBaseUrl` runtime addition; `FeatureContextLogger` peer-optional). Soft-breaking changes documented per changeset.

## Behavioural changes worth flagging

- **api-rlr CRIT-1 closure:** moleculer now in peer-deps (optional). Consumers installing without moleculer no longer see `Cannot find module` for dist/index.d.ts type imports. Wave-13-pattern recurrence #4 closed.
- **api-rlr RequestContext rename:** soft-breaking. `RlrRequestContext` canonical; `RequestContext` deprecated alias kept for one minor version.
- **api-rlr globalThis cleanup:** ADR-012-pattern (SHA-256 fingerprint Map). Eliminates ESM/CJS dual-build duplicate-state bug + Vitest worker-isolation issues.
- **errors REDACTION_KEYS expansion:** +19 entries (11 PRD-named + 8 snake_case variants — `apitoken/accesstoken/refreshtoken/csrftoken/bearertoken/idtoken/sessionid/clientsecret/x-api-key/bearer/jwt` plus snake_case forms). All consumers of `redactDetails` inherit the wider redaction automatically.
- **logger-factory deep redaction:** now uses `redactDetails` from `@gertsai/errors` (depth-5 + cycle-safe + breadth-1000). `{ user: { password: 'p' } }` no longer leaks.
- **core LLM provider baseUrl validation:** soft-breaking. `http://prod.example.com` rejected; loopback `http://localhost` allowed for dev; non-default https URLs warn (operators must explicitly trust override URLs).
- **core IAgent.run signature:** `string | any` → `string | unknown`. Type-narrowing now required at callers.
- **core AgentFactoryConfig:** `model: any` → `model: IBaseLLM`; `tools?: any[]` → `tools?: readonly ITool[]`. Existing concrete LLM/Tool classes satisfy structurally.
- **core HookExecutor:** structuredClone for background-mode argument copy (preserves Date/Map/Set); `blocking: true` hooks NEVER go to background; drain() uses Deferred not 10ms polling.
- **hsm Vault HTTPS enforcement:** soft-breaking. `http://prod-vault.example.com` rejected at construction with `CONFIG_ERROR`; localhost http allowed with console.warn.
- **auth-openfga initialize race fix:** failed `initPromise` cleared so subsequent retries can succeed.
- **async-utils signal-aware sleep:** AbortSignal interrupts `sleep(ms)` and retry's inter-attempt wait. Cancellation now cleanly propagates through long retry chains.
- **session-guard isImpersonating:** soft-breaking — was throwing on missing UUIDs; now returns `false` (CWE-1188 fail-closed default). Callers wanting structured throw use new `assertImpersonating`; callers wanting CheckResult use new `checkImpersonating`.
- **runtime-context $setSession after $freeze:** soft-breaking. Now throws `ContextFrozenError` (was silent overwrite). Documents single-middleware invariant.
- **runtime-context FeatureContext logger:** optional `logger?: FeatureContextLogger` constructor arg makes swallowed flag-provider exceptions visible. Peer-optional structural type — no hard `@gertsai/logger-factory` import.
- **entity-storage _destroyed re-check:** all CRUD methods (`set`/`update`/`delete`/`destroy`/`restore`/`upsert`) re-check `_destroyed` after every `await provider.*` and skip `emit(...)` if destroyed during the await.
- **engines.node declared on 6 packages:** core, auth-openfga, entity-storage, hsm, logger-factory, runtime-context, errors. async-utils + session-guard + rpc-proxy-builder skipped per Tier-1 zero-Node-dep contract.

## Files changed summary

- **Modified:** 64 production files across 10 packages
- **Created:** 13 new files (7 test files + 1 changeset + 5 forgeplan artefacts)
- **Net LOC:** ~+1100 (mostly tests + JSDoc; source-only ~500)

## Wave 12.D closure status

| Wave | Items | Status |
|---|---|---|
| 12.D audit (EVID-051) | 1 CRITICAL + 19 HIGH | ✅ merged (PR #44) |
| **12.D-fix combined (this EVID)** | 1 CRIT + 19 HIGH | ✅ this evidence |

**Total Wave 12.D closures: 20/20 actionable HIGH+CRITICAL** from EVID-051. ~30 MEDIUM + ~15 LOW deferred to polish sprint or Wave 14.

## Wave 12 cumulative progress

| Wave | Audit | Fixes | Published |
|---|---|---|---|
| 12.A api-core | EVID-043 | Wave 13 (EVID-043 closures) | ✅ v0.3.0 |
| 12.B 15 Tier-1 | EVID-044 (2 CRIT + 14 HIGH) | fix-1/2/3 | ✅ all closed + published |
| 12.C 12 Tier-2 | EVID-048 (1 CRIT + 10 HIGH) | fix-1 + fix-2+3 | ✅ all closed + published |
| **12.D 12 packages** | **EVID-051 (1 CRIT + 19 HIGH)** | **fix combined (this)** | ⏳ pending publish |
| 12.E example apps (3) | pending | — | — |
| 12.F cross-consistency | pending | — | — |
| 12.G aggregate (EVID-053 next) | pending | — | — |

**Cumulative across 12.A/B/C/D:** 4 CRITICAL + 43+ HIGH closed across 39 packages (Tier-1 through Tier-5 + missed Tier-1). Wave 12 audit complete on **39/42 packages** — only example apps (3) + cross-consistency wave + aggregate left.

## Suggested follow-up

- **Wave 12.D2 (deferred deep-audit, optional):** core un-sampled 84% (agent.ts, query, session, llm/providers — ~6-8k LOC focused review) before core promotion to v0.2.0.
- **Wave 12.E:** 3 example apps audit (m9s-example, m9s-example-web, m9s-example-api-types).
- **Wave 12.F:** cross-package consistency (URL validator consolidation between fetch + utils, error taxonomy, defineAction parity, LRU cache extraction to Tier-1).
- **Wave 12.G:** aggregate report (EVID-053) — 38-package risk matrix synthesis from EVID-043/044/048/051.

## Refs

- **PRD-036** — combined fix wave
- **EVID-051** — sources all 20 items
- **PRD-029/030/031/033/034 + EVID-045/046/047/049/050** — Wave 12.B-fix + 12.C-fix precedents
- **ADR-009** — async-utils invariants
- **ADR-010** — TypedToken<T>
- **ADR-012** — auth-openfga multi-instance scoping (precedent for api-rlr fingerprint Map)
- **Sprint 3.10 §A1.1** — SessionDestroyedError relocation



