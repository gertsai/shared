# @gertsai/queue

## 0.1.0

### Minor Changes

- 23d088a: Initial release of `@gertsai/queue` — BullMQ wrapper primitives (`createQueue`, `createWorker`) + `@gertsai/queue/standalone` runner subpath. Lazy peer-deps on `bullmq` and `ioredis`. Per PRD-001 FR-019 + ADR-004.

  ApiController BullMQ refactor to consume this is a Sprint 3.x follow-up — this package ships standalone.
