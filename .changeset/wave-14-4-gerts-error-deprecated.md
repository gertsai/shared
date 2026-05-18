---
'@gertsai/api-core': patch
---

Wave 14.4 — Mark `GertsErrorResponse` `@deprecated` + add `toProblemDetails` migration helper per EVID-057 §Error Envelope.

EVID-057 confirmed the 3-way drift between RFC 9457 `ProblemDetails` (canonical per ADR-006), m9s-example OpenAPI schema (matches canonical), and `@gertsai/api-core GertsErrorResponse` (RFC-030 hybrid outlier with ZERO external consumers). This wave marks the deprecation path without removing anything — removal is a v1.0.0 breaking change.

**`@deprecated` markers added to**:
- `GertsErrorResponse` interface
- `createGertsError` function
- `validateGertsError` typia validator
- `validateGertsErrorEquals` typia validator
- `assertGertsError` typia validator
- `isGertsError` typia type-guard

Each marker carries `@see` pointing to `appErrorToHttpResponse` from `@gertsai/errors/http` and a removal note for `@gertsai/api-core@1.0.0`.

**New migration helper**: `toProblemDetails(error: GertsErrorResponse): ProblemDetailsLike`. Maps RFC-030 envelope → RFC 9457 ProblemDetails shape:
- `error.type` → ADR-006 URN bucket (e.g. `validation_error` → `urn:gertsai:errors:validation`)
- `error.message` → ProblemDetails.title + .detail
- `error.code` + `error.param` + `error.stage` + `error.retryable` + `error.retry_after` → `ProblemDetails.details`
- `request_id` → `details.requestId`; `trace_id` → `correlationId`; `tenant_id` → `details.tenantId`

Local `ProblemDetailsLike` interface mirrors `@gertsai/errors/http.ProblemDetails` field-for-field — defined locally to avoid introducing a new dep from api-core. Consumers building real HTTP response bodies should prefer the canonical type at runtime.

**Behaviour**: zero change. Existing consumers see TS deprecation hints (not errors); all 379 api-core tests continue passing. Build + typecheck green.

**No public-API break.** Patch bump. Removal cycle:
- v0.x.y (this PR): @deprecated marker + migration helper landed
- v1.0.0 (Wave 14.6): `GertsErrorResponse` interface + `createGertsError`/`validateGertsError`/`isGertsError`/`toProblemDetails` removed; all `@gertsai/api-core` internal consumers migrated to ProblemDetails

Refs: PRD-046, EVID-057 (Wave 12.F audit), ADR-006 (@gertsai/errors Shared Kernel + ProblemDetails canonical), EVID-062 (Wave 14.1+14.2 LRU precedent), EVID-063 (Wave 14.3+14.5 URL precedent).
