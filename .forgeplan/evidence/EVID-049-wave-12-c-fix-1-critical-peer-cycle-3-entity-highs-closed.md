---
depth: standard
id: EVID-049
kind: evidence
last_modified_at: 2026-05-16T19:47:26.539368+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-033
  relation: informs
status: active
title: Wave 12.C-fix-1 — CRITICAL peer cycle + 3 entity HIGHs closed
---

# EVID-049 — Wave 12.C-fix-1 closure evidence

CRITICAL + 3 HIGH findings from EVID-048 closed in `@gertsai/entity` by single teammate per PRD-033.

## Structured Fields

- **verdict:** `supports` — all 4 cited EVID-048 items verifiably patched. Peer cycle resolved (CRIT-1 closed); CWE-1321 prototype pollution filter applied at both `$patch` and `$setMetadata` boundaries; plainReactiveAdapter brand harmonised with framework adapters per ADR-008 I-11; `engines.node: ">=22"` declared for H-5. 54/54 tests pass (8 new); typecheck clean; full monorepo build green.
- **congruence_level:** `CL3` — same target system, internal validation via direct file inspection, vitest, tsc, full pnpm build.
- **evidence_type:** `test_result`.
- **R_eff per-finding:** `1.0 − 0.0 = 1.0`. Above threshold.
- **Wallclock:** ~10 min (single teammate, surgical 4-fix scope in 1 package).

## Verification matrix

| # | Finding | Files | Fix verified |
|---|---|---|---|
| CRIT-1 | entity↔entity-vue peer cycle | `entity/src/vue.ts`, `entity/package.json`, new `entity/src/adapters/vue.ts` | `grep "@gertsai/entity-vue" entity/package.json` empty ✅ |
| H-1 | `$patch` `__proto__` pollution | `entity/src/Entity.ts:patch`, `EntityWithMetadata.ts:setMetadata`, new `entity/src/internal/dangerous-keys.ts` | DANGEROUS_KEYS imported + filtered in both branches ✅ |
| H-2 | plain adapter brand | `entity/src/adapters/plain.ts` | `Symbol('@gertsai/entity:raw')` (not Symbol.for); locked `defineProperty` ✅ |
| H-5 | Node events leak | `entity/package.json` | `engines.node: ">=22"` declared ✅ |

## Files changed

**Modified (9):**
- `entity/package.json` — removed entity-vue peer, added engines.node, simplified build script
- `entity/tsup.config.ts` — removed DTS-disable workaround (peer cycle gone)
- `entity/src/Entity.ts` — DANGEROUS_KEYS filter in both branches of $patch
- `entity/src/EntityWithMetadata.ts` — same filter in $setMetadata
- `entity/src/adapters/plain.ts` — module-private Symbol + locked defineProperty + new isMarkedRaw helper
- `entity/src/vue.ts` — re-exports from local `./adapters/vue` (was @gertsai/entity-vue)
- `entity/src/Entity.test.ts` — 3 new pollution-vector tests
- `entity/src/EntityWithMetadata.test.ts` — 2 new pollution-vector tests
- `entity/src/adapters/plain.test.ts` — refactored: removed RAW_MARKER_SYMBOL import; 2 new tamper-protection tests
- `entity/src/vue.test.ts` — 1 new shape-preserved test

**Created (2):**
- `entity/src/adapters/vue.ts` — inlined `vueReactiveAdapter` (lazy createRequire)
- `entity/src/internal/dangerous-keys.ts` — shared DANGEROUS_KEYS constant

**Deleted (1):**
- `entity/scripts/emit-vue-shim-dts.mjs` — obsolete post-build workaround (peer cycle dissolved)

**Net LOC:** +172 / -84 = +88 (≤200 budget).

## Cross-validation

- I-1 — only `packages/entity/**` modified ✅
- I-2 — `$patch` / `$setMetadata` reject dangerous keys in both branches ✅
- I-3 — plainReactiveAdapter brand module-private + locked descriptor ✅
- I-4 — `@gertsai/entity-vue` removed from peer deps ✅
- I-5 — `@gertsai/entity/vue` subpath still emits real `dist/vue.d.ts` with `declare const vueReactiveAdapter: ReactiveAdapter` ✅
- I-6 — `engines.node: ">=22"` declared ✅
- I-7 — 46 existing + 8 new = 54/54 tests pass ✅

## Behavioural notes

- **`events` import in dist/index.d.ts still present** — unchanged behaviour. The Node-only nature is now contractually declared via `engines.node` (matching `rest-request-manager` precedent). Stripping the import entirely would require refactoring `Model extends EventEmitter` to use a custom IEventEmitter pattern (deferred to Wave 14 if desired).
- **`isMarkedRaw` introspection helper** — added to `plainReactiveAdapter` to satisfy the PRD-033 test snippet. Interface `ReactiveAdapter` unchanged; helper exposed via intersection type on the concrete adapter object.
- **No new dependencies.** `@vue/runtime-core` already peer-optional; net peer count decreased by 1 (entity-vue removed).

## Suggested follow-up

Per EVID-048 §"Suggested follow-up":

- **Wave 12.C-fix-2 (external-type-leaks):** queue bullmq inline + rest-request-manager Logger surface + storage-core capabilities CLAUDE.md update. ~80 LOC, 0.5 day.
- **Wave 12.C-fix-3 (logic correctness):** flux pipe + once-listener + DI event mismatch + rate-limiter drift + queue password. ~150 LOC, 1 day.

These are independent of this PRD-033 and can start immediately.

## Refs

- **PRD-033** — this fix wave's PRD
- **EVID-048** — sources CRIT-1, H-1, H-2, H-5
- **PRD-029 + EVID-045** — Wave 12.B-fix-1 (CRITICAL closure precedent)
- **PRD-030 + EVID-046** — Wave 12.B-fix-2 (security closures precedent)
- **PRD-031 + EVID-047** — Wave 12.B-fix-3 (type-system closures precedent)
- **ADR-008** — entity reactive adapter ISP + I-11 module-private symbols



