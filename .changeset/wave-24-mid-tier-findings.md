---
'@gertsai/auth-openfga': minor
'@gertsai/rest-request-manager': minor
'@gertsai/session-guard': minor
'@gertsai/queue': minor
---

Wave 24 — close 4 HIGH + 2 MED findings from EVID-078 across 4 mid-tier packages.

Retrofit changeset for PR #84 (commit `ea80fab`) — my Write tool call for the changeset file failed silently with an `InputValidationError` due to invalid `kind`/`title` parameters, so the original PR went out without the changeset file. Wave 22 ws-rpc patch (PR #81) was the only changeset in PR #82 Version Packages.

This changeset retroactively bumps the 4 affected packages from PR #84.

**Teammate Y — auth-openfga + rest-rm**:

- **H-1** — auth-openfga 9 query/mutation funcs gain `opts?: CheckPermissionOptions` (multi-store scoping bypass closed). 7 from audit + 2 surfaced during plumbing (`bulkWriteTuples`, `bulkDeleteTuples`).
- **H-2** — `InMemoryDenyLedger.entries` Map → `LruTtlMap` from `@gertsai/utils/lru` (bounded eviction; `maxSize=10_000`, `ttlMs=0` defaults).
- **H-3** — rest-rm `CircuitBreaker` single-probe half-open via class-level `probesInFlight: Set<string>` (per-host).
- **MED-4** — pinning test for rate-limit-before-preflight ordering.

**Teammate Z — session-guard + queue**:

- **H-4** — session-guard `isImpersonating` docs synced (returns false on empty UUIDs since Wave 12.D-fix per PRD-036 FR-018); existing `assertImpersonating`/`checkImpersonating` surfaced in README.
- **MED-5** — queue `runStandalone` hardened (signal, shutdownTimeoutMs+force-close, logger, callbacks, idempotent shutdown).
- **MED-6** — NEW `NotImpersonatingError extends ConflictError` in session-guard → HTTP 409 (was 500 fall-through).

**Tests: +27** across 4 packages (auth-openfga 145→155, rest-rm 28→31, session-guard 62→67, queue 7→16).

Refs: PRD-061, EVID-078 (Wave 23 audit), EVID-079 (Wave 24 closure), PR #84 commit `ea80fab`.
