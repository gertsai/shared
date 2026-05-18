---
depth: standard
id: EVID-060
kind: evidence
last_modified_at: 2026-05-18T21:24:20.276478+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-043
  relation: informs
status: active
title: Wave 13.A — 2 CRITs + 3 HIGHs closed in @gertsai/core (LLM + session)
---

## Summary

Wave 13.A closes the 2 CRITs + 3 highest HIGHs from EVID-059 in `@gertsai/core`. Executed as 2 parallel teammates (`typescript-pro` × 2) under team-lead orchestration. Both teammates produced real on-disk file changes. 1154 tests pass, 0 fail.

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: code_review
- **linked_artifact**: PRD-043
- **summary**: 5/5 Wave 13.A items closed; 8 HIGHs from EVID-059 deferred to Wave 13.B-E.

## Closures by teammate

### Teammate E — LLM domain (CRIT-1 + CRIT-2 + H-9)

**Files**: `packages/core/src/llm/{base.ts,providers/anthropic.ts,providers/gemini.ts,llm.test.ts}` — +350/-17 LOC.

| Finding | Approach |
|---|---|
| CRIT-1 (cross-tenant state leak) | Option (a): removed instance field `previousThinkingBlocks`. Caller threads via `options.metadata[ANTHROPIC_PREVIOUS_THINKING_BLOCKS_KEY]`. Defensive narrowing helper. `routing.ts` singleton untouched. **BREAKING for multi-turn extended thinking — minor bump per pre-1.0 SemVer.** |
| CRIT-2 (prototype pollution) | 3-prong guard: typeof string + non-empty, `hasOwnProperty.call`, typeof fn === 'function'. Structured logging for `toolName` (CWE-117). |
| H-9 (Gemini URL injection) | `encodeURIComponent(this.model)` before URL path interpolation. |

Tests added: 8 in `llm.test.ts` under `Wave 13.A security fixes (EVID-059)` umbrella.

### Teammate F — Session domain (H-3 + H-5)

**Files**: `packages/core/src/session/{types.ts,session-context.ts}` + 2 new test files — +138/-12 LOC.

| Finding | Approach |
|---|---|
| H-3 (spread-after-literal) | Destructure-then-spread: `const { timeout: raw, ...rest } = options; return { ...rest, timeout: raw ?? DEFAULT };`. Only 1 affected factory in session/ scope (`createRequestMeta`); 3 other patterns scanned + confirmed safe. |
| H-5 (`$switchOperator` privilege swap) | Decision: Option (a) delete. `git grep` confirmed zero external callers across `packages/` + `examples/`. Method on `GraphRAGSessionContext` removed; doc-comment retains rationale pointing to `@gertsai/session.Session.$switchOperator` for legitimate callers. |

Tests added: 7 in `session-types.test.ts` (H-3 regression) + 3 in `session-context.test.ts` (H-5 removal pin).

## Acceptance verification (all PASS)

- `pnpm --filter @gertsai/core run build` — green (ESM + CJS + DTS)
- `pnpm --filter @gertsai/core run typecheck` — 0 errors
- `pnpm --filter @gertsai/core run test` — 37 files pass, 4 skipped; 1154 tests pass, 53 skipped, **0 fail**.

## Acceptance greps (all clean)

- `git grep -n "previousThinkingBlocks" packages/core/src/llm/providers/anthropic.ts` — only docstring/method-local references; instance field gone
- `git grep -n "availableFunctions\[" packages/core/src/llm/base.ts` — single reference at line 445 preceded by `hasOwnProperty.call` guard
- `git grep -n "encodeURIComponent" packages/core/src/llm/providers/gemini.ts` — present at line 332
- `git grep -nE 'options\.\w+ \?\? .*\.\.\.options?' packages/core/src/session/` — EMPTY
- `git grep -n '\$switchOperator' packages/core/src/session/session-context.ts` — only doc-comment lines

## Migration impact (CRIT-1 BREAKING)

Multi-turn extended-thinking callers using Anthropic providers MUST thread previous thinking blocks via metadata channel. Single-turn callers unaffected. Documented in changeset body.

## Deferred

8 HIGHs from EVID-059 remaining: query/agent/LLM types not yet hardened, tenant-config drift checks, OpenAI provider parity audit. → Wave 13.B-E.

## Refs

- PRD-043 (target)
- EVID-059 (audit source)
- EVID-058 (Wave 12.G aggregate matrix — situates this in cross-wave context)
- ADR-002, ADR-006



