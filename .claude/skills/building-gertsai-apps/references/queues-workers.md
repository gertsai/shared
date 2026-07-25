# Queues & workers

## What & why

In m9s-example, BullMQ queues are owned end-to-end by `@gertsai/api-core`'s
`ApiController` (whose queue runtime was extracted to `@gertsai/api-queue` in
Wave 15.B) — the app never touches `new Queue` / `new Worker` directly.

The **producer** side is enabled by calling
`ApiController.configure({ queue: BullMQConnectionOptions })` once in
`services/index.ts` (gated on `REDIS_URL`); the **consumer** side is registered
via `controller.registerWorker(queueName, [{ name, concurrency, handler }])` as a
module-load side-effect in `queues/ingest-chunk.worker.ts`.

At boot, api-core creates exactly ONE BullMQ `Worker` per queue that routes on
`job.name`, honoring the static `workersEnabled` / `enabledWorkers` flags passed
to `ApiController.Start(...)` to distinguish producer-only (API Gateway) from
worker-node deployments. Action handlers produce via the injected
`addJob(queueName, jobName, payload)`, and when `REDIS_URL` is unset the app
falls back to running the use case inline in the same request.

The flow, end to end:

1. Build a `BullMQConnectionOptions` from `REDIS_URL` (only when set) and pass it
   to `ApiController.configure({ queue })` in `services/index.ts` — BEFORE any
   service import.
2. Register worker handlers at module load via
   `controller.registerWorker(QUEUE_NAME, [{ name, concurrency, handler }])`,
   pulled in through a `queues/index.ts` barrel side-effect import.
3. api-core reads `_registeredQueues` while synthesizing the Moleculer service
   schema, then at broker `started()` delegates to
   `@gertsai/api-queue.bootQueueWorkers(...)`, which always ensures a `Queue`
   exists (so `addJob` works) and creates ONE `Worker` per queue when
   `workersEnabled` and the optional `enabledWorkers` allow-list permit.
4. The producer action gates on `!!config.REDIS_URL`: when set it calls
   `addJob(...)` and returns `mode:'queued'`; otherwise it runs
   `service.useCase.execute(...)` inline (`mode:'inline'`).
5. At broker `stopped()`, api-core delegates to `stopQueueWorkers` / `stopQueues`
   — the app manages no bullmq handles.

## How it works in m9s-example

### api-core owns the BullMQ lifecycle (app never touches bullmq directly)

- **What** — The application registers worker *handlers* and supplies a
  connection config, but never constructs a BullMQ `Queue` or `Worker` itself.
  `ApiController` creates exactly ONE `Worker` per queue at broker `started()`
  and closes it at `stopped()`.
- **Why** — Keeps the application layer transport-agnostic and removes per-service
  queue boilerplate / leaked Redis handles. api-core handles connection sharing,
  trace-context injection, job→handler routing on `job.name`, and graceful
  teardown uniformly.
- **How** — In `services/index.ts`:
  `ApiController.configure({ queue: bullMqConnectionOptions })` (only when
  `REDIS_URL` is set). In `queues/<name>.worker.ts`:
  `controller.registerWorker(QUEUE_NAME, [{ name, concurrency, handler }])`. The
  `lifecycle.ts` `addStoppedHandler` comment explicitly states "Queue cleanup is
  api-core's responsibility — nothing to do here."

### Module-load side-effect worker registration via a barrel

- **What** — Worker registration runs at import time, not inside a lifecycle
  handler. The `queues/index.ts` barrel does a bare
  `import './ingest-chunk.worker'` purely for its side-effect, then re-exports the
  name/job/type constants.
- **Why** — api-core reads `_registeredQueues` when it synthesizes the Moleculer
  service schema (which happens before/at `broker.start`). Registration MUST
  exist by schema-build time — deferring it into `addStartedHandler` would be too
  late, the same timing constraint that forces `setWorkflows` to run at module
  load (documented in `lifecycle.ts:78-93`).
