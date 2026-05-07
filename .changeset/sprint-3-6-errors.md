---
'@gertsai/errors': minor
---

Initial release. Universal error taxonomy for `@gertsai/*` ecosystem (Shared Kernel per ADR-006).

- 10 ErrorKind values (`as const` object, NOT const enum — compatible with `isolatedModules: true`) covering RFC 9457 + canonical microservice taxonomy: VALIDATION, NOT_FOUND, UNAUTHORIZED, FORBIDDEN, CONFLICT, RATE_LIMITED, INTERNAL, UPSTREAM_FAILURE, TIMEOUT, BAD_GATEWAY.
- `AppError<D>` generic base + 10 typed subclasses (each with narrowed `details` shape).
- `/http` subpath: RFC 9457 ProblemDetails serialization with **bucket types** (`urn:gertsai:errors:server` collapses INTERNAL+UPSTREAM_FAILURE+BAD_GATEWAY to prevent topology leak per security review) + automatic `details` redaction (14-key list including `password`, `token`, `secret`, `apiKey`, `authorization`, `cookie`, `private_key`, `connection_string`).
- `/grpc` subpath: gRPC status code mapping (canonical integer codes vendored as constants — NO grpc framework runtime import).
- Helpers: `wrapUnknownError(x, kind?, correlationId?)`, `isAppError(x)`, `getUserMessage(error, locale?)`.
- `registerErrorLocale(locale, catalog)` extension API (catalogs MUST be static / build-time only — format-string injection risk per security review).
- `AppError.toJSON()` cause-chain cycle/depth guard (max depth 5, WeakSet cycle detection, `__truncated: { reason: 'cycle' | 'depth-exceeded' | 'non-app-error' }` markers).
- 52 tests including adversarial fixtures (cause-cycle, cause-deep, details-redaction, bucket-type collapse).
