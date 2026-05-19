# @gertsai/api-envelope

Browser-safe RFC-030 envelope shared kernel for `@gertsai/*` ecosystem.

Tier-1 package — no Moleculer, no `@gertsai/api-core` runtime dependency.

## What's inside

- **`GertsResponse<T>`** — unified success envelope (OpenAI-compatible `id` / `object` / `created` + VoltAgent `success` / `data` + CrewAI `usage`).
- **`GertsErrorResponse`** — unified error envelope (RFC 9457 + OpenAI error format + Agno `retryable` flag).
- **`GertsListResponse<T>`** — paginated list envelope (cursor + offset pagination).
- **`wrapSuccessResponse` / `wrapErrorResponse`** — transform Orchestra API responses into the envelope.
- **Type guards** — `isGertsResponse`, `isErrorResponse`, `isListResponse`, `isAnySuccessResponse`, plus Orchestra-info / tenant-id helpers (incl. SEC-002 `validateTenantIdFormat`).

## Origin

Extracted from `@gertsai/api-core/lib/envelope/` in Wave 15.A
(PRD-050 / EVID-067 §15.A). `@gertsai/api-core` keeps a back-compat
re-export shim at `lib/envelope/index.ts`.

## License

Apache-2.0