- **How** — `queues/index.ts` does `import './ingest-chunk.worker';`
  (side-effect) + `export { INGEST_QUEUE_NAME, JOB_PROCESS_DOCUMENT, type ... }`.
  The action layer imports the constants from `../queues`. Each domain service is
  itself side-effect-imported in `services/index.ts`.

### REDIS_URL is the single switch for queued vs inline mode

- **What** — The same action either enqueues a job (async, `mode:'queued'`,
  `chunkCount:null`) or runs the use case synchronously (`mode:'inline'`,
  `chunkCount` populated). One env var decides which, with zero code branches
  outside the action.
- **Why** — Lets the example boot with zero infrastructure (no Redis) for
  dev/tests while exercising the full async path in production. api-core only
  injects `service.addJob` / `service.getQueue` when a `queue` config was
  supplied, so the producer must mirror that gate.
- **How** — `const QUEUE_ENABLED = !!config.REDIS_URL;` then
  `if (QUEUE_ENABLED) { await addJob(QUEUE_NAME, JOB_NAME, payload); return ... } else { await service.useCase.execute(...); }`.
  The connection in `services/index.ts` is built only
  `config.REDIS_URL ? {...} : undefined` and conditionally spread into
  `configure({ ...(queueConfig && { queue: queueConfig }) })`.

### Selective worker mode: producer-only (API Gateway) vs worker node

- **What** — The producer and consumer halves can run in separate processes
  against the same Redis. `addJob` / `getQueue` always work; only `Worker`
  creation is gated by `workersEnabled` and the optional `enabledWorkers`
  allow-list.
- **Why** — Standard scale-out: HTTP/API-gateway nodes accept requests and
  enqueue without burning CPU on processing; dedicated worker nodes consume. Lets
  you scale workers independently of the HTTP layer.
- **How** — The entry point parses `WORKERS_ENABLED` and `WORKERS` (CSV) env and
  passes `workersEnabled` + `enabledWorkers` to `ApiController.Start(...)`. Run
  producer-only with `WORKERS_ENABLED=false`; restrict to specific queues with
  `WORKERS=m9s-example.ingest`. `bootQueueWorkers` (`api-queue/lifecycle.ts`)
  implements the skip logic per the mode table in its header comment.

### Handler is a thin transport that delegates to a use case

- **What** — The worker handler does NOT contain business logic. It unpacks
  `ctx.job.data`, captures `this` (the Moleculer service), calls
  `this.useCase.execute(...)`, emits side-effects (SSE frames + durable channel
  events), and returns a small result object.
- **Why** — Same hex-architecture discipline as the action layer — domain logic
  lives in the application use case, reachable identically from inline mode
  (action) and queued mode (worker). The worker just adapts the BullMQ transport.
- **How** — Declare
  `async handler(this: ServiceThis, ctx: QueueHandlerCtx<Job<Data>>)` as a
  NON-arrow function so `this` binds to the service. api-core invokes via
  `handler.call(service, ctxObj)`. Access deps as `this.useCase`, `this.logger`,
  `this.broker`; access the job as `ctx.job`. Mirror the inline path's observable
  side-effects (here: a 4-frame SSE sequence) so both modes look identical to
  clients.

### Error handling = rethrow for BullMQ retry, with a terminal client signal first

- **What** — On failure the handler first emits a terminal `error` signal to any
  client listener, then rethrows so BullMQ's configured retry policy
  (`defaultJobOptions.attempts` / `backoff`) handles it. Domain errors are
  converted to plain `Error`s so BullMQ records a useful `failedReason`.
- **Why** — BullMQ retries on thrown errors; swallowing would silently drop jobs.
  Emitting the client-facing terminal frame BEFORE the rethrow guarantees the UI
  stops dangling even when the rethrow triggers a retry. Converting domain errors
  avoids leaking framework-specific error types into the queue record.
- **How** — Wrap the body in try/catch; in catch:
  `emitSse({ kind:'error', ... })` then map domain errors (e.g.
  `if (err instanceof ForbiddenError) throw new Error('[permission-denied] ' + err.message, { cause: err });`)
  else `throw err;`. Set the retry policy centrally in `defaultJobOptions` on the
  connection config.

