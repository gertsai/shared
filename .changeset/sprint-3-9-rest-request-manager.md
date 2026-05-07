---
'@gertsai/rest-request-manager': minor
---

Initial release. Tier 2 HTTP request manager.

- `RestRequestManager` class composing:
  - retry (from `@gertsai/async-utils`, default `'full'` jitter for thundering-herd protection).
  - Token-bucket rate-limiter using `process.hrtime.bigint()` for monotonic timing.
  - **LRU circuit-breaker** per host (default `maxHosts: 1000`, configurable) per ADR-009 Amendment 1.2.1 (CWE-770 protection). State machine closed → open → half-open → closed.
- HTTP status → AppError translation per ADR-009 I-8: 4xx → ValidationError/NotFoundError/UnauthorizedError/ForbiddenError/ConflictError/RateLimitedError; 5xx → InternalError/UpstreamFailureError/BadGatewayError; **AbortError → TimeoutError** per Amendment 1.2.8.
- Optional logger via `@gertsai/logger-factory` peer-optional. REDACTION_KEYS applied to logged request/response bodies per I-9.
- Convenience methods: `get/post/put/delete/patch`. Diagnostics: `getStats()` / `resetStats()`.
- **Node-only** (`engines.node: '>=22'`) per Amendment 1.2.10 — relies on `process.hrtime.bigint()` + undici.
- TLS verification ON (RestRequestManagerOpts MUST NOT expose `rejectUnauthorized: false`) per Amendment 1.2.11.

Peer-deps: `@gertsai/fetch`, `@gertsai/errors`, `@gertsai/async-utils`, `@gertsai/logger-factory` (optional).
