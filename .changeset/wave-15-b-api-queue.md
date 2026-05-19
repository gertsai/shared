---
'@gertsai/api-queue': minor
'@gertsai/api-core': patch
---

Wave 15.B — Extract BullMQ queue/worker lifecycle from `@gertsai/api-core/ApiController` into new Tier-2 `@gertsai/api-queue` package per EVID-067 §15.B.

**Rationale**: `ApiController.class.ts` (1,511 LOC god-class per EVID-067 §1) had ~540 LOC of BullMQ queue/worker lifecycle (selective worker-mode, `_registeredQueues`, `_bootWorkers()`, `_addJob()`, `_getQueue()`) entangled with action pipeline logic. Plus ~190 LOC of BullMQ types in `controller/types.ts`. Extraction enables consumers needing only queue lifecycle without api-core's Moleculer transport plumbing.

**New package** `@gertsai/api-queue@0.1.0` (Tier-2):
- Deps: `@gertsai/queue: workspace:*` (Tier-1 BullMQ wrappers) + `lodash.forin`
- Peer deps: `moleculer` + `bullmq` (lazy-required)
- 4 src files (+935 LOC):
  - `types.ts` (425 LOC) — all BullMQ types moved from api-core
  - `schema.ts` (167 LOC) — `createQueueSchemaFragment(queue, opts)` pure function with `QueueErrorTranslator` for api-core's `APIError`-scrub semantics
  - `methods.ts` (82 LOC) — `createQueueServiceMethods(queueConfig)` factory for `getQueue`/`addJob` mixin
  - `lifecycle.ts` (281 LOC) — `bootQueueWorkers/stopQueueWorkers/stopQueues` honouring `workersEnabled`/`enabledWorkers`
- `methods.test.ts` (4 smoke tests pass)

**Approach: pure functional extraction** (chosen over class composition / mixin). New package exports stateless helpers; state stays on `ApiController` (registry + selective-mode flags tied to controller lifecycle). Preserves existing `ApiController.registerWorker(...)` / `ApiController.Start({workersEnabled, enabledWorkers})` public surface verbatim — zero consumer change.

**api-core changes**:
- `ApiController.class.ts`: 1511 → 1241 (**-270 LOC**, -18%). `_createQueueSchema()` delegates to `createQueueSchemaFragment`; `started()` worker boot → `bootQueueWorkers(this, {workersEnabled, enabledWorkers, queueConfig})`; `stopped()` teardown → `stopQueueWorkers/stopQueues`. Removed unused bullmq imports (Queue/Worker/Job/JobDataWithTraceContext).
- `controller/types.ts`: 1037 → 760 (**-277 LOC**, -27%). 10 type declarations removed; re-exported from `@gertsai/api-queue` for back-compat.
- `package.json`: +`@gertsai/api-queue: workspace:*` dep.

**SPEC-020 created**: documents selective worker-mode contract (API Gateway vs Worker Node deployment patterns) per EVID-067 §Doctor Strange #2. Previously undocumented; now in `.forgeplan/specs/`.

**Behaviour**: zero change. All existing `ApiController.registerWorker()` / `service.addJob()` / `service.getQueue()` public methods preserved.

**Tests**: 284/284 api-core tests pass + 4 new api-queue tests. Workspace typecheck 0 errors across 40 packages + 3 example apps (svelte-check 1079 files / 0 errors).

**Workspace size**: 39 packages + 3 examples → **40 packages + 3 examples**.

**Concern flagged**: `QueueActionCallFunction` declared twice (api-queue simplified + api-core full generic with RegisteredActions declaration-merge). Internal-only; consumers see no change. Worth a one-line note if surfaces during Wave 15.C.

**After Wave 15.A+B**: api-core source shrinks ~22% (toward EVID-067's 33% Wave 15 total goal). Remaining 15.C — Pub/Sub extraction (~250 LOC, ~1.5d).

Refs: PRD-051, SPEC-020, EVID-067 (Wave 15 audit), EVID-068 (Wave 15.A precedent).