### Mid-shutdown abort via a service `_destroyed` flag re-checked after each await

- **What** — The handler re-reads a `_destroyed` boolean on the service after
  every significant `await` and short-circuits (returns without further
  side-effects) if the broker is tearing down, so BullMQ retries the job on the
  next process.
- **Why** — Moleculer has no built-in per-service destroyed flag; without it, a
  worker mid-job keeps emitting SSE/channel events while the broker dismantles,
  racing teardown. Re-checking lets the job abort cleanly and be retried
  elsewhere.
- **How** — `addStoppedHandler` sets
  `(ctx.service as { _destroyed?: boolean })._destroyed = true`. In the handler
  capture `const serviceRef = this;` and define
  `const isDestroyed = () => (serviceRef as { _destroyed?: boolean })._destroyed === true;`
  (a closure, not a one-time read — TS would otherwise narrow the type). Call
  `if (isDestroyed()) return result;` after each await.

## Template

```ts
// SPDX-License-Identifier: Apache-2.0
// ============================================================================
// FILE 1 — queues/<feature>.worker.ts
//   Worker registration runs as a MODULE-LOAD SIDE EFFECT. api-core reads the
//   registry when it synthesizes the Moleculer service schema (before broker
//   start), so registration must exist by then — never defer into a lifecycle.
// ============================================================================
import type { QueueHandlerCtx } from '@gertsai/api-core/moleculer';
import type Moleculer from 'moleculer';

import { resolveExampleController } from '../../../../lib/example-controller';
import config from '../../../../../project.config';
import type { MyServiceContext } from '../../types';

// `this` inside the handler = the Moleculer service instance. Combine your
// typed service-context (deps stashed in addStartedHandler) with the bits of
// the Moleculer.Service surface you actually touch.
type MyQueueThis = MyServiceContext & Pick<Moleculer.Service, 'logger' | 'broker'>;

// --- Public contract: queue name, job name, job data/result shapes ---
// Convention: '<service>.<purpose>' keeps queues namespaced on shared Redis.
export const MY_QUEUE_NAME = 'myapp.myqueue' as const;          // TODO rename
export const JOB_DO_WORK = 'do-work' as const;                  // TODO rename

export interface MyJobData {
  // TODO: serializable job payload (goes through Redis — no class instances)
  id: string;
  text: string;
}
export interface MyJobResult {
  id: string;
  count: number;
}

const controller = resolveExampleController<'v1', 'myservice', MyServiceContext>(
  'v1',
  'myservice',
);

// ONE Worker per queue is created by api-core; it routes internally on job.name.
controller.registerWorker(MY_QUEUE_NAME, [
  {
    name: JOB_DO_WORK,
    concurrency: config.WORKER_CONCURRENCY, // TODO from project.config (env-driven)
    // NON-arrow function so `this` binds to the service (api-core calls
    // handler.call(service, ctx)). Arrow functions would lose `this`.
    async handler(
      this: MyQueueThis,
      ctx: QueueHandlerCtx<import('bullmq').Job<MyJobData>>,
    ): Promise<MyJobResult> {
      const { job } = ctx;
      const payload = job.data;

      // Mid-shutdown guard: re-read the flag (a closure, not a one-time read)
      // after each significant await so we abort cleanly during teardown.
      const serviceRef: MyQueueThis = this;
      const isDestroyed = (): boolean =>
        (serviceRef as { _destroyed?: boolean })._destroyed === true;

      this.logger?.info?.(`[myqueue] job ${job.id} (id=${payload.id})`);

      try {
        // TODO delegate to your application use case — keep the worker thin.
        const result = await this.useCase.execute({ id: payload.id, text: payload.text });
        if (isDestroyed()) return { id: result.id, count: result.count };

        // OPTIONAL: publish a durable cross-service event (@moleculer/channels).
        const broker = this.broker as unknown as {
          sendToChannel?: (topic: string, p: Record<string, unknown>) => Promise<void>;
        };
        if (broker?.sendToChannel) {
          await broker.sendToChannel('my.done.channel', { id: result.id, jobId: String(job.id ?? '') });
          if (isDestroyed()) return { id: result.id, count: result.count };
        }

        return { id: result.id, count: result.count };
      } catch (err) {
        // TODO emit any terminal client signal (e.g. SSE error frame) BEFORE
        // the rethrow so the rethrow can trigger BullMQ retry without leaving
        // the client dangling.
        // Convert domain errors so BullMQ records a useful failedReason, then
        // rethrow — BullMQ's defaultJobOptions.attempts/backoff handle retry.
        throw err;
      }
    },
  },
]);

export { controller };

// ============================================================================
// FILE 2 — queues/index.ts  (barrel: side-effect import + public re-exports)
// ============================================================================
import './my-feature.worker'; // side-effect: registers the worker at load time
export {
  MY_QUEUE_NAME,
  JOB_DO_WORK,
  type MyJobData,
  type MyJobResult,
} from './my-feature.worker';

// ============================================================================
// FILE 3 — actions/do-work.action.ts  (PRODUCER side)
//   addJob / getQueue are injected by api-core ONLY when configure({queue})
//   was supplied — mirror that gate with the same env var.
// ============================================================================
import { defineAction } from '@gertsai/api-core/moleculer';
import config from '../../../../../project.config';
import { MY_QUEUE_NAME, JOB_DO_WORK } from '../queues';
// ... controller.register('do-work', { ... handler }) wrapped in defineAction()

const QUEUE_ENABLED = !!config.REDIS_URL; // single switch: queued vs inline

// inside the action handler ({ params, service, addJob, respond }):
//   if (QUEUE_ENABLED) {
//     const job = await addJob(MY_QUEUE_NAME, JOB_DO_WORK, { id, text });
//     return respond({ id, jobId: String(job?.id), mode: 'queued', count: null });
//   }
//   const { count } = await service.useCase.execute({ id, text }); // inline fallback
//   return respond({ id, jobId: `inline-${Date.now()}`, mode: 'inline', count });

// ============================================================================
// FILE 4 — services/index.ts  (CONNECTION + configure — runs ONCE, pre-import)
// ============================================================================
import IORedis from 'ioredis';
import { ApiController, type BullMQConnectionOptions } from '@gertsai/api-core/moleculer';

const queueConfig: BullMQConnectionOptions | undefined = config.REDIS_URL
  ? {
      connection: new IORedis(config.REDIS_URL, {
        maxRetriesPerRequest: null, // REQUIRED by BullMQ
        enableReadyCheck: false,
      }) as unknown as BullMQConnectionOptions['connection'],
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 3_600, count: 1_000 },
        removeOnFail: { age: 86_400 },
      },
      workerLock: { lockDuration: 300_000, stalledInterval: 60_000, lockRenewTime: 30_000, maxStalledCount: 3 },
    }
  : undefined;

ApiController.configure({
  ...(queueConfig && { queue: queueConfig }), // conditional spread → omit key when no Redis
  // ... sessionFactory, etc.
});

import './myservice'; // side-effect import AFTER configure — registers workers

// ============================================================================
// FILE 5 — index.ts  (entry point — worker-mode gating)
// ============================================================================
// await ApiController.Start({
//   brokerConfig,
//   services: [...],
//   workersEnabled: config.WORKERS_ENABLED,        // false => producer-only (API Gateway)
//   ...(enabledWorkers && { enabledWorkers }),     // CSV WORKERS=... => selective worker node
// });
```

