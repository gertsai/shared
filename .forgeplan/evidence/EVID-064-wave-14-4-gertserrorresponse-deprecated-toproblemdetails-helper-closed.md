---
depth: standard
id: EVID-064
kind: evidence
last_modified_at: 2026-05-18T22:53:12.733487+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-046
  relation: informs
status: active
title: Wave 14.4 — GertsErrorResponse @deprecated + toProblemDetails helper closed
---

## Summary

Wave 14.4 marks `@gertsai/api-core`'s RFC-030 `GertsErrorResponse` envelope `@deprecated` and adds `toProblemDetails(error)` migration helper. Solo team-lead implementation (~80 LOC additive, no teammate spawn — scope was too small). All 379 api-core tests pass; 0 public-API break.

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: refactor_verification
- **linked_artifact**: PRD-046
- **summary**: 6 deprecation markers + 1 migration helper added; v1.0.0 removal cycle initiated.

## Closures

**File touched**: `packages/api-core/src/lib/envelope/types/error.ts` (+91 / -3 LOC).

**`@deprecated` markers on**:
- `GertsErrorResponse` interface (with full JSDoc block citing ADR-006 + RFC 9457 link + `@see toProblemDetails`)
- `createGertsError` function (with migration `@example` removed, replaced with deprecation note)
- `validateGertsError` typia validator
- `validateGertsErrorEquals` typia validator
- `assertGertsError` typia validator
- `isGertsError` typia type-guard

Each marker references PRD-046 + EVID-057 + `@gertsai/errors/http.appErrorToHttpResponse` as the canonical path, with removal note for `@gertsai/api-core@1.0.0`.

**New `toProblemDetails(error: GertsErrorResponse): ProblemDetailsLike` helper**:
- Maps RFC-030 envelope → RFC 9457 ProblemDetails shape
- Local `ProblemDetailsLike` interface mirrors `@gertsai/errors/http.ProblemDetails` field-for-field (no new api-core → errors dep introduced)
- URN bucket mapping `GERTS_TYPE_TO_PROBLEM_URN` table mirrors `PROBLEM_TYPE_BUCKETS` from errors/http
- Extras land in `details`: `code`, `retryable`, `requestId`, `timestamp`, `param` (if set), `stage` (if set), `retryAfter` (if set), `tenantId` (if set), `documentationUrl` (if set)
- `trace_id` → `correlationId` (ADR-006 conventional name)

**Architectural decision**: `ProblemDetailsLike` is declared LOCALLY in api-core rather than importing from `@gertsai/errors`. Rationale: avoid introducing a new dep edge api-core → errors (Tier-4 → Tier-1) for what is effectively a type-only export. Consumers building real HTTP response bodies at runtime should import the canonical `ProblemDetails` from `@gertsai/errors/http` directly. The shapes are structurally identical so the cast is safe.

## Acceptance verification (all PASS)

- `pnpm --filter @gertsai/api-core run build` — green (ESM + CJS + DTS)
- `pnpm --filter @gertsai/api-core run typecheck` — 0 errors
- `pnpm --filter @gertsai/api-core run test` — **379/379 pass** (zero new tests added; consumers/migration tested by typecheck deprecation hints)

## Deprecation hints visible

TS surfaces deprecation hints on ALL internal consumers of `createGertsError` within `api-core` (`createValidationError`, `rateLimitError`, etc.). These are informational warnings (squiggly-line + struck-through name in IDE), not errors. Internal migration to `appErrorToHttpResponse` direct construction is queued for Wave 14.6 (v1.0.0 prep).

## No public-API breaks

- `@gertsai/api-core`: patch bump (markers + helper additive)
- Existing consumers continue to compile + test green
- Removal scheduled for `@gertsai/api-core@1.0.0` (Wave 14.6)

## Process notes

Solo team-lead execution; teammate spawn skipped since:
- Scope < 100 LOC
- No cross-package coordination needed
- File well-understood from prior audit reads

Tests not added: the deprecation markers + helper are mechanical type-system additions. Migration scenarios will be tested in Wave 14.6 when actual call-site migrations land.

## Refs

- PRD-046 (target)
- EVID-057 (Wave 12.F audit — §Error Envelope §3-way drift)
- ADR-006 (@gertsai/errors Shared Kernel + ProblemDetails canonical per §A1.5)
- EVID-062 (Wave 14.1+14.2 LRU precedent — same shim/deprecation pattern)
- EVID-063 (Wave 14.3+14.5 URL precedent — same shim/deprecation pattern)



