# @gertsai/queue

## 0.3.0

### Minor Changes

- 391310d: Wave 24 — close 4 HIGH + 2 MED findings from EVID-078 across 4 mid-tier packages.

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

## 0.2.1

### Patch Changes

- Wave 24 Teammate Z — close EVID-078 MED-5 (`/standalone` graceful-shutdown
  ergonomics).

  Additive only — every existing `startStandalone({ queues, connection })`
  call continues to work without changes. New optional fields:

  - **`signal: AbortSignal`** — cooperative shutdown trigger. Wire it to
    `SIGINT` / `SIGTERM` (or any other source) in the host process; the
    runner calls `shutdown()` once when the signal aborts. Idempotent
    against repeated aborts.
  - **`shutdownTimeoutMs`** (default 30 000) — bounds `Promise.all(close())`
    on shutdown. After the timeout, every worker is force-closed via
    `worker.close(true)` (BullMQ's "drop the running job, release the
    lock" path) so a hung Worker cannot keep the host process alive
    indefinitely. The fallback timer is `.unref()`-ed where supported.
  - **`logger`** (structural `{ error, warn }` shape) — when supplied,
    receives the worker-level `error` events plus the shutdown-timeout
    warning. Without a logger, the `error` listener still installs (so
    Node ≥15's unhandled-emit semantic does not crash the host), but
    output is silent.
  - **`onError` / `onFailed` / `onCompleted`** — observability hooks that
    proxy BullMQ's worker events with the queue name carried through.
    Callback exceptions are swallowed (logged via `logger.warn` when
    available) so an observability mistake cannot crash the worker.
  - **`StandaloneHandle.workers`** — read-only view of the underlying
    Worker instances exposed for test / observability access.

  Test additions: 5 new cases covering signal-triggered shutdown,
  idempotency, force-close after timeout, error listener installation,
  and observability proxy delivery. README updated with the
  `SIGTERM`/`SIGINT` wiring pattern.

## 0.2.0

### Minor Changes

- f662fa5: Wave 12.C-fix-2+3 — close 2 HIGH findings (EVID-048 H-3 + H-11).

  **H-3 — Inlined bullmq types**

  Previously `dist/index.d.ts` imported `Queue, Worker, Job, ConnectionOptions, QueueOptions` from `'bullmq'`, forcing consumers to install bullmq for types even when not using the runtime. Wave-13-pattern.

  **Fix:** local structural interfaces in `src/index.ts` matching the minimum surface the package actually exposes. Runtime `require('bullmq')` stays inside the lazy `defaultLoadBullmq()` factory. Public type names (`Queue<T>`, `Worker<T,R>`, `Job<T>`, `ConnectionOptions`, `QueueOptions`, `DefaultJobOptions`) preserved — consumer code unchanged.

  **H-11 — createWorker conditional spread for password / db / concurrency**

  Previously `createWorker` passed `password: undefined` and `db: undefined` to BullMQ's Worker constructor unconditionally — inconsistent with `createQueue` (which uses conditional spread). BullMQ + ioredis may interpret `password: undefined` differently from absent (Redis with AUTH enabled can throw).

  **Fix:** mirror `createQueue`'s `...(opts.connection.password !== undefined && { password: opts.connection.password })` pattern for `password`, `db`, `tls`, and `concurrency`.

  **Test seam:** added `__setBullmqLoaderForTesting(loader | null)` for unit-testable mocking of the lazy require. Marked `@internal`; production callers go through the default loader.

  **Tests:** +2 new conditional-spread tests (undefined-omitted + provided-included paths). 7/7 total pass.

  Refs: PRD-034, EVID-048 (H-3, H-11).

## 0.1.0

### Minor Changes

- 23d088a: Initial release of `@gertsai/queue` — BullMQ wrapper primitives (`createQueue`, `createWorker`) + `@gertsai/queue/standalone` runner subpath. Lazy peer-deps on `bullmq` and `ioredis`. Per PRD-001 FR-019 + ADR-004.

  ApiController BullMQ refactor to consume this is a Sprint 3.x follow-up — this package ships standalone.
