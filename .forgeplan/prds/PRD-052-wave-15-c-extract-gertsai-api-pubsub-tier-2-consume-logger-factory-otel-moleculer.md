---
depth: standard
id: PRD-052
kind: prd
last_modified_at: 2026-05-19T21:42:24.784553+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 15.C — extract @gertsai/api-pubsub Tier-2 + consume logger-factory + otel/moleculer
---

## Problem Statement

EVID-067 §15.C identifies Pub/Sub lifecycle (~110 LOC) + ~55 LOC inline traceparent assembly + ~20 LOC fallback logger as the final Wave 15 extraction targets in `ApiController.class.ts`. Combined ~250 LOC. Completing 15.C delivers EVID-067's target 33% api-core source reduction.

EVID-067 §Doctor Strange #5 also flagged ~17 lines of commented-out detached-subscription cleanup code that should surface as a SPEC or be removed during the extraction.

## Goals

1. Create new `@gertsai/api-pubsub@0.1.0` Tier-2 package — optional Google Cloud Pub/Sub support via peer dep.
2. Move ~110 LOC of Pub/Sub lifecycle (`_subscribedTopics`, `_subscribePubsub()`, `stopped()` Pub/Sub teardown) from `ApiController.class.ts`.
3. Adopt `@gertsai/logger-factory` for the ~20 LOC fallback logger inside `ApiController`.
4. Adopt `@gertsai/otel/moleculer` for ~55 LOC of inline traceparent assembly.
5. Address EVID-067 §Doctor Strange #5 (commented-out detached-subscription cleanup) — either implement or delete with rationale.
6. Re-export shim preserves `ApiController.subscribePubsub(...)` / topic subscription public surface.

## Functional Requirements

**FR-001** — New `packages/api-pubsub/`:
- Tier-2 package, deps minimal (none of `@gertsai/*` if avoidable — optional peer for `@google-cloud/pubsub` only).
- Peer deps: `moleculer` + `@google-cloud/pubsub` (lazy-required).
- Mirror Wave 15.B `api-queue` scaffold.

**FR-002** — Extract ~110 LOC Pub/Sub lifecycle from `ApiController.class.ts`:
- `_subscribedTopics` registry
- `_subscribePubsub()` boot
- `stopped()` Pub/Sub teardown (note: includes 17 lines of commented-out code per EVID-067 §Doctor Strange #5 — decide implement-or-delete)

**FR-003** — Adopt `@gertsai/logger-factory` for fallback logger (~20 LOC). Add `@gertsai/logger-factory: workspace:*` dep on api-core.

**FR-004** — Adopt `@gertsai/otel/moleculer` for traceparent assembly (~55 LOC). Add `@gertsai/otel: workspace:*` dep on api-core (peer if avoidable).

**FR-005** — Resolve EVID-067 §Doctor Strange #5 — the disabled `detachSubscription()` cleanup path. Either:
- Implement (re-enable the call) + add test for shutdown ordering
- Delete the dead code + document in SPEC why no detach happens on stopped()
- Document rationale either way

**FR-006** — Public surface unchanged: `ApiController.subscribePubsub()` / topic registration / `stopped()` lifecycle hook continue working identically.

## Non-Functional Requirements

**NFR-001** — Build green + workspace typecheck 0 errors.
**NFR-002** — 284 api-core tests + new api-pubsub tests pass.
**NFR-003** — Zero behaviour change for users not using Pub/Sub.
**NFR-004** — Workspace size grows 40 → 41 packages.

## Out of Scope

- Refactoring Pub/Sub internals beyond extraction
- Adding new Pub/Sub features
- OAuth removal (Wave 16+ per EVID-067 §Doctor Strange #4)

## Related Artifacts

- EVID-067 (Wave 15 audit — §15.C + §Doctor Strange #5)
- EVID-068 (Wave 15.A precedent)
- EVID-069 (Wave 15.B precedent)

## Target Audience

- Maintainers of `@gertsai/api-core` (final Wave 15 god-class reduction)
- Consumers using Pub/Sub topic subscription
- v1.0.0 release coordinators



