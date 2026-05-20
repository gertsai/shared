---
depth: standard
id: PRD-054
kind: prd
last_modified_at: 2026-05-20T07:55:48.921438+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 14.6 — GertsErrorResponse REMOVAL (last EVID-057 §Error Envelope item)
---

## Problem Statement

Wave 14.4 (EVID-064) marked `@gertsai/api-core`'s `GertsErrorResponse` (RFC-030 hybrid envelope) `@deprecated` and added `toProblemDetails(error)` migration helper. EVID-057 §Error Envelope identified this envelope as the 3-way drift outlier with ZERO external consumers in monorepo — salvageable.

This wave is the FULL REMOVAL: migrate all api-core internal consumers from `GertsErrorResponse` → ProblemDetails (canonical per ADR-006 + `@gertsai/errors/http`), then delete the deprecated symbols.

## Goals

1. Migrate all api-core internal call sites that construct/return `GertsErrorResponse` → `appErrorToHttpResponse(err)` from `@gertsai/errors/http` (canonical RFC 9457 ProblemDetails).
2. Delete deprecated symbols:
   - `GertsErrorResponse` interface
   - `createGertsError` function
   - `validateGertsError` / `validateGertsErrorEquals` / `assertGertsError` validators
   - `isGertsError` type-guard
   - `toProblemDetails` migration helper (no longer needed after removal)
   - `ProblemDetailsLike` (consumers import canonical `ProblemDetails` from `@gertsai/errors/http` directly)
3. `response-wrapper.ts:358-362` builds `ProblemDetails` directly via `appErrorToHttpResponse`.
4. `notFoundError`, `validationError`, `authError`, `rateLimitError`, `internalError` helpers (currently in `lib/error/helpers.ts` returning `APIError`) — confirm continue using `APIError` (not `GertsErrorResponse`).

## Functional Requirements

**FR-001** — Audit all api-core internal consumers via grep. Expected sites (per EVID-057 §Error Envelope):
- `response-wrapper.ts:358-362` (RFC-030 hybrid builder)
- `types/index.ts` `GertsResponse` union — remove `GertsErrorResponse` from union
- Any other internal callers identified at audit

**FR-002** — Migrate each consumer:
- Replace `createGertsError({type, code, message, ...})` → build `AppError` subclass + `appErrorToHttpResponse(err)` from `@gertsai/errors/http`
- Preserve all RFC-030 extras (`code`, `param`, `stage`, `retryable`, `retry_after`, `request_id`, `tenant_id`, `trace_id`) by placing them in `ProblemDetails.details` (already mapped by `toProblemDetails`)

**FR-003** — Delete the deprecated symbols from `packages/api-core/src/lib/envelope/types/error.ts`. Keep only neutral exports that don't reference `GertsErrorResponse` (e.g. helper functions that return `APIError`).

**FR-004** — Update `packages/api-core/src/lib/envelope/index.ts` shim accordingly (no `GertsErrorResponse` re-exports).

**FR-005** — Update CHANGELOG via changeset documenting breaking change + migration path (point to `appErrorToHttpResponse` + ProblemDetails).

## Non-Functional Requirements

**NFR-001** — Build green + workspace typecheck 0 errors.
**NFR-002** — Tests: existing GertsError-related tests in api-envelope (95 envelope tests via Wave 15.A) may need updates if they assert on `GertsErrorResponse` shape. Surface during execution.
**NFR-003** — Bump: minor for api-core + api-envelope (pre-1.0 SemVer allows breaking in minor). Removing exports is breaking.

## Out of Scope

- Removing helpers that already return `APIError` (`notFoundError` etc. in `lib/error/helpers.ts`)
- Reorganizing error error namespace beyond removal
- Removing OIDCError (modern, unrelated)

## Related Artifacts

- EVID-057 §Error Envelope (3-way drift catalogue)
- EVID-064 (Wave 14.4 deprecation marker)
- ADR-006 (@gertsai/errors Shared Kernel + ProblemDetails canonical)
- EVID-068 (Wave 15.A envelope extraction — context for cross-package state)

## Target Audience

- Maintainers of `@gertsai/api-core` + `@gertsai/api-envelope` (both packages affected per Wave 15.A extraction)
- Future consumers — point them to `appErrorToHttpResponse` from day 1
- v1.0.0 release coordinators (this delivers the final RFC 9457 alignment promise)



