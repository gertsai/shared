---
depth: standard
id: EVID-050
kind: evidence
last_modified_at: 2026-05-16T20:05:07.940415+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-034
  relation: informs
status: active
title: Wave 12.C-fix-2+3 — 7 HIGH findings closed across 4 packages + storage-core doc
---

# EVID-050 — Wave 12.C-fix-2+3 closure evidence

7 HIGH findings from EVID-048 + 1 CLAUDE.md doc fix closed by 3 parallel teammates per PRD-034.

## Structured Fields

- **verdict:** `supports` — all 7 cited `file:line` items verifiably patched. 4 packages pass full test + typecheck + build green. Wave-13-pattern regression check: queue + rest-request-manager no longer leak external types at root.
- **congruence_level:** `CL3` — same target system, internal validation.
- **evidence_type:** `test_result`.
- **R_eff per-finding:** `1.0 − 0.0 = 1.0`.
- **Wallclock:** ~25 min (3 parallel teammates, longest ~7 min).

## Verification matrix

| # | Finding | Package | File:line | Closed by | Tests |
|---|---|---|---|---|---|
| H-3 | bullmq type leak | `@gertsai/queue` | `dist/index.d.ts:1` | Teammate A — local structural interfaces | 7/7 (+2) |
| H-11 | createWorker undefined password | `@gertsai/queue` | `src/index.ts:121-126` | Teammate A — conditional spread | included above |
| H-4 | Logger leak from peer-optional | `@gertsai/rest-request-manager` | `dist/index.d.ts:Logger` | Teammate C — `RestRequestLogger` inlined | 28/28 (+5) |
| H-10 | Rate-limiter token drift | `@gertsai/rest-request-manager` | `rate-limiter.ts:30-49` | Teammate C — integer bucket + `tokenCarry` | included above |
| H-7 | pipe() overwrite + listener leak | `@gertsai/flux` | `DataStream.ts:378-414` | Teammate B — Option B (throw + cleanup) | 362/362 (+5) |
| H-8 | once-listener identity bug | `@gertsai/flux` | `FluxilisEventEmitter.ts:444-446` | Teammate B — `_removeListenerInfo` | included above (+4) |
| H-9 | DI 'destroy'/'destroyed' mismatch | `@gertsai/di` | `manager.ts:202-206` | Teammate C — event renamed | 115/115 (+2) |
| H-6 | storage-core capabilities doc | `CLAUDE.md` | tier-table Wave 7.2 | Teammate A — doc update | n/a |

**Total tests:** 7 + 28 + 362 + 115 = 512 across 4 packages. Net +18 new tests.

## Cross-validation

- **I-1 file ownership disjoint:** Teammate A → queue + CLAUDE.md; Teammate B → flux only; Teammate C → di + rest-request-manager. No overlaps in `git status`.
- **I-2 file:line patches verified:**
  - queue: `head -3 dist/index.d.ts` no `bullmq` import; `createWorker` uses conditional spread for password/db/concurrency
  - rest-request-manager: `RestRequestLogger` in types.ts; no `@gertsai/logger-factory` import in `dist/index.d.ts`; rate-limiter uses `Math.floor` + `tokenCarry`
  - flux: `_pipeWiring` slot in DataStream; `_removeListenerInfo` in FluxilisEventEmitter
  - di: `consumer.on('destroyed', ...)` in manager.ts
