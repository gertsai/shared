---
depth: standard
id: EVID-061
kind: evidence
last_modified_at: 2026-05-18T21:42:34.097298+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-043
  relation: informs
status: active
title: Wave 13.B — 8 HIGHs closed in @gertsai/core (query + session + LLM)
---

## Summary

Wave 13.B closes the 8 remaining HIGHs from EVID-059 across query + session + LLM domains in `@gertsai/core`. Executed as 2 parallel teammates (`typescript-pro` × 2) under team-lead orchestration. Both teammates produced real on-disk file changes. Net: 11 files (5 modified + 1 new test file + 5 modified), +1148 / -200 LOC. 1195 tests pass, 0 fail.

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: code_review
- **linked_artifact**: PRD-043
- **summary**: 8/8 HIGHs from EVID-059 closed (3 in 13.A + 8 in 13.B = 11 total). 14 MED + 8 LOW deferred to Wave 13.C-E.

## Closures by teammate

### Teammate G — Query + Session (4 items, +693 / -210)

| Finding | File(s) | Approach |
|---|---|---|
| H-1 (router custom blind spread) | `query/router.ts` | New internal `safeSpreadCustom(custom: unknown)` helper. `typeof === 'object' && !== null` narrowing + drops `__proto__`/`constructor`/`prototype`. Both `execute` + `stream` call sites swapped. |
| H-2 (safeExecute classification) | `query/executor.ts` | Catch branch propagates `cause.name`/`cause.message`. Flags `programmerError: true` for 6 programmer error classes. `AbortError → CANCELLED` (retryable=false). `TimeoutError → TIMEOUT` (retryable=true). |
| H-4 (`updateSettings` mutation) | `session/session-context.ts` | Dropped `readonly` on `_graphRagSettings` field + froze initial value in ctor + `updateSettings` reassigns `Object.freeze({...current, ...settings})`. Captured snapshots stay immutable. |
| H-6 (deep-spread `__proto__` propagation) | `session/tenant-config.ts` (massive rewrite: +503/-187) | Module-private `safeSpread<T>(...sources)` helper drops 3 forbidden keys. Both `mergeTenantConfigWithDefaults` + `applyTenantConfigUpdate` rewritten. `exactOptionalPropertyTypes` discipline preserved. |

Tests: 8 in `query.test.ts` + 2 in `session-context.test.ts` + 4 in new `tenant-config-prototype-pollution.test.ts` = 14 new tests.

### Teammate H — LLM (4 items, +205 / -17)

| Finding | File(s) | Approach |
|---|---|---|
| H-7 (singleton config drift) | `llm/routing.ts` | Cache first `RouterConfig`; deep-compare subsequent calls (provider, costOptimization, eventBus by identity, fallbacks structurally); throw on mismatch with guidance pointing to `new ModelRouter(...)`. Test-only `__resetDefaultRouterForTests` helper. |
| H-8 (isO1Model substring) | `llm/providers/openai.ts` | Anchored regex `/^(?:openai\/)?o[13](?:-|$)/`. 7 true-positive + 8 true-negative tests via `it.each`. |
| H-10 (JSON.parse unwrapped) | `llm/providers/{openai,anthropic}.ts` | try/catch wrap; emit `llm.tool.failed`; continue with remaining tool calls. Tightened parsed-shape contract — plain object only. |
| H-11 (fabricated "Hello") | `llm/providers/{anthropic,gemini}.ts` | Replaced fabrication with `throw new Error('Empty or assistant-led conversation: ...')`. Both providers. |

Tests: 24 new tests in `llm.test.ts` under `Wave 13.B security fixes (EVID-059)` umbrella.

## Acceptance verification (all PASS)

- `pnpm --filter @gertsai/core run build` — green (ESM + CJS + DTS)
- `pnpm --filter @gertsai/core run typecheck` — 0 errors
- `pnpm --filter @gertsai/core run test` — 38 files pass, 4 skipped; **1195 tests pass**, 53 skipped, **0 fail**

## Acceptance greps (all clean)

- `git grep -n "custom as object" packages/core/src/query/` — only doc comments, no runtime usage
- `git grep -n "Object.assign(this._graphRagSettings" packages/core/src/session/` — EMPTY
- `git grep -n "includes('o1')\|includes('o3')" packages/core/src/llm/providers/openai.ts` — only comments
- `git grep -n "'Hello'" packages/core/src/llm/providers/{anthropic,gemini}.ts` — only comments
- `git grep -n "JSON.parse(toolCall" packages/core/src/llm/providers/` — wrapped in try/catch (both providers)

## Migration impact (H-11 BEHAVIOURAL)

Anthropic + Gemini providers no longer silently fabricate a "Hello" user message for empty/assistant-led conversations. Callers must supply at least one user message as the first non-system turn. **Minor bump per pre-1.0 SemVer** (behaviour change rather than API shape change).

## After Wave 13.A + 13.B

EVID-059's 2 CRITs + 11 HIGHs all closed (5 in 13.A + 8 in 13.B). Remaining: 14 MED + 8 LOW deferred to Wave 13.C-E.

## Refs

- PRD-043 (Wave 13.A target)
- EVID-059 (audit source)
- EVID-060 (Wave 13.A precedent — CRIT-1/2 + H-3/5/9)
- EVID-058 (Wave 12.G aggregate matrix)
- ADR-002, ADR-006



