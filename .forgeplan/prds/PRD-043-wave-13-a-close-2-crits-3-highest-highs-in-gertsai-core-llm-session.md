---
depth: standard
id: PRD-043
kind: prd
last_modified_at: 2026-05-18T21:17:07.317748+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 13.A — close 2 CRITs + 3 highest HIGHs in @gertsai/core (LLM + session)
---

## Problem Statement

EVID-059 (Wave 12.D2 deep audit) surfaced 2 CRITs + 11 HIGHs + 14 MED + 8 LOW in `@gertsai/core`. The 2 CRITs are cross-tenant security gaps and must be closed before v0.4.0 release of `@gertsai/core`. Wave 13.A also closes 3 highest HIGHs in the same domain for batch efficiency.

## Goals

1. CRIT-1 — eliminate cross-tenant state leakage in AnthropicProvider.
2. CRIT-2 — eliminate prototype-pollution / unsafe dispatch in BaseLLM.handleToolExecution.
3. H-9 — fix Gemini URL path interpolation (encodeURIComponent for `model` segment).
4. H-3 — fix `createRequestMeta` spread-after-literal timeout default break (cross-cutting pattern in 5+ factories).
5. H-5 — gate `GraphRAGSessionContext.$switchOperator` behind authentication+audit (currently unauthenticated privilege swap).

## Functional Requirements

**FR-001** — `packages/core/src/llm/providers/anthropic.ts`: remove instance-level `previousThinkingBlocks` state OR move it into per-request context (passed as an arg). Verify `ModelRouter` singleton pooling no longer replays one tenant's chain-of-thought into another's.

**FR-002** — `packages/core/src/llm/base.ts:425-449`: `handleToolExecution` MUST validate `toolName` via `Object.prototype.hasOwnProperty.call(availableFunctions, toolName)` (or use a `Map` instead of plain object). Log injection at line 446 → sanitise/structured logging.

**FR-003** — `packages/core/src/llm/providers/gemini.ts:328`: wrap `this.model` with `encodeURIComponent` before URL path interpolation.

**FR-004** — `packages/core/src/session/types.ts:202-210`: replace `timeout: options.timeout ?? DEFAULT_TIMEOUT, ...options` spread pattern with explicit deconstruction so caller's `{ timeout: undefined }` does not silently overwrite the default. Audit + fix the same pattern in the 5+ other factories flagged in EVID-059.

**FR-005** — `packages/core/src/session/session-context.ts:282-285`: `$switchOperator` MUST require authenticated session + tenant validation + audit event emission. If method intent is "internal", make it package-private (not exported on the public class).

## Non-Functional Requirements

**NFR-001** — Build green: `pnpm --filter @gertsai/core run build` + `pnpm --filter @gertsai/core run typecheck` + `pnpm --filter @gertsai/core run test` (all green).
**NFR-002** — No breaking API surface changes (target: patch / minor bump). If FR-001 or FR-005 requires API shape change → document in changeset as minor bump.
**NFR-003** — Add unit tests demonstrating the fix (one test per CRIT minimum).

## Out of Scope

- Remaining 8 HIGHs from EVID-059 → Wave 13.B-E.
- MED/LOW findings → backlog.
- Refactoring LRU/URL/error envelope per EVID-057 → Wave 14.

## Related Artifacts

- EVID-059 (source — Wave 12.D2 deep audit findings)
- PRD-041 (Wave 12.D2 audit PRD)
- ADR-002 (hex layering)
- ADR-006 (errors)

## Target Audience

- Platform engineers consuming `@gertsai/core` (~30 consumers across 38 packages)
- Multi-tenant runtime operators (CRIT-1 is highest-impact on prod)



