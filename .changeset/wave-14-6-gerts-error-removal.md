---
'@gertsai/api-envelope': minor
'@gertsai/api-core': minor
---

Wave 14.6 (PRD-054 / EVID-057 §Error Envelope — FINAL) — remove the deprecated RFC-030 `GertsErrorResponse` envelope.

**Removed** (closes the deprecation path opened in Wave 14.4):

- `GertsErrorResponse` interface
- `GertsErrorDetail` interface
- `createGertsError` factory
- `validateGertsError`, `validateGertsErrorEquals`, `assertGertsError`, `isGertsError` typia validators
- `toProblemDetails` migration helper
- `ProblemDetailsLike` interface (consumers should import canonical `ProblemDetails` from `@gertsai/errors/http`)
- Convenience creators returning `GertsErrorResponse`: `validationError`, `notFoundError`, `authError`, `rateLimitError`, `internalError`
- `isErrorResponse` type guard

**Migrated**:

- `wrapErrorResponse(options)` now returns canonical RFC 9457 `ProblemDetails & { _legacy }` from `@gertsai/errors/http` (per ADR-006 §A1.5). Taxonomy-specific extras (`code`, `type`, `retryable`, `retryAfter`, `stage`, `requestId`, `timestamp`, `tenantId`) live in `ProblemDetails.details` per RFC 9457 §3.2 ("extension members"). `trace_id` maps to `correlationId`.
- `@gertsai/api-core/moleculer/apiGateService.template.ts` — reads `X-Request-ID` from `problem._legacy.request_id` (top-level field replaced by `details.requestId`).
- `GertsAnyResponse` union — error arm is now `ProblemDetails` (was `GertsErrorResponse`).

**Kept** (still useful taxonomy support; not wire envelopes):

- `GertsErrorType`, `GertsErrorCode`, `GertsProcessingStage` types — live inside `ProblemDetails.details`
- `ERROR_STATUS_CODES`, `RETRYABLE_ERROR_CODES` lookup tables
- `generateRequestId()`, `getStatusCode()`, `isRetryable()` helpers
- `GERTS_TYPE_TO_PROBLEM_URN` mapping (newly exported — used by `wrapErrorResponse`)

**Migration path for downstream consumers**:

```ts
// Before
import { createGertsError, type GertsErrorResponse } from '@gertsai/api-envelope';
const err: GertsErrorResponse = createGertsError({
  type: 'not_found_error',
  code: 'ENTITY_NOT_FOUND',
  message: 'Entity not found',
});

// After
import { appErrorToHttpResponse } from '@gertsai/errors/http';
import { NotFoundError } from '@gertsai/errors';
const { status, body } = appErrorToHttpResponse(
  new NotFoundError({ message: 'Entity not found', details: { code: 'ENTITY_NOT_FOUND' } }),
);
```

The `body` is canonical RFC 9457 `ProblemDetails`. For OpenAI-compatible domain-code routing, place the code in `details.code` — the api-envelope `wrapErrorResponse` does this automatically for inbound Orchestra responses.

Per audit (Wave 14.4 / EVID-057) there are no external consumers of the removed symbols. Breaking change is contained inside `@gertsai/api-envelope` + `@gertsai/api-core` and pre-1.0 SemVer permits a minor bump.
