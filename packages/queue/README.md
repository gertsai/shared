<div align="center">

# @gertsai/queue

### BullMQ wrapper primitives + headless worker runner

Lazy peer-deps on `bullmq` and `ioredis` — consumers opt in only when they
actually need a queue. Provides `createQueue` / `createWorker` factories
plus a `/standalone` subpath that runs workers without booting a full
Moleculer broker.

[![Tier](https://img.shields.io/badge/tier-2-orange?style=flat-square)](#status)
[![Build](https://img.shields.io/badge/build-tsup-blue?style=flat-square)](#status)
[![Status](https://img.shields.io/badge/status-initial-yellow?style=flat-square)](#status)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square)](#license)

</div>

---

## Status

`@gertsai/queue` ships standalone in v0.1.0 with BullMQ wrapper primitives
and a `/standalone` runner subpath. The migration of
`@gertsai/api-core`'s embedded BullMQ usage (currently in
`ApiController.class.ts`) onto this package is a **Sprint 3.x follow-up**
and is intentionally out of scope for the initial release.

Per **ADR-004 R-2**, the import direction is one-way:

```
@gertsai/api-core   ──consumes──▶   @gertsai/queue
```

`@gertsai/queue` MUST NOT import from `@gertsai/api-core`. It is a Tier 2
primitive; api-core (Tier 4) will adopt it in a follow-up sprint.

## Install

```bash
pnpm add @gertsai/queue bullmq ioredis
```

`bullmq` and `ioredis` are declared as **optional peer dependencies**:
the package will load and import without them, but `createQueue` and
`createWorker` will throw `QueuePeerDepMissingError` at call time. This
keeps the package weightless for consumers that import only the types
or the standalone entry without ever spinning up a queue.

## Usage

### Wrapper primitives

```ts
import { createQueue, createWorker, type QueueConnection } from '@gertsai/queue';

const connection: QueueConnection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  db: 0,
};

const emails = createQueue<{ to: string }>('emails', { connection });

await emails.add('welcome', { to: 'user@example.com' });

const worker = createWorker<{ to: string }>(
  'emails',
  async (job) => {
    await sendEmail(job.data.to);
  },
  { connection, concurrency: 5 },
);
```

### Standalone runner (headless workers)

For "API gateway off, workers on" deployments — useful when you want to
scale workers independently of the HTTP layer.

```ts
import { startStandalone } from '@gertsai/queue/standalone';

const handle = startStandalone({
  connection: { host: 'localhost', port: 6379 },
  queues: [
    {
      name: 'emails',
      concurrency: 5,
      processor: async (job) => {
        await sendEmail(job.data.to);
      },
    },
    {
      name: 'reports',
      concurrency: 1,
      processor: async (job) => generateReport(job.data),
    },
  ],
});

process.on('SIGTERM', () => handle.shutdown());
```

## API surface

| Export | Source | Purpose |
|---|---|---|
| `createQueue<T>(name, opts)` | `@gertsai/queue` | Construct a BullMQ Queue with a normalized connection. |
| `createWorker<T,R>(name, processor, opts)` | `@gertsai/queue` | Construct a BullMQ Worker with normalized connection + concurrency. |
| `QueueConnection`, `QueueOpts`, `WorkerOpts` | `@gertsai/queue` | Public option types. |
| `QueuePeerDepMissingError` | `@gertsai/queue` | Thrown when `bullmq` is not installed at call time. |
| `Queue`, `Worker`, `Job`, `ConnectionOptions` | `@gertsai/queue` (re-exported from `bullmq`) | Convenience type re-exports. |
| `startStandalone(opts)` | `@gertsai/queue/standalone` | Spin up N workers, return a shutdown handle. |
| `StandaloneQueueDef`, `StartStandaloneOpts`, `StandaloneHandle` | `@gertsai/queue/standalone` | Public option types for the runner. |

## Design notes

- **One-way import direction** (ADR-004 R-2). api-core consumes queue,
  never the reverse.
- **Lazy `require('bullmq')`** keeps the package weightless when the queue
  feature is unused. A consumer who imports only types pays nothing.
- **Narrow `QueueConnection` surface** — four fields covering ApiController
  v0.x usage. Consumers needing the full ioredis options surface can pass a
  pre-built ioredis client to BullMQ directly.
- **Standalone runner is intentionally minimal**. Concurrency, lock duration
  tuning, telemetry hooks, and per-job tracing are deliberately deferred
  to the Sprint 3.x follow-up that migrates ApiController.

## Related

- **PRD-001 FR-019** — extract queue runtime from api-core.
- **ADR-004** — Preserve-history + fresh boundary strategy.
- **`@gertsai/api-core`** — current home of the BullMQ runtime; adopts this
  package in a future sprint.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
