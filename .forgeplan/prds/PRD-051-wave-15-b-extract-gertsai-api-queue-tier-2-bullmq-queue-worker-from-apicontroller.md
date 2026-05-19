---
depth: standard
id: PRD-051
kind: prd
last_modified_at: 2026-05-19T21:20:59.938290+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 15.B — extract @gertsai/api-queue Tier-2 (BullMQ queue/worker from ApiController)
---

## Problem Statement

EVID-067 §15.B identifies BullMQ queue/worker lifecycle as the second decomposition target inside `ApiController.class.ts` (1,511 LOC god-class). ~530 LOC handling queue registration + worker boot + selective worker-mode is currently inline in `ApiController._registeredQueues`, `ApiController._workersEnabled`, `ApiController._enabledWorkers`, `_bootWorkers()`, `_addJob()`, `_getQueue()`. Plus ~190 LOC of associated types in `controller/types.ts`.

This concern is reusable outside the `ApiController` god-class — any service that needs BullMQ queue lifecycle + selective worker-mode (the "API Gateway vs Worker Node" deployment pattern, per EVID-067 §Doctor Strange #2) should be able to consume it directly via `@gertsai/api-queue` without depending on api-core's transport plumbing.

## Goals

1. Create new `@gertsai/api-queue@0.1.0` Tier-2 package consuming existing `@gertsai/queue` Tier-1.
2. Move queue/worker lifecycle code (~530 LOC) from `ApiController.class.ts` + types (~190 LOC) from `controller/types.ts` into new package.
3. Document the selective worker-mode (API Gateway vs Worker Node) — surface to a SPEC.
4. Re-export shim from api-core preserves `registerWorker(...)` + `addJob(...)` + `getQueue(...)` public surface.
5. Zero breaking change.

## Functional Requirements

**FR-001** — New package `packages/api-queue/`:
- `package.json` — `"name": "@gertsai/api-queue"`, version `0.1.0`, Tier-2.
- Deps: `@gertsai/queue: workspace:*` (Tier-1 BullMQ wrappers).
- Peer deps: `moleculer` (since worker lifecycle integrates with broker context), `bullmq`.
- Mirror Tier-2 conventions: `packages/runtime-context/` is a good reference.

**FR-002** — Extract from `ApiController.class.ts` (Approx 530 LOC):
- Static `_registeredQueues`, `_workersEnabled`, `_enabledWorkers` flags → consumer-facing facade in api-queue
- `_bootWorkers()`, `_addJob()`, `_getQueue()` methods → exported functions or class
- Worker lifecycle hook chain

**FR-003** — Extract from `controller/types.ts` (Approx 190 LOC):
- BullMQ-specific types: `RegisteredQueue`, `QueueAddOptions`, worker job typings, etc.

**FR-004** — Re-export shim in api-core preserves `ApiController.registerWorker()` / `service.addJob()` / `service.getQueue()` public methods. Existing consumers' code paths unchanged.

**FR-005** — Surface SPEC documenting selective worker-mode (`_workersEnabled` + `_enabledWorkers` semantics, API Gateway vs Worker Node deployment patterns) per EVID-067 §Doctor Strange #2.

## Non-Functional Requirements

**NFR-001** — Build green: new package + api-core + all consumers compile.
**NFR-002** — All api-core + consumer tests pass.
**NFR-003** — Zero behaviour change.
**NFR-004** — Workspace size grows from 39 → 40 packages.

## Out of Scope

- Wave 15.C Pub/Sub extraction (separate PR)
- Refactoring BullMQ internals — `@gertsai/queue` Tier-1 stays as-is
- Renaming `registerWorker`/`addJob`/`getQueue` — pure mechanical extraction

## Related Artifacts

- EVID-067 (Wave 15 audit — §15.B recommendation)
- EVID-068 (Wave 15.A precedent — same extraction pattern)
- ADR-003 (subpath/runtime boundaries)

## Target Audience

- Maintainers of `@gertsai/api-core` (god-class shrinks)
- Operators of API Gateway / Worker Node deployment patterns (new SPEC clarifies semantics)
- Consumers building new queue-driven services




