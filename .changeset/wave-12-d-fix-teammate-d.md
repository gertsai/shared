---
'@gertsai/async-utils': minor
'@gertsai/session-guard': minor
'@gertsai/runtime-context': minor
'@gertsai/entity-storage': minor
---

Wave 12.D-fix Teammate D — close 7 HIGH/MED logic findings per PRD-036:

- **FR-017 (async-utils)** — `sleep(ms, signal?)` now accepts an
  `AbortSignal` and rejects with `signal.reason` (or `Error('Sleep aborted')`)
  when aborted. `retry()` propagates its signal into the back-off sleep
  AND re-checks the signal after `await sleep()` so a mid-back-off abort
  surfaces immediately instead of completing the full delay window.
- **FR-018 (session-guard)** — `isImpersonating(session)` is now a
  pure predicate that returns `false` for `undefined` / `null` / empty
  UUIDs (CWE-1188 fail-closed). New companion helpers added:
  `assertImpersonating(session)` (throws `DataAccessUuidMissingError` on
  empty UUIDs, plain `Error` when UUIDs equal) and
  `checkImpersonating(session)` (returns `CheckResult<{ impersonating }>`
  discriminating the three failure modes).
- **FR-019 (runtime-context)** — `RequestContext.$setSession` now throws
  with an explicit single-middleware-invariant message (EVID-051 L-3) so
  accidental "middleware ran twice" races surface as a hard error rather
  than a silent authorisation downgrade. JSDoc on `$freeze()` documents
  the invariant.
- **FR-020 (runtime-context)** — `DefaultFeatureContext` accepts an
  optional `FeatureContextLogger` (structural `Pick<Logger, 'warn'>`
  shape, no hard import on `@gertsai/logger-factory`). When a logger is
  configured, flag-provider exceptions are logged at `warn` level before
  defaulting to `false`. Back-compat preserved (no logger = silent).
- **FR-021 (entity-storage)** — `set` / `update` / `delete` / `destroy` /
  `restore` / `upsert` now re-check `_destroyed` after every
  `await provider.*` and suppress the emit if the service was destroyed
  mid-operation (EVID-051 L-5). Upsert JSDoc documents the 2-RTT TOCTOU
  race and recommended mitigations (native 1-RTT fast path or
  `runTransaction`). Full transactional upsert fallback tracked for
  Wave 14 / D2.
- **FR-011 (arch)** — `engines.node ">=22"` added to `runtime-context`
  and `entity-storage` (both use `node:crypto` / `node:events`).
  `async-utils` and `session-guard` remain Node-builtin-free.
