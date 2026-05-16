---
'@gertsai/rest-request-manager': minor
---

Wave 12.C-fix-2+3 — close 2 HIGH findings (EVID-048 H-4 + H-10).

**H-4 — Inlined Logger from peer-optional @gertsai/logger-factory**

Previously `RestRequestManagerOpts.logger?: Logger` imported `Logger` from `@gertsai/logger-factory` which was marked `optional: true` in peer-deps. Consumers omitting the optional peer couldn't satisfy the type. Wave-13-pattern.

**Fix:** inlined minimal `RestRequestLogger` interface (only `debug`/`warn`/`error`/`info` — methods the package actually consumes). Renamed `Logger` reference in `types.ts` → `RestRequestLogger`; re-exported from `index.ts`. Structural-typing-compatible with `@gertsai/logger-factory.Logger` — existing callers continue to work.

**H-10 — Rate-limiter integer-bucket model**

Previously `refilled = elapsedSeconds * tokensPerSecond` produced float; over time `tokens` accumulated fractional drift like `0.9999999` → spurious `RateLimitedError` when caller expects exactly 1 token. Conversely two near-simultaneous calls could both pass with surplus `1.0000001` → burst > capacity.

**Fix:** integer-bucket model with `tokenCarry` fractional accumulator:
- `elapsedMs` computed via BigInt-floor (integer ms)
- Whole tokens via `Math.floor(elapsedMs * tokensPerMs + tokenCarry)`
- Residual fractional held in `tokenCarry` so sub-millisecond rates don't lose precision
- `lastRefillNs` advances only by integer-ms window — residual nanoseconds retained for next refill

**Tests:** +3 new rate-limiter tests (exact-1-token-after-1s, no fractional surplus rapid-fire, 100-request steady-state at 100rps); +2 logger structural-fit tests. 28/28 total pass.

Refs: PRD-034, EVID-048 (H-4, H-10).
