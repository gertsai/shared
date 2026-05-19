---
depth: standard
id: EVID-069
kind: evidence
last_modified_at: 2026-05-19T21:36:10.581219+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-051
  relation: informs
status: active
title: Wave 15.B — @gertsai/api-queue Tier-2 extracted from ApiController
---

## Summary

Wave 15.B extracts BullMQ queue/worker lifecycle from `@gertsai/api-core/ApiController.class.ts` (1,511 LOC god-class) into new Tier-2 `@gertsai/api-queue@0.1.0`. Solo teammate (`typescript-pro`) under team-lead orchestration. Pure functional extraction preserves all public api-core surface. `ApiController.class.ts` shrinks 1511 → 1241 (-270 LOC); `controller/types.ts` shrinks 1037 → 760 (-277 LOC). Workspace grows 39 → 40 packages.

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: refactor_verification
- **linked_artifact**: PRD-051
- **summary**: 547 LOC moved out of api-core into new Tier-2; 0 break; SPEC-020 surfaces selective worker-mode previously undocumented.

## Closures (Teammate R)

### New package `@gertsai/api-queue@0.1.0` (Tier-2, +935 src LOC)

| File | LOC | Role |
|---|---|---|
| `package.json` | — | Deps: `@gertsai/queue: workspace:*` + `lodash.forin`. Peer: `bullmq` + `moleculer`. |
| `tsconfig.json`, `tsup.config.ts`, `vitest.config.mts`, `README.md`, `LICENSE` | scaffold | Tier-2 mirrors `runtime-context` |
| `src/types.ts` | 425 | All BullMQ types: ConnectionOptions, WorkerLockOptions, JobStatus, QueueTraceContext, QueueHandler, QueueOptions, ApiControllerQueues, QueueProcessingStatus (32-event union), QueueSchemaFragment, etc. |
| `src/schema.ts` | 167 | `createQueueSchemaFragment(queue, opts)` — pure function with `QueueErrorTranslator` for api-core's APIError-scrub semantics (preserves boundary) |
| `src/methods.ts` | 82 | `createQueueServiceMethods(queueConfig)` factory for `getQueue`/`addJob` mixin |
| `src/lifecycle.ts` | 281 | `bootQueueWorkers/stopQueueWorkers/stopQueues` — honours `workersEnabled`/`enabledWorkers` selective-mode |
| `src/index.ts` | 64 | Barrel |
| `src/methods.test.ts` | 85 | 4 smoke tests (all pass) |

### Approach: pure functional extraction

Chosen over class composition / mixin. New package exports stateless helpers; state stays on `ApiController` (registry + selective-mode flags tied to controller lifecycle and shared across services). Preserves existing `ApiController.registerWorker()` / `ApiController.Start({workersEnabled, enabledWorkers})` public surface verbatim — zero consumer change.

### api-core changes

- `ApiController.class.ts`: **1511 → 1241 LOC (-270, -18%)**. `_createQueueSchema()` delegates to `createQueueSchemaFragment` with `APIError`-scrub translator; `started()` worker boot → `bootQueueWorkers(this, ...)`; `stopped()` teardown → `stopQueueWorkers/stopQueues`.
- `controller/types.ts`: **1037 → 760 LOC (-277, -27%)**. 10 type declarations removed; re-exported from `@gertsai/api-queue` for back-compat.
- `package.json`: `+@gertsai/api-queue: workspace:*` dep.

### SPEC-020 created

`.forgeplan/specs/SPEC-020-selective-worker-mode-for-gertsai-api-queue-api-gateway-vs-worker-node-deployment.md`

Documents previously-undocumented `_workersEnabled` + `_enabledWorkers` semantics per EVID-067 §Doctor Strange #2. Includes mode matrix (API Gateway / Worker Node / All-in-One), invariants, operational logging.

## Acceptance verification (all PASS)

| Scope | Build | Typecheck | Tests |
|---|---|---|---|
| `@gertsai/api-queue` (new) | ✅ ESM+CJS+DTS (9.4KB+17.1KB) | ✅ 0 errors | ✅ **4 pass** |
| `@gertsai/api-core` | ✅ all 4 entries (index, contracts, moleculer, runtime/node) | ✅ 0 errors | ✅ **284/284 pass**, 12 test files |
| Workspace (40 pkgs + 3 examples) | ✅ all green | ✅ **0 errors** | — (svelte-check 1079 files / 0 warnings) |

## Concerns surfaced (non-blocking)

1. **`exactOptionalPropertyTypes: true`** caused cross-package strictness — `traceContext: traceContext` (possibly undefined) was inline-OK in api-core but rejected when imported across packages. Solved with conditional spread `...(traceContext !== undefined && { traceContext })` in `lifecycle.ts`. Not a behavioural change.
2. **Tier-2 classification**: api-queue has no other Tier-2 deps (only Tier-1 `@gertsai/queue` + peer `moleculer + bullmq`). Could argue Tier-1, but Moleculer peer + `QueueAwareService` adapter is a structural coupling to the api-core deployment model. Tier-2 matches `runtime-context` precedent.
3. **`QueueActionCallFunction` declared twice** — api-queue's simplified version + api-core's full generic with `RegisteredActions` declaration-merge. api-core version is the public one consumers import; api-queue version is internal. Consumers see no change. Worth a one-line note if surfaces during Wave 15.C.
4. **State still in `ApiController`** — `_registeredQueues`, `_workersEnabled`, `_enabledWorkers` remain static fields. Intentional (preserves `ApiController.Start({...})` ergonomics + cross-service singleton config model). Future Wave-16 instance-per-tenant DI refactor would lift these into `ApiQueueManager` instance — straightforward from current shape.

## Net diff

- api-core: **-547 LOC** (-270 ApiController.class.ts + -277 types.ts)
- api-queue: **+935 LOC** (4 src + 1 test + JSDoc + conditional spreads for `exactOptionalPropertyTypes`)
- Net workspace: **+388 LOC** (includes new READMEs + scaffold; single source of truth wins)
- Workspace size: **39 → 40 packages**

## Toward Wave 15 cumulative goal

EVID-067 §Total Wave 15: api-core 9,772 → ~6,500 LOC (33% reduction). 
- 15.A: api-core lost ~1,901 LOC envelope cluster (~19%)
- 15.B: api-core lost ~547 LOC queue lifecycle (~6%)
- Cumulative: **~25% of api-core source extracted** (toward 33% target)

## Remaining Wave 15

- **15.C**: Pub/Sub extraction → `@gertsai/api-pubsub` Tier-2 (~250 LOC, ~1.5d)

## Refs

- PRD-051 (target)
- SPEC-020 (selective worker-mode contract)
- EVID-067 (Wave 15 audit — §15.B + §Doctor Strange #2)
- EVID-068 (Wave 15.A precedent)



