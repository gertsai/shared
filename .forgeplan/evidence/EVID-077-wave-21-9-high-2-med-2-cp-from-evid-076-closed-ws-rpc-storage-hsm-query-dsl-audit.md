---
depth: standard
id: EVID-077
kind: evidence
last_modified_at: 2026-05-20T18:59:20.093896+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-059
  relation: informs
status: active
title: Wave 21 — 9 HIGH + 2 MED + 2 CP from EVID-076 closed (ws-rpc + storage + hsm + query-dsl + audit)
---

## Summary

Wave 21 closes 9 HIGH + 2 MED + 2 cross-package observations from EVID-076 across 5 platform packages. Two parallel teammates (typescript-pro × 2) on disjoint scope. 44 new tests (+22% on touched packages). 0 public-API contract violations (behaviour breaks documented + minor bumps).

## Structured Fields

- **verdict**: supports
- **congruence_level**: CL3
- **evidence_type**: code_review
- **linked_artifact**: PRD-059
- **summary**: 13/13 findings closed; H-ENT-1/2 commit semantics rewritten; capabilities matrix introduced.

## Teammate W (ws-rpc + hsm + sql.ts)

| Finding | Approach | Tests |
|---|---|---|
| H-WS-1 reconnect-death | Synth `handleClose(1006)` in connect catch + tracked timer | 2 |
| H-WS-2 wildcardMatch ReDoS | 3 caps: `MAX_DOUBLE_STAR_SEGMENTS=3`, `MAX_TOPIC_SEGMENTS=64`, `MAX_WILDCARD_RECURSION_DEPTH=100`; new `InvalidSubscriptionPatternError` | 5 |
| H-WS-3 Node protocol-ping | `ws.ping()` + pong watchdog; browser fallback | 2 |
| H-HSM-1 decrypt always-verify | SHA-256 recompute + `HSMError(INVALID_CONTEXT)` throw | 3 |
| M-WS-1 backoff off-by-one | `getDelay()` BEFORE `recordAttempt()` | 2 |
| M-QDS-1 quoteIdent | `"<name>"` Postgres-quote + `""` escape | 3 |

**+154/+101/+23/+18 src LOC**. 17 new tests across 3 packages.

## Teammate X (entity-storage + storage-core + query-dsl/validate + entity-audit)

| Finding | Approach | Tests |
|---|---|---|
| H-ENT-1+H-ENT-2 | Per-key snapshot + per-key merge commit + read+write-set verification. Option 3 (fail-on-conflict, matches PG MVCC). Writes-without-reads use implicit pre-snapshot version → no longer bypass conflict check. | 6 |
| H-ENT-3 | `applyQueryFilter` now honors `offset` | 4 |
| H-ENT-4 | `applyQueryFilter` now honors `limitToLast` | 4 |
| CP-2 | NEW `query-dsl/src/capabilities.ts` (151 LOC) — `QueryCapabilities` type + 4 presets; `validateQuery(query, capabilities)` rejects unsupported constraints | 8 |
| CP-1 | NEW `AUDIT_FIELDS` + `CREATOR_AUDIT_FIELDS` exported from `@gertsai/entity-audit`; consumers (InMemoryStorageProvider, PgStorageProvider) import + use | 5 |

**+176/+64/+217 LOC**. 27 new tests across 5 packages.

`@gertsai/pg-client` gains peer-optional dep on `@gertsai/entity-audit` for `/storage` subpath (mirrors existing query-dsl peer-optional pattern).

## H-ENT-1 commit semantics decision

Chose **Option 3 (fail-on-conflict)** per audit recommendation:
1. Per-key version snapshot at first queue op
2. Per-key merge commit (delta queue + per-key apply)
3. Read-set + write-set verification at commit
4. Local view inside transaction (queued ops visible to subsequent `tx.get`)

Rationale: matches PG MVCC semantics + documented `TransactionConflictError` contract per ADR-005. Option 1 (per-doc merge without write-set checks) keeps H-ENT-2 hazard; Option 2 (single-writer lock) eliminates parallelism.

## Acceptance verification (all PASS)

| Scope | Build | Typecheck | Tests |
|---|---|---|---|
| @gertsai/ws-rpc | ✅ | ✅ 0 | 124 (was 113, +11) |
| @gertsai/hsm | ✅ | ✅ 0 | 35 (was 32, +3) |
| @gertsai/query-dsl | ✅ | ✅ 0 | 64 (was 56, +8) |
| @gertsai/entity-storage | ✅ | ✅ 0 | 117 (was 103, +14) |
| @gertsai/entity-audit | ✅ | ✅ 0 | 35 (was 30, +5) |
| @gertsai/pg-client | ✅ | ✅ 0 | 37 (unchanged) |
| Workspace (45 projects) | ✅ green | ✅ 0 errors | — |

## Behaviour breaks (pre-1.0 minor bumps)

| Change | Impact |
|---|---|
| ws-rpc subscribe throws on adversarial patterns | DoS-resistance gain |
| hsm decrypt throws on hash mismatch | Cryptographic integrity gain |
| query-dsl validateQuery requires capabilities | Backend-specific drift caught at boundary |
| query-dsl quoteIdent emits quoted output | SQL safety gain |
| entity-storage InMemoryStorageProvider throws TransactionConflictError on race | Storage contract correctness |
| entity-storage applyQueryFilter honors offset + limitToLast | Backend parity |

## EVID-076 closure

13/13 findings addressed. Remaining (deferred):
- **CP-3** ws-rpc trust-model documentation → Wave 22 (docs-only)

## Wave 15.D still pending

ApiController action-pipeline extraction (~1000 LOC remaining post 15.A+B+C). Largest remaining api-core piece.

## Refs

- PRD-059 (target)
- EVID-076 (Wave 20 audit source)
- PRD-058 + EVID-076 (audit precedent)
- ADR-005 (storage-core architecture, MVCC pattern)
- ADR-008 (entity reactive adapters — adjacent context)