## Best practices

- Let api-core own BullMQ. Never `new Queue()` / `new Worker()` in app code —
  register handlers with `controller.registerWorker(...)` and supply a connection
  via `ApiController.configure({ queue })`. api-core creates exactly one `Worker`
  per queue (routing on `job.name`) at broker start and closes it at stop.
- Register workers at module load, not in a lifecycle handler. Use a
  `queues/index.ts` barrel that bare-imports the worker file for its side-effect.
  api-core reads the registry when it builds the service schema, which is before
  `addStartedHandler` runs.
- Write handlers as non-arrow functions and type `this`. api-core invokes
  `handler.call(service, ctx)`, so `this` is the Moleculer service (with your
  deps stashed by `addStartedHandler`); `ctx: QueueHandlerCtx<Job<T>>` carries
  `{ job, call, addJob, getQueue, logger, meta?, traceContext? }`.
- Keep workers thin — delegate to the same application use case the inline path
  uses. Business logic lives in `this.useCase.execute(...)`; the worker only
  adapts BullMQ transport and emits side-effects.
- Namespace queue names as `<service>.<purpose>` (e.g. `m9s-example.ingest`) and
  export name + job-name as `as const` constants from one module, imported by
  both producer and worker — never hardcode the strings in two places.
- Gate the producer on the SAME signal api-core uses:
  `const QUEUE_ENABLED = !!config.REDIS_URL`, because api-core only injects
  `service.addJob` / `service.getQueue` when a queue config was provided. When
  unset, fall back to running the use case inline.
