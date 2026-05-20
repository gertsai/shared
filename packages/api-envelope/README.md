# @gertsai/api-envelope

Browser-safe RFC-030 envelope shared kernel for `@gertsai/*` ecosystem.

Tier-1 package — no Moleculer, no `@gertsai/api-core` runtime dependency.

## What's inside

- **`GertsResponse<T>`** — unified success envelope (OpenAI-compatible `id` / `object` / `created` + VoltAgent `success` / `data` + CrewAI `usage`).
- **`GertsListResponse<T>`** — paginated list envelope (cursor + offset pagination).
- **`wrapSuccessResponse`** — transforms Orchestra API success responses into the envelope.
- **`wrapErrorResponse`** — transforms Orchestra error responses into canonical RFC 9457 `ProblemDetails` from `@gertsai/errors/http` (per ADR-006 §A1.5). Taxonomy support types (`GertsErrorType` / `GertsErrorCode` / `GertsProcessingStage`) describe the `ProblemDetails.details` payload, not a wire envelope.
- **Type guards** — `isGertsResponse`, `isListResponse`, `isAnySuccessResponse`, plus Orchestra-info / tenant-id helpers (incl. SEC-002 `validateTenantIdFormat`).

> **Wave 14.6 (PRD-054 / EVID-057 §Error Envelope — FINAL):** the legacy
> RFC-030 hybrid `GertsErrorResponse` envelope, `createGertsError`, the four
> typia validators, the `toProblemDetails` migration helper, the
> `ProblemDetailsLike` interface, the convenience creators
> (`validationError` etc.), and the `isErrorResponse` guard have been
> REMOVED. Outbound errors are now built via `appErrorToHttpResponse(err)`
> from `@gertsai/errors/http`.

## Origin

Extracted from `@gertsai/api-core/lib/envelope/` in Wave 15.A
(PRD-050 / EVID-067 §15.A). `@gertsai/api-core` keeps a back-compat
re-export shim at `lib/envelope/index.ts`.

## License

Apache-2.0
