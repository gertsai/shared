# @gertsai/rest-request-manager

Tier 2 HTTP request manager that composes retry, token-bucket rate
limiting, and per-host LRU circuit breaker over `@gertsai/fetch`. HTTP
status codes are translated into typed `@gertsai/errors` `AppError`
subclasses.

Per [ADR-009 Decision D](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-009-wave-5-phase-4-orchestra-high-candidates-extraction-async-utils-logger-factory-rpc-proxy-builder-rest-request-manager.md)
+ invariants I-8, I-9, I-13, I-14 and Amendment 1
(LRU `maxHosts`, AbortError translation, Node-only, TLS).

## Install

```bash
pnpm add @gertsai/rest-request-manager
# install peer-deps (required)
pnpm add @gertsai/fetch @gertsai/errors @gertsai/async-utils
# logger is optional
pnpm add @gertsai/logger-factory
```

## Quickstart

```typescript
import { RestRequestManager } from '@gertsai/rest-request-manager';

const mgr = new RestRequestManager({
  baseUrl: 'https://api.example.com',
  retry: { maxAttempts: 3 },
  rateLimit: { tokensPerSecond: 10 },
});

interface User { id: string; name: string }

const r = await mgr.get<User>('/users/1');
console.log(r.status, r.body);
```

Throws typed errors on non-2xx:

```typescript
import { NotFoundError, TimeoutError } from '@gertsai/errors';
try {
  await mgr.get('/users/missing');
} catch (e) {
  if (e instanceof NotFoundError) { /* 404 */ }
  if (e instanceof TimeoutError) { /* request exceeded timeoutMs */ }
}
```

## API

| Method | Purpose |
|---|---|
| `new RestRequestManager(opts?)` | Construct with `baseUrl`, `retry`, `rateLimit`, `circuitBreaker`, `logger`, redaction lists. |
| `request(req)` | Full control over method/url/headers/body/timeoutMs. |
| `get<T>(url, opts?)` | Convenience GET. |
| `post<TBody, TResponse>(url, body, opts?)` | Convenience POST (JSON-serialized). |
| `put / patch / delete` | Same shape as POST/GET. |
| `getStats()` | `{ totalRequests, totalRetries, circuitOpens, rateLimitedRequests, circuitEvictions }`. |
| `resetStats()` | Reset counters and circuit state. |

### Status → AppError mapping (I-8)

| HTTP | Error class |
|---|---|
| 400 | `ValidationError` |
| 401 | `UnauthorizedError` |
| 403 | `ForbiddenError` |
| 404 | `NotFoundError` |
| 409 | `ConflictError` |
| 429 | `RateLimitedError` |
| 500 (and other 5xx) | `InternalError` |
| 502 | `BadGatewayError` |
| 503 / 504 | `UpstreamFailureError` |
| AbortError (timeout) | `TimeoutError` (Amendment 1.2.8) |

## Compatibility

| Peer | Range | Optional |
|---|---|---|
| `@gertsai/fetch` | `workspace:^` | no |
| `@gertsai/errors` | `workspace:^` | no |
| `@gertsai/async-utils` | `workspace:^` | no |
| `@gertsai/logger-factory` | `workspace:^` | yes |

`engines.node`: `>=22` (Amendment 1.2.10 — relies on
`process.hrtime.bigint()` and undici).

## Security and Caveats

- **Node-only.** Uses `process.hrtime.bigint()` for monotonic timing in
  the rate limiter and undici for the transport. Browsers are out of
  scope.
- **AppError translation (I-8).** Every non-2xx response and every
  transport failure surfaces as an `AppError` subclass — bare `Error`
  is never thrown for HTTP outcomes. Consumers can match on class.
- **Circuit-breaker LRU eviction (Amendment 1.2.1).** Default
  `circuitBreaker.maxHosts: 1000` caps memory (CWE-770/401). When the
  cap is exceeded, the least-recently-used entry is evicted (closed-by-
  default semantics on next access). `getStats().circuitEvictions`
  reports the running count.
- **Redaction (I-9).** Logged request and response bodies are redacted
  using `REDACTION_KEYS` from `@gertsai/errors`. `redactRequestKeys`
  and `redactResponseKeys` extend the default set; the defaults cannot
  be disabled (CWE-209/200 protection).
- **TLS verification on by default (Amendment 1.2.11).**
  `RestRequestManagerOpts` deliberately does **not** expose
  `rejectUnauthorized: false` or any equivalent override. Callers must
  use `@gertsai/fetch` directly with explicit security if they
  genuinely need to relax TLS — and document why.
- **Default `jitter: 'full'` from `@gertsai/async-utils.retry`**
  (thundering-herd protection, CWE-409).

## Cross-references

- [ADR-009](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-009-wave-5-phase-4-orchestra-high-candidates-extraction-async-utils-logger-factory-rpc-proxy-builder-rest-request-manager.md) — Wave 5 Phase 4 extraction policy and invariants.
- [PRD-003](https://github.com/gertsai/shared/blob/main/.forgeplan/prds/PRD-003-wave-5-errors-runtime-context-framework-adapters-developer-experience-foundation.md) — Wave 5 vision and roadmap.
- [ADR-006](https://github.com/gertsai/shared/blob/main/.forgeplan/adrs/ADR-006-errors-tenant-resolver-placement-session-additive-scoping-wave-5-extraction-policy.md) — `@gertsai/errors` Shared Kernel.

## License

Apache-2.0 © gerts.ai