- Set the retry policy centrally in `defaultJobOptions` on the connection
  (`attempts`, `backoff: { type:'exponential', delay }`,
  `removeOnComplete` / `removeOnFail`). For long-running jobs (LLM/embedding)
  raise `workerLock.lockDuration` (m9s uses 5 min) so jobs aren't marked stalled
  mid-processing.
- On worker failure, rethrow so BullMQ retries — but emit any terminal
  client-facing signal (e.g. SSE `error` frame) BEFORE the throw. Convert domain
  errors to plain `Error`s so the BullMQ `failedReason` is meaningful.
- Re-check a service `_destroyed` flag after every significant `await` and
  short-circuit if set, so jobs abort cleanly during broker teardown and get
  retried elsewhere. Set the flag in `addStoppedHandler`.
- Use `ioredis` with `maxRetriesPerRequest: null` for the BullMQ connection
  (BullMQ requires it). Give the rotation-store / other Redis consumers their own
  client so a slow queue call can't back-pressure them.
- For scale-out, separate producer and worker processes: run API/gateway nodes
  with `WORKERS_ENABLED=false` (jobs still enqueue), and worker nodes with
  `WORKERS_ENABLED=true` (optionally `WORKERS=<queue-csv>` to pin specific
  queues). Tune throughput via `WORKER_CONCURRENCY`.

## Pitfalls

- Using an arrow function for the handler — `this` will NOT be the service, so
  `this.useCase` / `this.logger` / `this.broker` are undefined. Must be a regular
  `async function` / method with an explicit `this:` type.
- Registering the worker inside `addStartedHandler` instead of at module load.
  api-core reads `_registeredQueues` when synthesizing the schema (before started
  fires), so the worker would never boot — the same timing trap as `setWorkflows`.
- Forgetting the side-effect import in `queues/index.ts` (or not importing the
  service barrel in `services/index.ts`). Without the import the `registerWorker`
  call never runs and no worker exists.
- Calling `addJob` when `REDIS_URL` is unset. api-core only injects `addJob` /
  `getQueue` when `configure({ queue })` got a connection; otherwise the method is
  absent. Always gate the producer on `!!config.REDIS_URL` and provide an inline
  fallback.
- Assuming the `@gertsai/queue` package (`createQueue` / `createWorker` /
  `startStandalone`) is what powers this app's queues — it is NOT. m9s-example
  uses api-core's broker-integrated path (api-queue, consumed by `ApiController`).
  `@gertsai/queue` is for standalone headless workers and is not a drop-in for the
  broker path (see `services/index.ts:36-46`).
- Putting business logic in the worker handler. It diverges from the inline/action
  path and breaks the hex-architecture contract — both modes must call the same
  use case and produce the same observable side-effects (m9s mirrors a 4-frame SSE
  sequence in both).
