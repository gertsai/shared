---
depth: standard
id: PRD-057
kind: prd
last_modified_at: 2026-05-20T09:19:11.696918+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 19 — close 5 HIGH + 7 MED entity adapter findings from EVID-074
---

## Problem Statement

EVID-074 (Wave 18 entity adapter audit) surfaced 5 HIGH + 7 MED + 5 LOW findings across `@gertsai/entity-{vue,react,solid,svelte}`. Top concerns: notify-timing drift across adapters, re-entrancy contract underspecified, Solid test-coverage gap.

## Goals

Close all 5 HIGH + at least the 7 MED findings.

## Functional Requirements

**FR-001 (H-V1)** — Document notify-timing in `@gertsai/entity` `ReactiveAdapter` interface JSDoc. Each adapter pins its own timing in adapter-level JSDoc (Vue: microtask via Vue flush queue; React: sync; Svelte: sync; Solid: via Solid reactive graph).

**FR-002 (H-R1, H-Sv1)** — Pin re-entrancy contract with explicit tests in entity-react + entity-svelte `re-entrancy.test.ts`. Assert that subscriber receives final post-mutation snapshot (not stale).

**FR-003 (H-S1)** — Add Solid test parity: create proxy-traps.test.ts, re-entrancy.test.ts, weakmap-gc.test.ts, prototype-pollution.test.ts in entity-solid mirroring entity-react/svelte coverage.

**FR-004 (H-S2)** — Solid `set` trap try/catch for `produce` failures. Currently fail-silent if `produce` throws.

**FR-005 (M-Sv1)** — `entityStore` runtime adapter check — verify the entity has the svelte adapter before returning a store, else throw informative error.

**FR-006 (M-V1, L-S1)** — Add `__resetCacheForTests()` to entity-vue + entity-solid (mirroring entity-react + entity-svelte).

**FR-007 (M-R2)** — Add `markRaw` non-reversibility test per adapter (Vue, React, Solid, Svelte).

## Out of Scope

- Lifting subscriber API into `ReactiveAdapter` (v1.0.0 candidate, separate)
- React WeakMap state consolidation (Wave 20 candidate per EVID-074)
- Cross-adapter consolidation beyond JSDoc contract documentation

## Related Artifacts

- EVID-074 (audit source)
- PRD-056 (Wave 18 audit PRD)
- ADR-008 (entity reactive adapters)
- Sprint 3.8 (originating implementation)



