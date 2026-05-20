---
depth: standard
id: EVID-072
kind: evidence
last_modified_at: 2026-05-20T08:12:02.901544+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-054
  relation: informs
status: active
title: Wave 14.6 — GertsErrorResponse REMOVED, EVID-057 §Error Envelope fully closed
---

## Summary

Wave 14.6 — FINAL EVID-057 §Error Envelope removal. Solo teammate (`typescript-pro`) migrated 1 internal consumer (`wrapErrorResponse` in api-envelope) + deleted ~500 LOC of deprecated RFC-030 hybrid envelope (interface + factory + 4 typia validators + migration helper + ProblemDetailsLike + 5 convenience creators + isErrorResponse guard). All builds + typechecks + tests green. **EVID-057 §Error Envelope fully closed**.

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: refactor_verification
- **linked_artifact**: PRD-054
- **summary**: ~500 LOC deprecated code removed; 1 internal consumer migrated; canonical RFC 9457 ProblemDetails now sole error envelope per ADR-006.

## Audit (Step 0)

`git grep` confirmed ZERO external consumers in `examples/`. Internal call sites:

| Site | Action |
|---|---|
| `api-envelope/src/types/error.ts` definitions | DELETED ~500 LOC |
| `api-envelope/src/types/error.test.ts` (22 deprecated tests) | DELETED (95 → 73 tests) |
| `api-envelope/src/types/index.ts GertsAnyResponse error arm` | MIGRATED to ProblemDetails |
| `api-envelope/src/response-wrapper.ts wrapErrorResponse` | MIGRATED to build `ProblemDetails & { _legacy }` (RFC 9457 §3.2 extension members) |
| `api-core/src/lib/envelope/index.ts shim` | UPDATED (removed deprecated re-exports) |
| `api-core/src/moleculer/apiGateService.template.ts:152` | MIGRATED (reads X-Request-ID from `_legacy.request_id`) |
| `api-core/src/__test__/response-wrapper.test.ts` (9 tests) | REWRITTEN to assert ProblemDetails shape |
| `packages/core/src/errors.ts:566 isGertsError` | OUT OF SCOPE (different symbol — GertsError class type-guard) |

## Closures (Teammate U)

**Files DELETED from `api-envelope/src/types/error.ts`**:
- `GertsErrorResponse` interface
- `createGertsError` factory function
- `validateGertsError` / `validateGertsErrorEquals` / `assertGertsError` typia validators
- `isGertsError` typia type-guard
- `toProblemDetails` migration helper (no longer needed after removal)
- `ProblemDetailsLike` (consumers import canonical `ProblemDetails` from `@gertsai/errors/http`)
- 5 convenience creators (`notFoundError`/`validationError`/etc that returned GertsErrorResponse)
- `isErrorResponse` guard

**Kept**:
- `GertsErrorType` / `GertsErrorCode` / `GertsProcessingStage` enums (still useful for `details.code` etc.)
- `ERROR_STATUS_CODES` / `RETRYABLE_ERROR_CODES` constants
- `generateRequestId()` utility
- New `GERTS_TYPE_TO_PROBLEM_URN` exported for response-wrapper

**Migrated**:
- `wrapErrorResponse` builds `ProblemDetails & { _legacy }` — RFC 9457 §3.2 extension members hold legacy taxonomy extras (code/param/stage/retryable/retry_after/request_id/tenant_id) for backward compat. Pre-existing consumers of `_legacy.request_id` continue working (apiGateService.template.ts X-Request-ID header path).

**Workspace dep**: `+@gertsai/errors: workspace:*` on api-envelope (was previously structural-only `ProblemDetailsLike`).

## Acceptance verification (all PASS)

| Scope | Build | Typecheck | Tests |
|---|---|---|---|
| `@gertsai/api-envelope` | ✅ DTS+ESM+CJS | ✅ 0 | ✅ **73 pass** (was 95, -22 deprecated) |
| `@gertsai/api-core` | ✅ green | ✅ 0 | ✅ **286 pass** (was 277, +9 rewritten ProblemDetails-shape) |
| Workspace (41 pkgs + 3 examples) | ✅ all green | ✅ **0 errors** | — |

Net test count: -13 (mechanical removal of redundant typia validator coverage).

## Net change

14 files / +262 insertions / -818 deletions = **-556 LOC code**. Workspace size unchanged (41 packages).

## EVID-057 §Error Envelope CLOSED

Per EVID-057 §Recommendation: "Deprecate `GertsErrorResponse` in `@gertsai/api-core@0.3.0`... Remove `GertsErrorResponse` interface in `@gertsai/api-core@1.0.0` (next major)."

Actual delivery:
- ✅ Deprecation marker: Wave 14.4 (EVID-064)
- ✅ Removal: Wave 14.6 (THIS PR) — landed earlier than originally planned for v1.0.0, possible because audit confirmed zero external consumers

3-way drift triangle CLOSED:
1. `@gertsai/errors/http ProblemDetails` — CANONICAL (preserved)
2. m9s-example OpenAPI schema — already matches canonical (no work needed)
3. `@gertsai/api-core GertsErrorResponse` — **REMOVED**

## Bump

**Minor** for `@gertsai/api-envelope` + `@gertsai/api-core` (pre-1.0 SemVer allows breaking; audit confirmed zero external consumers).

## Remaining api-core cleanup candidates (post Wave 14.6)

- **Wave 15.D** — ApiController action-pipeline extraction (~1000 LOC remaining in `ApiController.class.ts` after 15.A+B+C reduced it from 1511 → 1178)
- **Wave 17?** — bcryptjs → native bcrypt (m9s-example concern, deferred from Wave 12.E)

## Refs

- PRD-054 (target)
- EVID-057 §Error Envelope (audit source — now CLOSED)
- EVID-064 (Wave 14.4 deprecation marker precedent)
- EVID-068 (Wave 15.A envelope extraction — cross-package context)
- ADR-006 (@gertsai/errors Shared Kernel canonical)



