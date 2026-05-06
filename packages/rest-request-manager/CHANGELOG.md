# @gertsai/rest-request-manager

## 0.1.0

### Minor Changes

- Initial release. Tier 2 HTTP request manager extracted from Orchestra (Sprint 3.9, Wave 5 Phase 4).
- API: `RestRequestManager` class with `request()`, `get/post/put/delete/patch`, `getStats()`, `resetStats()`.
- Composes `@gertsai/async-utils` (retry + withTimeout) over `@gertsai/fetch.httpCaller` with internal token-bucket rate limiter and per-host LRU circuit breaker.
- HTTP status → `@gertsai/errors` AppError translation (4xx → ValidationError/NotFoundError/UnauthorizedError/ForbiddenError/ConflictError/RateLimitedError; 5xx → InternalError/UpstreamFailureError/BadGatewayError; AbortError → TimeoutError).
- Per ADR-009 Decision D + invariants I-8 (typed errors), I-9 (REDACTION_KEYS applied to logs), I-13 (per-package strategy marker F), Amendment 1.2.1 (LRU `maxHosts: 1000`), 1.2.8 (AbortError → TimeoutError), 1.2.10 (Node ≥22), 1.2.11 (no `rejectUnauthorized: false`).
