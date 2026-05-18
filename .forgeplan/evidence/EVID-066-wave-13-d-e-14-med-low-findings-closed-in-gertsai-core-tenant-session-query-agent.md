---
depth: standard
id: EVID-066
kind: evidence
last_modified_at: 2026-05-18T23:37:45.747647+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-048
  relation: informs
status: active
title: Wave 13.D+E — 14 MED/LOW findings closed in @gertsai/core (tenant + session + query + agent)
---

## Summary

Wave 13.D+E closes 14 MED/LOW findings from EVID-059 across tenant-config + session + query + agent domains in `@gertsai/core`. 2 parallel teammates (`typescript-pro` × 2) under team-lead orchestration. Both teammates succeeded with disjoint file scope. **1244 tests pass** (was 1199 before Wave 13.D+E, +45 new regression).

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: code_review
- **linked_artifact**: PRD-048
- **summary**: 14/14 MED+LOW closed (7 Teammate O + 7 Teammate P); 5 new public exports; 0 consumer breakage.

## Closures

### Wave 13.D — Teammate O (tenant-config + session, +583/-87 LOC)

| FR | File | Approach |
|---|---|---|
| D-1 (M) | `tenant-config.ts:1492` | Add `'hierarchical'` to Zod enum |
| D-2 (M) | `types.ts:316-321` | `clampGraphRagNumber` helper; clamp maxHops/topK/communityLevel; fallback on NaN/Infinity |
| D-3 (M) | `tenant-config.ts:2478` | Rename `calculateConfigHash` → `configCacheKey`; `@deprecated` alias preserved |
| D-4 (M) | `tenant-config.ts:2578` | `pickAllowlist` helper + 3 allowlists `satisfies ReadonlyArray<keyof ...>` |
| D-5 (L) | `tenant-config.ts:2245,2248,2371,2375,2380` | Extract `DEFAULT_AGENT_REASONING`; replace `agentReasoning!` with `?? DEFAULT_AGENT_REASONING` |
| D-6 (M) | `session-context.ts:301` | 3-branch normaliser for `signal.reason` → Error |
| D-7 (M) | `session-context.ts:365` | New `isSerializedSessionContext` guard; throws typed TypeError |

Tests: 31 in new `wave-13-d-fixes.test.ts`.

### Wave 13.E — Teammate P (query + agent, +275/-37 LOC)

| FR | File | Approach |
|---|---|---|
| E-1 (M) | `executor.ts:328,338,352,362` + `router.ts:203` | `AnyQueryExecutor = IQueryExecutor<QueryRequest, unknown, unknown>` alias replaces `any, any`. Callers now narrow at use site. |
| E-2 (M) | `types.ts:querySuccess/queryPartial` | `confidence` clamped [0,1] + `Number.isFinite` guard; `durationMs >= 0` floor. `queryFailure` no-op per interface (no relevant fields). |
| E-3 (M) | `registry.ts:511-516` + 4 sibling factories | Spread `...options` first, discriminator + required fields after. Hostile caller's `options.type` override blocked. |
| E-4 (L) | `router.ts:101-105` | `LATENCY_ORDER = Object.freeze({fast:0,medium:1,slow:2})` hoisted to module const |
| E-5 (L) | `router.ts:386-396` | `QueryRouterAsTool` interface; `asTool()` returns typed surface |
| E-6 (M+L) | `agent.ts:85,153` | `run(input: unknown, ...)` (decorative `string |` removed); JSDoc on `readonly ITool[]` element mutability |

Tests: 30 new in `query.test.ts` + 2 updated in `agent.test.ts`.

## Acceptance verification (all PASS)

- `pnpm --filter @gertsai/core run build` — green (ESM + CJS + DTS)
- `pnpm --filter @gertsai/core run typecheck` — 0 errors
- `pnpm --filter @gertsai/core run test` — **1244 pass** (was 1199, +45), 53 skipped, **0 fail**

## Public API additions (minor bump warranted)

- `configCacheKey` (rename of `calculateConfigHash`; back-compat alias kept)
- `DEFAULT_AGENT_REASONING` constant
- `isSerializedSessionContext` type guard
- `AnyQueryExecutor` type alias
- `QueryRouterAsTool` interface

All additive; zero removals.

## Behaviour break

`createGraphRAGSettings` clamps values that previously violated `isGraphRAGSettings` invariants — those outputs were already rejected downstream by the guard, so this tightens correctness without breaking valid use.

## After Wave 13.A+B+C+D+E

EVID-059's full inventory closed:
- 2 CRITs (13.A): cross-tenant state leak + prototype pollution
- 11 HIGHs (3 in 13.A + 8 in 13.B): assorted security + correctness
- 6 LLM MED/LOW (13.C): defensive copies + bedrock fail-loud + error truncation
- 14 query/session/tenant-config/agent MED/LOW (13.D+E)
- **Total: 33 findings closed** out of 35 (2 LOW deferred from agent.ts: getter→property idiom; deemed cosmetic and skipped per Wave 13.D+E scope)

## Refs

- PRD-048 (target)
- EVID-059 (Wave 12.D2 audit source)
- EVID-060/061/065 (13.A/B/C precedents)
- ADR-002 (hex layering), ADR-006 (errors taxonomy)



