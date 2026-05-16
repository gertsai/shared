---
depth: standard
id: EVID-047
kind: evidence
last_modified_at: 2026-05-16T18:45:47.890677+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-031
  relation: informs
status: active
title: Wave 12.B-fix-3 — 7 HIGH type-system findings closed across 3 packages
---

# EVID-047 — Wave 12.B-fix-3 closure evidence

All 7 HIGH type-system findings from EVID-044 closed by 3 parallel teammates per RFC-022. Combined with Wave 12.B-fix-1 (2 CRITICAL) + Wave 12.B-fix-2 (7 HIGH security), this closes **all 16 actionable HIGH/CRITICAL items** from Wave 12.B audit.

## Structured Fields

- **verdict:** `supports` — each cited `file:line` in EVID-044 verifiably patched. All 3 packages pass full test + typecheck after fix. No regression in earlier fix waves (root `dist/index.d.ts` of collection, ws-rpc remain external-import-clean; utils still has pre-existing consola leak which is NOT in this PRD's scope).
- **congruence_level:** `CL3` — same target system, internal validation via direct file inspection + vitest run + typecheck + full monorepo build.
- **evidence_type:** `test_result`.
- **R_eff per-finding:** `1.0 − 0.0 = 1.0`. Above threshold.
- **Wallclock:** ~25 min — pre-seed + 3 parallel teammates (longest ~10 min, shortest ~1 min) + verification.

## Verification matrix

| # | Finding | Package | File:line cited | Closed by | Tests |
|---|---|---|---|---|---|
| 1 | `any[]` in exported generic constraints | `@gertsai/collection` | prototype.ts:8,28,29; PositionalAccess.ts:141+; memoize.ts:32,39,169+; memoized.ts:102+ | Teammate A — `never[]` widening (contravariant-correct) | 772/772 (+1 narrowing regression) |
| 2 | Brand-bypass factories | `@gertsai/collection` | branded.ts:70-102 | Teammate A — validation + `BrandValidationError` | included above (+10) |
| 3 | Missing `typesVersions` | `@gertsai/collection` | package.json:20-65 | Teammate A — `typesVersions` block mirroring m9s-cache pattern | n/a (build-time) |
| 4 | Helper/op return-type widening | `@gertsai/collection` | helpers.ts:336, set.ts:277-278, aggregate.ts:367-368, transform.ts:245-248 | Teammate A — generic-parameterised returns | included above |
| 5 | `getSyncFields` Record any | `@gertsai/utils` | getSyncFields.ts:62,74 | Teammate B — input narrowed to `unknown`, return narrowed to `Partial<T>` | 486/486 (+1 narrowing) |
| 6 | `WsRpcOptions.headers` Node-only silent | `@gertsai/ws-rpc` | client.ts:200,203 | Teammate C — discriminated union `WsRpcOptionsNode \| WsRpcOptionsBrowser` | 113/113 (+3 union tests) |
| 7 | `connect()` second-call race | `@gertsai/ws-rpc` | client.ts:142-182 | Teammate C — shared in-flight `connecting` promise + `onOpen` removes `onError` listener | included above (+3 concurrency tests) |

**Total new tests:** ≥ 18 across 3 packages. Net 772 + 486 + 113 = 1371 tests across the fix-3 packages.

## Cross-validation

- **Invariant I-1 (file ownership):** each teammate's diff confined to its assigned package.
- **Invariant I-2 (each `file:line` patched):** verified per-teammate spot-grep:
  - collection: 0 `any[]`/`: any` remain in EVID-044-cited files (was ~30); `BrandValidationError` exported; `typesVersions` block present
  - utils: `getSyncFields` signature uses `Record<string, unknown>`
  - ws-rpc: `WsRpcOptionsBrowser` / `WsRpcOptionsNode` defined; `connecting` slot in `client.ts`
- **Invariant I-3 (no externals at root):** confirmed for collection, ws-rpc (no regression). utils still has pre-existing `consola` import — NOT in this PRD's scope; tracked as deferred follow-up.
- **Invariant I-4 (tests pass):** 772 + 486 + 113 = **1371 tests** across the 3 packages. Net +18 from this wave. Zero failures.
- **Invariant I-5 (no new deps):** verified.
- **Invariant I-6 (forgeplan MCP discipline):** PRD-031 + RFC-022 + EVID-047 all via MCP.
- **Invariant I-7 (backward-compat additive):** `BrandValidationError`, `WsRpcOptionsNode`, `WsRpcOptionsBrowser` are additive exports. `getSyncFields` input narrowing soft-breaks `Record<string, any>` callers (most use concrete types).

## Behavioural changes

- **`@gertsai/collection` brand factories now validate input** and throw `BrandValidationError` on invalid values. Callers who relied on factory-as-cast (passing junk) must update.
- **`@gertsai/collection` generic constraints use `never[]`** — contravariant-correct alternative to `any[]`. Call-sites using `Parameters<T>` / `ReturnType<T>` unaffected.
- **`@gertsai/utils` `getSyncFields`** input narrowed; return type now `Partial<T>`. Callers reading specific fields get proper per-key narrowing.
- **`@gertsai/ws-rpc` `WsRpcOptions`** is now a discriminated union. `environment?: 'node'` default keeps backward-compat.
- **`@gertsai/ws-rpc` `connect()`** is now safely idempotent under concurrent calls — shared promise + post-open error filter.

## Files changed

**`@gertsai/collection`** (Teammate A — 13 files):
- M `package.json` (typesVersions block)
- M `src/index.ts` (export `BrandValidationError`)
- M `src/types/branded.ts` (+`BrandValidationError` class + 4 factory validations)
- A `src/types/branded.test.ts` (10 tests)
- M `src/mixins/prototype.ts` (Constructor uses `never[]`, AnyConstructor + overload)
- M `src/mixins/PositionalAccess.ts` (8 `any` replaced)
- M `src/utils/memoize.ts` (5 generic constraints tightened)
- M `src/utils/memoize.test.ts` (+1 narrowing regression)
- M `src/operations/memoized.ts` (2 constraints)
- M `src/operations/aggregate.ts` (`frequencies<K,V,F=V>` parameterised)
- M `src/operations/set.ts` (`duplicates<K,V,D=V>` parameterised)
- M `src/operations/transform.ts` (`flatten` returns `Array<unknown>`)
- M `src/utils/helpers.ts` (`entriesArray()` parameterised)

**`@gertsai/utils`** (Teammate B — 2 files):
- M `src/object/getSyncFields.ts` (signature narrowed)
- M `src/object/getSyncFields.test.ts` (+1 narrowing test)

**`@gertsai/ws-rpc`** (Teammate C — 4 files):
- M `src/types.ts` (`WsRpcOptions` split into discriminated union)
- M `src/client.ts` (env-aware constructor + `connecting` shared promise + `connectSettled` guard)
- M `src/index.ts` (export new option types)
- M `src/__tests__/client.test.ts` (+6 tests across 2 describe blocks)

**Changesets (3):** `.changeset/wave-12-b-fix-3-{collection-type-tightening,utils-getSyncFields-narrow,ws-rpc-options-split-connect-race}.md`.

## Wave 12.B audit completion status

This evidence closes the last actionable HIGH-tier wave from Wave 12.B audit. Remaining EVID-044 items:

- **MEDIUM (~40 unique):** deferred to Wave 12.B-polish (later sprint) or rolled into Wave 14.
- **LOW (~28 unique):** deferred.
- **Cross-package observation #1 (SSRF URL validator consolidation):** still open — `@gertsai/fetch` and `@gertsai/utils` both ship URL validators. Tracked as Wave 12.F (cross-package consistency) scope.
- **Cross-package observation #10 (CLAUDE.md tier-table reconciliation for `audit-primitives`):** documentation fix, separate ticket.
- **utils consola type-leak (HIGH T-3 from EVID-044):** NOT in PRD-031 scope; tracked for a Wave 12.B-fix-4 or rolled into Wave 14.

## Refs

- PRD-031 — this fix wave's PRD
- RFC-022 — execution strategy
- EVID-044 — sources of the 7 HIGH type-system findings
- PRD-029 + EVID-045 — Wave 12.B-fix-1 precedent
- PRD-030 + EVID-046 — Wave 12.B-fix-2 precedent



