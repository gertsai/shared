# @gertsai/api-queue

Tier-2 BullMQ queue/worker lifecycle for `@gertsai/api-core` services.

Extracted from `@gertsai/api-core/lib/controller/ApiController.class.ts` in
Wave 15.B (PRD-051 / EVID-067 §15.B).

## What's inside

- **Types** — `BullMQConnectionOptions`, `BullMQWorkerLockOptions`,
  `QueueOptions`, `QueueHandler`, `QueueHandlerCtx`,
  `ApiControllerRegisteredQueue`, `ApiControllerQueues`,
  `QueueProcessingStatus` (32-event union), `JobStatus`,
  `QueueTraceContext`, `JobDataWithTraceContext`, `TracedJobData`,
  `QueueJob`, `QueueActionCallFunction`.
- **`createQueueSchemaFragment(queue, opts)`** — pure function that builds
  the Moleculer service-schema queue block (handlers + tracing-aware
  wrapper) from a registered queue.
- **`createQueueServiceMethods(config)`** — returns the `getQueue` / `addJob`
  methods that Moleculer mixes into the service instance. Only emits methods
  when `config.queue` is supplied.
- **`bootQueueWorkers(service, options)`** — iterates `service.schema.queues`,
  creates one BullMQ Worker per queue with internal routing, honours the
  selective worker-mode flags (`workersEnabled`, `enabledWorkers`), populates
  `service.$workers`.
- **`stopQueueWorkers(service)`** — drains + closes workers in `service.$workers`.
- **`stopQueues(service)`** — closes queue instances in `service.$queues`.

## Selective worker-mode (API Gateway vs Worker Node)

This package surfaces the deployment-pattern semantics first introduced in
EVID-067 §Doctor Strange #2:

| Mode | `workersEnabled` | `enabledWorkers` | Behaviour |
|------|------------------|------------------|-----------|
| All workers (default) | `true` | `undefined` | Every registered queue boots a worker. |
| API Gateway | `false` | (ignored) | No workers boot. `service.addJob(...)` still pushes to Redis. Jobs are processed by a separate worker node. |
| Worker Node | `true` | `undefined` | Same as default — typically paired with `enabledServices` to load only worker services. |
| Selective workers | `true` | `['queue-a','queue-b']` | Only listed queues boot workers; others can be `addJob`-ed but not consumed locally. |

The `getQueue(name)` method always creates the queue instance (so `addJob`
works regardless of worker mode). Worker creation is what gets gated.

See `.forgeplan/specs/SPEC-018-*.md` for the full semantics.

## Origin

Extracted from `@gertsai/api-core` in Wave 15.B.
`@gertsai/api-core` keeps a back-compat re-export shim at
`lib/controller/types.ts` for the type surface.

## License

Apache-2.0
