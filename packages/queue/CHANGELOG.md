# @gertsai/queue

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
