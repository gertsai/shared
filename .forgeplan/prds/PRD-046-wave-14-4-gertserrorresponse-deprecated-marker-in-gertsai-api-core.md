---
depth: standard
id: PRD-046
kind: prd
last_modified_at: 2026-05-18T22:50:02.088343+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 14.4 — GertsErrorResponse @deprecated marker in @gertsai/api-core
---

## Problem Statement

EVID-057 §Error Envelope Audit confirmed 3-way drift between `@gertsai/errors/http ProblemDetails` (canonical per ADR-006), `m9s-example` OpenAPI schema (matches canonical), and `@gertsai/api-core GertsErrorResponse` (RFC-030 hybrid — fundamentally different envelope philosophy, ZERO external consumers in monorepo).

`GertsErrorResponse` has fields RFC 9457 doesn't (`stage`, `retryable`, `retry_after`, `request_id`, `trace_id`, `tenant_id`) — these are salvageable into `ProblemDetails.details` payload. Removal is a v1.0.0 breaking change; this wave only adds the deprecation marker + forward-compat helper.

## Goals

1. Mark `createGertsError`, `validateGertsError`, `isGertsError`, `GertsErrorResponse` type `@deprecated` in `@gertsai/api-core`.
2. Add helper `toProblemDetails(error: GertsErrorResponse): ProblemDetails` that maps RFC-030 envelope → ADR-006 ProblemDetails with extras in `details`.
3. Migrate `response-wrapper.ts:358-362` to build `ProblemDetails` directly via `appErrorToHttpResponse` (optional — if straightforward).

## Functional Requirements

**FR-001** — JSDoc `@deprecated` markers on `createGertsError`, `validateGertsError`, `isGertsError`, `GertsErrorResponse` interface. Each with `@see` pointing to `@gertsai/errors/http.appErrorToHttpResponse`.

**FR-002** — New `packages/api-core/src/lib/envelope/types/error.ts` export `toProblemDetails(error: GertsErrorResponse): ProblemDetails`. Maps:
- `error.type` → `ProblemDetails.type` (URN-prefix mapping)
- `error.message` → `ProblemDetails.title`
- `error.code` + `error.param` + `error.stage` + `error.retryable` + `error.retry_after` → `ProblemDetails.details`
- `request_id` → `details.requestId`; `trace_id` → `ProblemDetails.correlationId`; `tenant_id` → `details.tenantId`

**FR-003** — `response-wrapper.ts:358-362` migration (best-effort). If trivial: build ProblemDetails directly via `appErrorToHttpResponse`. If non-trivial (touches many call sites or risks behaviour change), defer to Wave 14.6 (v1.0.0).

## Non-Functional Requirements

**NFR-001** — Zero behaviour change. All existing tests for `createGertsError`/`validateGertsError`/`isGertsError` continue passing.
**NFR-002** — Patch bump on `@gertsai/api-core` (deprecation marker is non-breaking).

## Out of Scope

- Wave 14.6 GertsErrorResponse REMOVAL (separate v1.0.0 PR)
- Migration of all api-core internal consumers of GertsErrorResponse (the canonical path is set; consumers migrate at their own pace before v1.0.0)

## Related Artifacts

- EVID-057 (Wave 12.F audit — §Error Envelope)
- ADR-006 (@gertsai/errors Shared Kernel + ProblemDetails canonical)
- EVID-062 (Wave 14.1+14.2 LRU precedent — shim pattern)
- EVID-063 (Wave 14.3+14.5 URL precedent — shim pattern)

## Target Audience

- Maintainers of `@gertsai/api-core`
- Future consumers building new endpoints (point them to `@gertsai/errors/http` from day 1)
- v1.0.0 release coordinators (this deprecation cycle preps for the breaking removal)



