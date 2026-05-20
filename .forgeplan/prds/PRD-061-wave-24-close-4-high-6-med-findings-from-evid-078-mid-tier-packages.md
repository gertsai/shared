---
depth: standard
id: PRD-061
kind: prd
last_modified_at: 2026-05-20T20:04:49.215566+00:00
last_modified_by: claude-code/2.1.142
status: active
title: Wave 24 — close 4 HIGH + 6 MED findings from EVID-078 (mid-tier packages)
---

## Problem Statement

EVID-078 (Wave 23 mid-tier audit) surfaced 4 HIGH + 6 MED findings across auth-openfga + rest-request-manager + queue + session-guard. Close all 4 HIGH + key MED in one wave.

## Functional Requirements

**Teammate Y — auth-openfga + rest-rm (~4h scope)**:
- **FR-Y1 (H-1)** — auth-openfga 7 query/mutation funcs (`batchCheckPermissions`, `listAccessibleResources`, `listUsersWithAccess`, `expandPermission`, `explainAccess`, `writeTuples`, `deleteTuples`, `writeTransaction`) gain `opts?: CheckPermissionOptions` (additive). Hard-call `getFgaClient()` replaced by `getFgaClient(opts?.client, opts?.cacheScope)` mirroring `checkPermission`.
- **FR-Y2 (H-2)** — `InMemoryDenyLedger.entries` `Map<>` → `LruTtlMap` from `@gertsai/utils/lru`. Bounded eviction policy. Existing API surface preserved.
- **FR-Y3 (H-3)** — rest-rm `circuit-breaker.ts:62-77` `preflight` half-open single-probe via `probeInFlight: boolean` flag. Concurrent callers across `resetTimeoutMs` boundary serialize through the flag; only first probe allowed.
- **FR-Y4 (MED-4)** — rest-rm `manager.ts:65-76` swap rate-limit and preflight order. Currently preflight then rate-limit; should be rate-limit-first to honor rate-limit boundary even on closed circuit.

**Teammate Z — session-guard docs + remaining MEDs (~2h scope)**:
- **FR-Z1 (H-4)** — session-guard README + CHANGELOG + dist `.d.ts` synced: `isImpersonating` documented to return `false` on empty UUIDs (not throw). Add note that ADR-007 I-19 was superseded by Wave 12.D-fix (PRD-036 FR-018). Optionally make consumers' upgrade path explicit (use `assertImpersonating` if throw semantics needed).
- **FR-Z2 (remaining MEDs from EVID-078)** — review and address other MEDs across 4 packages. Skip cosmetic LOWs.

## Non-Functional Requirements

**NFR-001** — Build green + workspace typecheck 0 errors.
**NFR-002** — All existing tests pass + new ones for each fix.
**NFR-003** — Bump strategy: minor for auth-openfga (H-1 + H-2 functionality changes), patch for others.

## Out of Scope

- Cosmetic LOW findings (deferred)
- Wave 15.D ApiController action-pipeline extraction (still pending)
- CHANGELOG curation (Wave 25 v1.0.0 prep candidate)

## Related Artifacts

- EVID-078 (Wave 23 audit source)
- PRD-060 (Wave 23 audit PRD)
- ADR-009 (rest-rm), ADR-012 (auth-openfga)
- ADR-007 I-19 (session-guard isImpersonating contract — pre-supersession)
- PRD-036 FR-018 (Wave 12.D-fix that changed isImpersonating)



