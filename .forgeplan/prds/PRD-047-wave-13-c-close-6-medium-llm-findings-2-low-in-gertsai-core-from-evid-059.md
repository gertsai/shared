---
depth: standard
id: PRD-047
kind: prd
last_modified_at: 2026-05-18T23:15:33.203941+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 13.C — close 6 MEDIUM LLM findings + 2 LOW in @gertsai/core from EVID-059
---

## Problem Statement

EVID-059 surfaced 6 MEDIUM-level + 2 LOW-level findings in `@gertsai/core` LLM domain that should close before Wave 14 cycle continues. None are critical but they're cleanup-quality items that improve robustness/correctness.

## Goals

Close 6 LLM MEDIUM findings + 2 LOW findings in `@gertsai/core/src/llm/`.

## Functional Requirements

**FR-001** (M, base.ts:154) — `this.stop = config.stop` (when array) — caller can mutate post-construction. Defensive copy: `this.stop = [...config.stop]`.

**FR-002** (M, routing.ts:416-417) — `bedrock` maps to `'google'` AI provider — comment admits this is wrong. Either gate Bedrock behind "not implemented" error or fix the mapping. **Decision: fix mapping to `'aws'`** (or `'bedrock'` if that's a valid AI_PROVIDER_TYPE value).

**FR-003** (L, routing.ts:152,162) — Silent `} catch {}` in `createWithFallback` masks all errors. Log first error at debug level.

**FR-004** (L, anthropic.ts:312-313 + openai.ts:276 + gemini.ts:350-352) — Error messages interpolate raw `response.text()` content. Truncate to N bytes (e.g. 500).

**FR-005** (L, openai.ts:199,210) — `response.choices[0]?.message?.content ?? ''` masks "no choices" failure as empty content. Distinguish via explicit check; throw informative error when `choices` is missing/empty.

## Non-Functional Requirements

**NFR-001** — Zero behaviour change for valid inputs; minimal patch bump.
**NFR-002** — Existing tests continue passing. Add 1 regression test per fix where applicable.

## Out of Scope

- Wave 13.D tenant-config consistency (separate PR)
- Wave 13.E query type-system tightening (separate PR)
- MEDIUM/LOW from other EVID-059 domains (separate PR)

## Related Artifacts

- EVID-059 (Wave 12.D2 audit source — §MEDIUM/LOW)
- EVID-060 + EVID-061 (Wave 13.A + 13.B precedents for LLM/session/query fixes)
- ADR-009 (rest-rm parity)

## Target Audience

- Consumers of `@gertsai/core` LLM provider abstraction
- Bedrock + OpenAI + Anthropic + Gemini deployment operators



