---
depth: standard
id: SPEC-020
kind: spec
links:
- target: PRD-051
  relation: informs
status: draft
title: Selective worker-mode for @gertsai/api-queue (API Gateway vs Worker Node deployment)
---

# SPEC-020: Selective worker-mode for @gertsai/api-queue (API Gateway vs Worker Node deployment)

## Summary

Defines the contract for the `workersEnabled` + `enabledWorkers` flags exposed by `@gertsai/api-queue.bootQueueWorkers` (and surfaced through `ApiController.Start({...})`). Captures the API Gateway vs Worker Node deployment matrix first introduced in EVID-067 §Doctor Strange #2.

## Scope

- Contract of `BootQueueWorkersOptions` (in `@gertsai/api-queue`)
- Behaviour of `ApiController.Start({ workersEnabled, enabledWorkers })` (in `@gertsai/api-core`)
- Interaction with `getQueue` / `addJob` (always available regardless of worker mode)
- Out of scope: BullMQ internals, broker lifecycle, Moleculer service registration

## Mode Matrix

| Mode | `workersEnabled` | `enabledWorkers` | Effect |
|------|------------------|------------------|--------|
| All workers (default) | `true` | `undefined` | Every registered queue boots a worker. Default behaviour. |
| API Gateway | `false` | (ignored) | No workers boot. `service.addJob(...)` still pushes to Redis. Jobs are processed by a separate Worker-Node deployment. |
| Worker Node | `true` | `undefined` | Same as default — typically paired with `enabledServices` to load only worker-side services. |
| Selective workers | `true` | `['queue-a','queue-b']` | Only the listed queues boot workers; other registered queues can be `addJob`-ed but not consumed locally. |

`getQueue(name)` always creates the queue instance — `addJob` works in every mode. The selective filter only gates **worker creation**, not queue creation.

## API Contract

### `BootQueueWorkersOptions` (`@gertsai/api-queue`)

```typescript
export type BootQueueWorkersOptions = {
  /** Whether to boot workers at all. `false` = API Gateway mode. */
  workersEnabled: boolean;
  /**
   * If a Set is supplied, only queues whose names are in the set boot workers.
   * null means "no filter — boot every queue that has handlers".
   */
  enabledWorkers: Set<string> | null;
  /** BullMQ connection config (required — without it there are no workers). */
  queueConfig: BullMQConnectionOptions;
};
```

### `ApiController.Start({...})` (`@gertsai/api-core`)

```typescript
ApiController.Start({
  brokerConfig,
  services: [ApiService],
  // ...
  /** Enable BullMQ workers. false = API Gateway mode. Default: true */
  workersEnabled?: boolean;
  /** Specific worker queue names to enable. If undefined, all workers boot. */
  enabledWorkers?: string[];
});
```

## Reference Deployments

**API Gateway node** — only adds jobs to Redis, never consumes:
```typescript
ApiController.Start({
  brokerConfig,
  services: [ApiService],
  enabledServices: ['v1.admin', 'v1.files'],
  workersEnabled: false,
});
```

**Worker node** — only consumes; typically no HTTP gateway:
```typescript
ApiController.Start({
  brokerConfig,
  services: [],  // No API service
  enabledServices: ['v1.queue', 'v1.llm', 'v1.graph'],
  workersEnabled: true,
});
```

**Selective workers** — partial worker subset:
```typescript
ApiController.Start({
  brokerConfig,
  services: [ApiService],
  enabledServices: ['v1.queue'],
  enabledWorkers: ['gerts-jobs'],  // Only gerts-jobs, not iam-jobs
});
```

## Invariants

- I-1 — `addJob` and `getQueue` are **always** available when `_config.queue` is set, regardless of mode. The mode flag only affects worker creation.
- I-2 — When `workersEnabled === false` AND `enabledWorkers` is supplied, the `enabledWorkers` filter is ignored (no workers boot at all).
- I-3 — `bootQueueWorkers` is idempotent within a service started-handler — multiple calls overwrite `service.$workers[name]` for the same queue.
- I-4 — Worker selection is performed per queue at boot time. Late dynamic changes are not supported (re-start the service or process to change mode).

## Operational Logging

The lifecycle module emits one of three log lines per queue at boot:

- `🚀 BullMQ Worker started: <queueName> (handlers: <names>, concurrency: <n>)` — worker booted.
- `⏭️  Skipping worker: <queueName> (WORKERS_ENABLED=false)` — API Gateway mode.
- `⏭️  Skipping worker: <queueName> (not in WORKERS)` — selective filter excluded this queue.

Operators MAY use these to verify the intended deployment mode is in effect at boot time.

## Related

- PRD-051 — Wave 15.B extraction of @gertsai/api-queue
- EVID-067 — §15.B + §Doctor Strange #2 (origin of selective worker-mode)
- EVID-068 — Wave 15.A precedent (same pattern, envelope extraction)
- ADR-003 — Platform Runtime Boundaries (subpath strategy)

## Versioning

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-20 | Initial specification — extracted from EVID-067 §Doctor Strange #2 + ApiController.class.ts inline implementation |


