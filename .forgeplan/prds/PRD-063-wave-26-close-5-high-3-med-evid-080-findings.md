---
depth: standard
id: PRD-063
kind: prd
last_modified_at: 2026-05-20T21:33:53.546144+00:00
last_modified_by: claude-code/2.1.145
status: active
title: Wave 26 — close 5 HIGH + 3 MED EVID-080 findings
---

## Problem Statement

EVID-080 (Wave 25 audit) surfaced 5 HIGH + 3 MED across 4 packages. All patch-bump (no API breaks). Close in single wave.

## Functional Requirements

**FR-1 (H1) session** — `Session.token` getter throws `SessionDestroyedError` (not bare `Error`). Update test to assert class-match (not string-match).

**FR-2 (H2) runtime-context** — `provider-context.ts:97-105` `_lookup` refactor to distinguish bound-to-undefined vs not-bound. Return `{ present: boolean; value: unknown }` or use a unique sentinel. `get<T>` raises `ProviderNotFoundError` only on `!present`.

**FR-3 (H3) rpc-proxy-builder** — nest cache `WeakMap<actions, WeakMap<transport, proxy>>` so different transports sharing same actions get distinct proxies. Add cross-transport test.

**FR-4 (H4) entity** — `Entity.$patch` + `EntityWithMetadata.$setMetadata` swap `for...in` → `Object.keys` to skip prototype chain.

**FR-5 (H5) entity** — `EntityJSON.data: Readonly<Data>` widening.

**FR-6 (M1+M2) entity deep-equal** — `Object.is` for primitives + has-key guard for objects (current impl misses NaN equality + symmetric key absence).

**FR-7 (M6) tenant-resolver** — `path.strategy.ts` sentinel-collision swap to safer marker.

**FR-8 (M7) tenant-resolver** — NON_PRINTABLE doc-only note about ASCII-only limitation.

## Non-Functional Requirements

Build green + workspace typecheck 0 errors. All existing tests pass + new ones per fix. Patch-bump for all 4 packages (no API breaks).

## Out of Scope

LOWs (8) — cosmetic, deferred. Wave 15.D ApiController action-pipeline still pending.

## Related Artifacts

- EVID-080 (audit source)
- PRD-062 (Wave 25 audit PRD)



