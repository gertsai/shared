---
depth: standard
id: PRD-059
kind: prd
last_modified_at: 2026-05-20T18:36:40.440842+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 21 — close 9 HIGH + 2 MED + 2 CP from EVID-076 (ws-rpc + storage + hsm + query-dsl)
---

## Problem Statement

EVID-076 (Wave 20 deep audit) surfaced 9 HIGH + several MED findings across ws-rpc + storage-core + entity-storage + query-dsl + hsm. Plus 3 cross-package observations (CP-1 audit field hardcoding, CP-2 query DSL incoherence, CP-3 ws-rpc trust model docs).

## Goals

Close all 9 HIGH + key MEDs in one wave. Defer CP-3 (docs-only) to Wave 22.

## Functional Requirements

**Teammate W — ws-rpc + hsm + quoteIdent (~3h scope)**:
- FR-W1 (H-WS-1) — Fix reconnect chain: `createWebSocket()` rejection (DNS/ECONNREFUSED) before onopen must trigger reconnect schedule
- FR-W2 (H-WS-2) — Bound `wildcardMatch` recursion (limit `**` segments at subscribe time + max recursion depth)
- FR-W3 (H-WS-3) — Upgrade heartbeat to protocol-ping in Node (not app-level)
- FR-W4 (H-HSM-1) — `ConvergentEncryption.decrypt` always verify content hash (not optional)
- FR-W5 (M-WS-1) — Reconnect backoff `Math.pow(base, attempts-1)` off-by-one
- FR-W6 (M-QDS-1) — `quoteIdent` actually emit `"<name>"` not just return identifier

**Teammate X — entity-storage + query-dsl + audit constant (~4h scope)**:
- FR-X1 (H-ENT-1) — InMemoryStorageProvider.runTransaction: don't overwrite collection wholesale on commit; do per-doc merge or fail-on-conflict
- FR-X2 (H-ENT-2) — Add transaction-conflict tests covering concurrent commits + writes-without-reads version check
- FR-X3 (H-ENT-3) — `applyQueryFilter` supports `offset` (currently ignores)
- FR-X4 (H-ENT-4) — `applyQueryFilter` supports `limitToLast` (currently ignores)
- FR-X5 (CP-2) — Query DSL capability matrix: define `QueryCapabilities` type that compileToSql + applyQueryFilter advertise; validateQuery rejects constraints unsupported by target capability set
- FR-X6 (CP-1) — Export shared audit field constants from `@gertsai/entity-audit` (`AUDIT_FIELDS.creator_uuid`, `.created_at`, etc.)

## Non-Functional Requirements

**NFR-001** — Build green + workspace typecheck 0 errors.
**NFR-002** — All existing tests pass + new ones added pass.
**NFR-003** — Patch bumps for non-breaking fixes; minor for ws-rpc/entity-storage if behaviour changes affect public contract.

## Out of Scope

- CP-3 trust-model documentation (Wave 22 docs)
- Wave 15.D ApiController action-pipeline extraction (still pending)
- Any audit not in EVID-076

## Related Artifacts

- EVID-076 (audit source)
- PRD-058 (Wave 20 audit PRD)
- ADR-005 (storage-core architecture)