- Swallowing errors in the handler (returning instead of throwing) — BullMQ only
  retries on a thrown error, so swallowed failures silently drop jobs.
- Putting non-serializable values in the job payload. Job data round-trips through
  Redis as JSON — pass plain ids/strings, not class instances or sessions; resolve
  those on the worker side from `this`.
- Expecting read-after-write consistency in queued mode. `POST /ingest/document`
  returns `mode:'queued'` immediately with `chunkCount:null`; a search may return
  `[]` for 1–5 s until the worker finishes. This is eventual consistency, not a
  bug — unset `REDIS_URL` for synchronous demo semantics.
- Omitting `maxRetriesPerRequest: null` on the ioredis client — BullMQ requires it
  and will otherwise misbehave / drop commands.
- Leaving `defaultJobOptions.removeOnFail` / `removeOnComplete` unset — failed /
  completed jobs accumulate in Redis indefinitely. Set age/count caps.

## Canonical files

- [`examples/m9s-example/src/services/ingest/src/queues/ingest-chunk.worker.ts:60-66`](../../../examples/m9s-example/src/services/ingest/src/queues/ingest-chunk.worker.ts) —
  Defines the queue name + job name constants
  (`INGEST_QUEUE_NAME='m9s-example.ingest'`,
  `JOB_PROCESS_DOCUMENT='process-document'`) and job data/result interfaces — the
  public contract shared by producer and worker.
- [`examples/m9s-example/src/services/ingest/src/queues/ingest-chunk.worker.ts:89-224`](../../../examples/m9s-example/src/services/ingest/src/queues/ingest-chunk.worker.ts) —
  The canonical worker registration: `resolveExampleController(...)` then
  `controller.registerWorker(QUEUE_NAME, [{ name, concurrency, handler }])`. Shows
  the non-arrow handler binding `this` to the Moleculer service, the
  `QueueHandlerCtx` param, delegation to `this.useCase.execute(...)`, the
  `_destroyed` mid-shutdown re-check, and error mapping (rethrow → BullMQ retry).
- [`examples/m9s-example/src/services/ingest/src/queues/index.ts:10-18`](../../../examples/m9s-example/src/services/ingest/src/queues/index.ts) —
  Barrel that side-effect-imports the worker module (registers it at module load)
  and re-exports the name/job/type constants for the action layer.
- [`examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts:60-154`](../../../examples/m9s-example/src/services/ingest/src/actions/ingest-document.action.ts) —
  Producer side: `QUEUE_ENABLED = !!config.REDIS_URL`; when queued, calls
  `addJob(INGEST_QUEUE_NAME, JOB_PROCESS_DOCUMENT, payload)` (injected by api-core)
  and returns `mode:'queued'`; otherwise runs `service.useCase.execute(...)`
  inline (`mode:'inline'`).
- [`examples/m9s-example/src/services/index.ts:47-93`](../../../examples/m9s-example/src/services/index.ts) —
  Composition of the queue connection: builds `BullMQConnectionOptions` from
  `REDIS_URL` (ioredis with `maxRetriesPerRequest:null`, `defaultJobOptions`
  attempts/backoff/removeOn*, `workerLock`) and passes it to
  `ApiController.configure({ queue })` BEFORE any service import.
- [`examples/m9s-example/src/index.ts:128-172`](../../../examples/m9s-example/src/index.ts) —
  Entry point: reads `WORKERS_ENABLED` + `WORKERS` env →
  `workersEnabled` / `enabledWorkers`, then
  `ApiController.Start({ workersEnabled, enabledWorkers, ... })`. Shows
  producer-only (API Gateway) vs worker-node launch wiring.