- **I-3 Wave-13 regression check:**
  - queue `dist/index.d.ts` — clean (only JSDoc)
  - rest-request-manager `dist/index.d.ts` — only @gertsai/* workspace imports (async-utils, fetch, errors); `Logger` from logger-factory GONE
  - flux `dist/index.d.ts` — only @gertsai/collection (same-org workspace, acceptable)
  - di `dist/index.d.ts` — events + @gertsai/utils (events is Node-only, di doesn't declare engines.node — analogous to entity pre-fix-1; deferred to polish wave)
- **I-4 tests pass:** 512/512 net, +18 new.
- **I-5 no new deps:** all 4 packages.
- **I-6 forgeplan MCP discipline:** PRD-034 + EVID-050 via MCP.

## Files changed

**@gertsai/queue** (Teammate A — 4 files):
- M `src/index.ts` (inlined types, conditional spread, `__setBullmqLoaderForTesting` test seam)
- M `src/standalone.ts` (Job import from local)
- M `src/index.test.ts` (whitespace)
- A `src/createWorker-spread.test.ts` (2 tests)

**@gertsai/rest-request-manager** (Teammate C — 4 files):
- M `src/types.ts` (`RestRequestLogger` inlined, no logger-factory import)
- M `src/manager.ts` (field type)
- M `src/index.ts` (re-export `RestRequestLogger`)
- M `src/rate-limiter.ts` (integer bucket + `tokenCarry`)
- M `src/__tests__/rate-limiter.test.ts` (+3 tests)
- M `src/__tests__/manager.test.ts` (+2 tests)

**@gertsai/flux** (Teammate B — 4 files):
- M `src/stream/DataStream.ts` (FR-004: single-pipe throw + `_pipeWiring`/`_detachPipeListeners`)
- M `src/events/FluxilisEventEmitter.ts` (FR-005: `_removeListenerInfo`, ListenerInfo[] tracking in emit/emitAsync)
- M `src/__tests__/DataStream.spec.ts` (+5 tests)
- M `src/__tests__/FluxilisEventEmitter.spec.ts` (+4 tests)

**@gertsai/di** (Teammate C — 8 files):
- M `src/manager.ts` ('destroyed' rename + PRD-034 FR-006 reference comment)
- M `src/ServiceDirectory.ts` (JSDoc)
- M `README.md` (example)
- M `src/__tests__/manager.test.ts` (rename + negative test for legacy 'destroy')
- M `src/__tests__/integration.test.ts` (UserEntity, ChatEntity emit 'destroyed')
- M `src/__tests__/ServiceDirectory.test.ts`
- M `src/__tests__/ServicesRegistry.test.ts`
- M `src/__tests__/AbstractService.test.ts`

**Docs (Teammate A):**
- M `CLAUDE.md` (3 lines updated for storage-core Wave 7.2 capabilities shape)

**Changesets (4):**
- `.changeset/wave-12-c-fix-2-3-queue-bullmq-conditional.md`
- `.changeset/wave-12-c-fix-2-3-rest-rm-logger-rate-limiter.md`
- `.changeset/wave-12-c-fix-2-3-flux-pipe-once-listener.md`
- `.changeset/wave-12-c-fix-2-3-di-destroyed-event.md`

## Behavioural changes worth flagging

- **flux `pipe()` second call throws** — soft breaking. Existing tests don't exercise double-pipe on the same source (only chain-pipes on returned streams). Consumers double-piping must refactor to fan-out via `subscribe()`. Error message points to alternative.
- **DI listens for `'destroyed'` not `'destroy'`** — soft breaking. Internal: all DI test fixtures updated. External consumers must rename their emit.
- **`Logger` type renamed to `RestRequestLogger`** in `rest-request-manager` (internal). The type symbol `Logger` was never exported from package root — only used in `import type` inside `types.ts`. No public surface break.
- **Rate-limiter integer math** — slight behavioural change: refills happen on integer-millisecond boundaries. For typical rates (1-1000 tokens/sec) imperceptible. Sub-millisecond rates use `tokenCarry` accumulator for precision.

## Wave 12.C closure status

| Wave | Items | Status |
|---|---|---|
| 12.C audit (EVID-048) | 1 CRIT + 10 HIGH surfaced | ✅ merged |
| 12.C-fix-1 (PRD-033 / EVID-049) | CRITICAL + 3 entity HIGHs | ✅ merged + publish workflow ran |
| **12.C-fix-2+3 (PRD-034 / this EVID)** | 7 HIGH + 1 doc fix | ✅ this evidence |

**Total Wave 12.C closures: 11/11 actionable HIGH+CRITICAL** from EVID-048. ~24 MEDIUM + ~20 LOW deferred to Wave 12.C-polish or Wave 14.

## Suggested follow-up

- **Wave 12.D — Tier-3-5 audit** (11 packages: core, hsm, entity-storage, rpc-proxy-builder, runtime-context, session-guard, async-utils, logger-factory, auth-openfga, api-rlr). Same pattern as 12.B + 12.C audits.
- **Wave 12.C-polish (optional):** declare `engines.node: ">=22"` on `@gertsai/di` (analogous to entity fix-1 H-5 pattern). Single-line fix, ~5 min.
- **Wave 12.E — example apps audit** (m9s-example, m9s-example-web, m9s-example-api-types).

## Refs

- **PRD-034** — Wave 12.C-fix-2+3 combined fix wave
- **EVID-048** — sources all 7 HIGH findings
- **PRD-033 + EVID-049** — Wave 12.C-fix-1 precedent (entity fixes)
- **PRD-029/030/031 + EVID-045/046/047** — Wave 12.B-fix precedents
- **ADR-009** — rate-limiter invariants
- **ADR-008** — entity reactive adapter (related to fix-1)



