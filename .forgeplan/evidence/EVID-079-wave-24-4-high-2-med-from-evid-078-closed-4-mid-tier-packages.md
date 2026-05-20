---
depth: standard
id: EVID-079
kind: evidence
last_modified_at: 2026-05-20T20:15:22.998109+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-061
  relation: informs
status: active
title: Wave 24 — 4 HIGH + 2 MED from EVID-078 closed (4 mid-tier packages)
---

## Summary

Wave 24 closes 4 HIGH + 2 MED from EVID-078 across 4 mid-tier packages. Two parallel teammates (typescript-pro × 2) on disjoint scope. +27 new tests across 4 packages. 0 workspace typecheck errors.

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: code_review
- **linked_artifact**: PRD-061
- **summary**: 4/4 H + 2/6 M closed; auth-openfga multi-store bypass + circuit-breaker single-probe + session-guard docs drift all closed.

## Closures by teammate

### Teammate Y (auth-openfga + rest-rm)

| FR | Approach |
|---|---|
| H-1 multi-store scoping | 9 funcs gain `opts?: CheckPermissionOptions` (7 from audit + 2 additional: `bulkWriteTuples`/`bulkDeleteTuples`). Zero hard `getFgaClient()` calls remain. |
| H-2 LruTtlMap deny-ledger | `InMemoryDenyLedger.entries` Map → LruTtlMap; `InMemoryDenyLedgerOptions` (`maxSize=10_000` default, `ttlMs=0` default). |
| H-3 single-probe half-open | Class-level `probesInFlight: Set<string>` (per-host, generalizes beyond audit's single-boolean). First caller acquires; rest get `CircuitOpenError`. Reset on recordSuccess/Failure/reset. |
| MED-4 rate-limit ordering | Audit description inverted reality — code already does rate-limit-first. Added pinning test guarding regression. |

13 new tests (+10 auth-openfga, +3 rest-rm).

### Teammate Z (session-guard + queue)

| FR | Approach |
|---|---|
| H-4 isImpersonating docs sync | Option 1 + surface existing `assertImpersonating`/`checkImpersonating` (already since Wave 12.D-fix per PRD-036 FR-018, never in README). README API tables list throw + result flavors. Zero impl change. |
| MED-5 queue standalone hardening | `signal`/`shutdownTimeoutMs` (30s default + force-close)/`logger`/callbacks/idempotent shutdown/workers view. Default `worker.on('error')` listener prevents Node ≥15 unhandled crash. |
| MED-6 session-guard taxonomy | NEW `NotImpersonatingError extends ConflictError<{operatorUuid}>`. `assertImpersonating` UUIDs-equal throws this → HTTP 409 (was 500 fall-through). Message preserved for regex-catch compat. |

14 new tests (+5 session-guard, +9 queue).

## Acceptance verification (all PASS)

| Package | Build | Typecheck | Tests |
|---|---|---|---|
| @gertsai/auth-openfga | ✅ | ✅ 0 | 155 (was 145, +10) |
| @gertsai/rest-request-manager | ✅ | ✅ 0 | 31 (was 28, +3) |
| @gertsai/session-guard | ✅ | ✅ 0 | 67 (was 62, +5) |
| @gertsai/queue | ✅ | ✅ 0 | 16 (was 7, +9) |
| Workspace (45) | ✅ | ✅ **0 errors** | — |

## Architectural surprises

1. **FR-Y1 scope expanded from 7 to 9**: `bulkWriteTuples`/`bulkDeleteTuples` (mutations/index.ts:446, :502) hard-called `getFgaClient()` directly (not via low-level helpers). Treated as same-finding-family scope-creep.
2. **FR-Y4 inversion**: PRD/audit description had rate-limit + preflight order wrong. Real code already correct; added pinning test instead of code swap.
3. **probesInFlight as Set, not boolean**: class-level Set per-host generalizes correctly to multiple concurrent hosts (single boolean would fail).
4. **LruTtlMap iterator compat**: existing `for (const [k,v] of this.entries)` works unchanged because LruTtlMap implements `[Symbol.iterator]` identically to Map.

## Behaviour changes (minor bumps justified)

- auth-openfga: 9 funcs + InMemoryDenyLedger LRU eviction (was unbounded)
- rest-rm: circuit-breaker half-open now single-probe (was concurrent leak)
- session-guard: `NotImpersonatingError` → HTTP 409 (was 500)
- queue: `runStandalone` extended API + safer defaults

## Net change

19 files / +964 / -50 LOC. +27 new tests.

## EVID-078 closure

4/4 HIGH + 2/6 MED closed. Remaining 4 MED + 5 LOW deferred to backlog (cosmetic, doc-only or low-impact).

## Refs

- PRD-061 (target)
- EVID-078 (Wave 23 audit source)
- ADR-009 (rest-rm), ADR-012 (auth-openfga multi-instance)
- ADR-007 I-19 (session-guard original contract, superseded)
- PRD-036 FR-018 (Wave 12.D-fix that changed isImpersonating)



