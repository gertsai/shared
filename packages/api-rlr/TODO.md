# @gerts/api-rlr — TODO

> Audit Date: 2026-01-23
> Status: 208 tests passed (28 files, 7 lua/integration skipped)
> Last Updated: 2026-01-23

## Fixed (2026-01-23)

- P0: GCRA remaining calculation corrected (limitGcra.lua)
- P0: Cleanup handlers now close all Redis stores (MiddlewareFactory)

## Open Issues (from composite review)

### P1 High

- **Legacy duplicate client**: `src/client/rlr.ts` (~580 LOC) is unused; remove to reduce drift.
- **Unsafe null assertion**: `src/core/RateLimiter.ts:93` uses `as any`; refactor to typed guard.
- **ConfigValidator mutates input**: `src/validators/ConfigValidator.ts` should return new object.
- **Timing attack in whitelist check**: use constant-time comparison for whitelisted routes.
- **Debug logging leaks headers**: `RLR_DEBUG=verbose` prints raw headers; sanitize sensitive fields.
- **429 handling**: ensure middleware sets `Retry-After` and consistent headers for clients.

### P2 Medium

- **Header parsing consistency**: keep `X-RateLimit-Reset` parsing in one helper and reuse across modules.
- **Concurrent/load tests**: add high-QPS tests + Redis failover scenarios.
- **Middleware integration tests**: un-skip `__tests__/middleware.*.test.ts` (needs Redis fixture).

### P3 Later

- **Performance**: consider binary heap for priority metrics/log buffers; add benchmarks.

## Notes

- Lua integration tests are skipped locally (Redis not available). Re-enable in CI with Redis.
- Keep `SECURITY-ENV-VARS` guidance from RFC-055 in mind when adding new env vars.
