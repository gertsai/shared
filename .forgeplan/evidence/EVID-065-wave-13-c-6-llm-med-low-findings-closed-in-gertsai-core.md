---
depth: standard
id: EVID-065
kind: evidence
last_modified_at: 2026-05-18T23:22:20.052338+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-047
  relation: informs
status: active
title: Wave 13.C — 6 LLM MED/LOW findings closed in @gertsai/core
---

## Summary

Wave 13.C closes 6 MEDIUM/LOW LLM findings from EVID-059 in `@gertsai/core`. Solo teammate (`typescript-pro`) under team-lead orchestration. Build + typecheck + 1199 tests pass (was 1195, +4 regression tests).

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: code_review
- **linked_artifact**: PRD-047
- **summary**: 6/6 MED+LOW closed; bedrock mapping bug converted from silent misclassification to fail-loud.

## Closures (Teammate N)

| Finding | File:line | Approach |
|---|---|---|
| FR-001 (M) | `llm/base.ts:154` | `this.stop = [...config.stop]` defensive copy |
| FR-002 (M) | `llm/routing.ts:416-417` | Audited `llm-info AI_PROVIDER_TYPE` — no aws/bedrock value. Replaced silent `return 'google'` with `throw new Error('Bedrock provider mapping not yet implemented')` |
| FR-003 (L) | `llm/routing.ts:152,162` | `} catch (err) { console.debug(...) }` replaces silent catch |
| FR-004 (L) | `anthropic.ts:312-313`, `openai.ts:276`, `gemini.ts:350-352` | Per-provider `truncateForError(text, 500)` helper before interpolation |
| FR-005 (L) | `openai.ts:199,210` | Explicit no-choices check + `throw new Error('OpenAI returned no choices in response')` |

LOC delta: +131 / -10 = +121 across 6 files (5 source + 1 test).

## Tests added (4 regression tests)

In `packages/core/src/llm/llm.test.ts` under `Wave 13.C (PRD-047 / EVID-059)`:
1. **FR-001**: defensive stop array copy — caller mutation post-construction doesn't leak
2. **FR-005**: OpenAI no-choices error — mocks `choices: []` → asserts informative rejection
3. **FR-004**: OpenAI 500-byte truncation — mocks 2000-byte error body → assert no 1000 contiguous chars
4. **FR-002**: bedrock fail-loud — `router.listCandidates({provider:'bedrock'})` throws

## Acceptance verification (all PASS)

- `pnpm --filter @gertsai/core run build` — green (ESM + CJS + DTS)
- `pnpm --filter @gertsai/core run typecheck` — 0 errors
- `pnpm --filter @gertsai/core run test` — **1199 pass** (was 1195, +4), 53 skipped, **0 fail**

## Behaviour break

FR-002 only: callers passing explicit `provider: 'bedrock'` to routing helpers now error loudly instead of silently receiving google-cohort candidates. This was a latent bug per pre-existing comment in the code admitting the mapping was wrong. Default construction (`ModelRouter` constructor) doesn't iterate bedrock so unaffected.

## Remaining from EVID-059

8 LOW findings + 14 MED across query/session/agent/tenant-config domains. Suggested next waves per PRD-047:
- Wave 13.D — tenant-config consistency (Zod ↔ TS ↔ factory drift, chunkingStrategy, calculateConfigHash rename, agentReasoning! non-null assertions)
- Wave 13.E — query type-system (any leak in IQueryExecutor)

## Refs

- PRD-047 (target)
- EVID-059 (Wave 12.D2 audit)
- EVID-060 (Wave 13.A — CRIT-1/2 + 3 HIGHs precedent)
- EVID-061 (Wave 13.B — 8 HIGHs precedent)