- [`examples/m9s-example/src/services/ingest/lifecycle.ts:106-133`](../../../examples/m9s-example/src/services/ingest/lifecycle.ts) —
  Lifecycle: `addStartedHandler` stashes use-case + adapters onto `ctx.service`
  (what the worker's `this` reads); `addStoppedHandler` sets `_destroyed=true`.
  Documents that api-core owns BullMQ `Queue` / `Worker` creation + teardown — the
  app manages no bullmq handles.
- [`packages/api-core/src/lib/controller/ApiController.class.ts:957-981`](../../../packages/api-core/src/lib/controller/ApiController.class.ts) —
  `registerWorker(queueName, handlers, on?)` impl — stores registrations in
  `_registeredQueues`; multiple calls for one queue append handlers.
- [`packages/api-core/src/lib/controller/ApiController.class.ts:194-271`](../../../packages/api-core/src/lib/controller/ApiController.class.ts) —
  Static `_workersEnabled` / `_enabledWorkers` flags set by
  `ApiController.Start({ workersEnabled, enabledWorkers })`; JSDoc documents
  API-gateway / worker / selective modes.
- [`packages/api-core/src/lib/controller/ApiController.class.ts:1271-1321`](../../../packages/api-core/src/lib/controller/ApiController.class.ts) —
  Boot/teardown wiring: delegates to
  `@gertsai/api-queue.bootQueueWorkers({ workersEnabled, enabledWorkers, queueConfig })`
  in `started()`, and `stopQueueWorkers` / `stopQueues` in `stopped()`.
- [`packages/api-queue/src/lifecycle.ts:10-101`](../../../packages/api-queue/src/lifecycle.ts) —
  `bootQueueWorkers` — the actual gating: always ensures `getQueue(name)` exists
  (so `addJob` works in any mode), skips worker creation when `!workersEnabled`
  (API Gateway) or when `enabledWorkers` set excludes the queue (selective);
  creates ONE `Worker` per queue routing on `job.name`. Mode table in the header
  comment.
- [`packages/api-queue/src/types.ts:176-226`](../../../packages/api-queue/src/types.ts) —
  `QueueHandlerCtx<T>` (the
  `{ job, call, logger, addJob, getQueue, meta?, traceContext? }` shape the
  handler receives) and `QueueOptions<Name, Concurrency, Handler>`
  (`{ name, concurrency, handler }`).
- [`packages/api-queue/src/types.ts:88-104`](../../../packages/api-queue/src/types.ts) —
  `BullMQConnectionOptions` type —
  `{ connection, defaultJobOptions?, prefix?, workerLock? }`.
- [`packages/queue/README.md:1-165`](../../../packages/queue/README.md) —
  `@gertsai/queue` standalone primitives (`createQueue` / `createWorker` /
  `startStandalone`). NOTE: m9s-example does NOT use this package for its queue —
  api-core's broker-integrated path is separate (see `services/index.ts:36-46`).

## @gertsai packages used

- `@gertsai/api-core/moleculer` — `ApiController.registerWorker`,
  `ApiController.configure({ queue })`,
  `ApiController.Start({ workersEnabled, enabledWorkers })`, `QueueHandlerCtx`,
  `BullMQConnectionOptions`, `ServiceContextBase`, `resolveController`,
  `addStartedHandler` / `addStoppedHandler`.
- `@gertsai/api-core/contracts` — `APIError`, `ResponseCode` (used by the producer
  action layer for domain→HTTP error mapping).
- `@gertsai/api-queue` — queue runtime extracted from api-core in Wave 15.B:
  `bootQueueWorkers`, `stopQueueWorkers`, `stopQueues`,
  `createQueueServiceMethods`, `createQueueSchemaFragment`, and the
  `QueueHandlerCtx` / `QueueHandler` / `QueueOptions` / `BullMQConnectionOptions`
  types. Consumed transitively via api-core, not imported directly by the app.
- `@gertsai/queue` — `createQueue` / `createWorker` + `/standalone`
  `startStandalone`. NOT used by m9s-example's queue path; documented as the
  standalone-worker alternative.
- `@gertsai/session` — `Session` (system session built in the composition root,
  unrelated to per-job auth but part of the wiring).
- `bullmq` — peer; `Job` / `Queue` / `Worker` types (runtime owned by api-core).
- `ioredis` — peer; Redis connection for the BullMQ config.
