---
'@gertsai/async-utils': minor
---

Initial release. Tier 1 zero-peer-dep async utilities.

- `sleep(ms)` / `withTimeout<T>(action, timeoutMs, message?)` (signal listener cleanup per ADR-009 I-16, no leak across 1000+ invocations).
- `defer<T>()` / `debounce(fn, waitMs)` / `throttle(fn, limitMs)` with `cancel()`/`flush()` semantics.
- `retry<T>(action, opts?)` exponential backoff. Default jitter `'full'` (CWE-409 thundering herd protection per ADR-009 Amendment 1.2.7). Honors `signal: AbortSignal`.
- `makeCancellable()` AbortController helper.

ZERO `@gertsai/*` peer-deps per ADR-009 I-1 (Tier 1 leaf). Throws standard `Error` (not `@gertsai/errors` AppError per I-2) — consumers wrap if needed.
