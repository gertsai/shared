---
depth: standard
id: EVID-046
kind: evidence
last_modified_at: 2026-05-16T17:57:46.694404+00:00
last_modified_by: claude-code/2.1.142
links:
- target: PRD-030
  relation: informs
status: active
title: Wave 12.B-fix-2 — 7 HIGH security findings closed across 4 packages
---

# EVID-046 — Wave 12.B-fix-2 closure evidence

All 7 HIGH security/data-integrity findings from EVID-044 closed by 4 parallel teammates per RFC-021. All invariants satisfied. 4 packages ready for minor bump.

## Structured Fields

- **verdict:** `supports` — each cited `file:line` in EVID-044 verifiably patched. All 4 packages pass full test + typecheck after fix. No regression in Wave 12.B-fix-1's external-type-leak elimination (root `dist/index.d.ts` of fetch and m9s-cache remain external-import-free).
- **congruence_level:** `CL3` — same target system, internal validation via direct file inspection + vitest run + typecheck + full monorepo build.
- **evidence_type:** `test_result` — combined automated (vitest + tsc + tsup + full pnpm build) and manual (`head -3 dist/*.d.ts` regression check).
- **R_eff per-finding:** `1.0 − 0.0 = 1.0`. Above threshold (≥ 0.5).
- **Wallclock:** ~30 min — 5 min orchestrator pre-seed + ~25 min parallel teammate work (longest finished in ~4.5 min, shortest in ~2 min) + 5 min verification.

## Verification matrix

| # | Finding | Package | File:line cited | Closed by | Tests |
|---|---|---|---|---|---|
| 1 | CWE-770 body-size bypass | `@gertsai/fetch` | `undiciFetcher.ts:62-92` | Teammate D — uniform `_checkBodySize` + `BodyTooLargeError` | 84/84 (+20) |
| 2 | CWE-918 DNS rebinding TOCTOU | `@gertsai/utils` | `url-validator.ts:443-499` | Teammate A — additive `resolvedIp` return field + JSDoc contract | 485/485 (+ updates) |
| 3 | CWE-400 AbortSignal not wired | `@gertsai/utils` | `url-validator.ts:388-422` | Teammate A — `abortableResolve` helper, `Promise.race` with signal listener | included above |
| 4 | CWE-338 weak PRNG `getRandomId` | `@gertsai/utils` | `getRandomId.ts:18-30` | Teammate A — deprecation warn-once + new `getSecureRandomId` with rejection sampling | included above (+6 for new fn) |
| 5 | Redlock swallows all errors | `@gertsai/m9s-cache` | `lock-provider.ts:136-144` | Teammate B — `_isLockHeldError` classifier, distinguish ResourceLockedError from infra errors | 119/119 (+11) |
| 6 | CWE-20 validateKeys default backwards | `@gertsai/m9s-cache` | `cache-store.ts:49` | Teammate B — default flipped to `true`, obsolete prod-test replaced with 3 strict tests | included above (+3) |
| 7 | `runBatch` non-atomic | `@gertsai/pg-client` | `storage-provider.ts:438-443, 155-176` | Teammate C — BEGIN/COMMIT envelope + ROLLBACK on failure + empty-batch guard + rollbackError field | 37/37 (+2) |

**Total new tests:** ≥ 42 across 4 packages.

## Cross-validation

- **Invariant I-1 (file ownership):** confirmed by `git status` — each teammate's diff confined to its assigned `packages/<name>/**`. No cross-contamination.
- **Invariant I-2 (each `file:line` patched):** verified by spot-grep per teammate report:
  - fetch: `BodyTooLargeError` + `_checkBodySize` present in `undiciFetcher.ts`; exported from `index.ts`
  - utils: `@deprecated` on `getRandomId`; `abortableResolve` + Promise.race in `url-validator.ts`; `getSecureRandomId` in `index.ts`
  - m9s-cache: `_isLockHeldError` + `validateKeys.*?? true` confirmed
  - pg-client: `BEGIN`/`COMMIT`/`ROLLBACK` in `storage-provider.ts:170-194`
- **Invariant I-3 (no externals at root):** confirmed — `head -3 packages/{fetch,m9s-cache}/dist/index.d.ts` still external-free post Wave-12.B-fix-1 (regression check).
- **Invariant I-4 (tests pass):** 84 + 485 + 119 + 37 = 725 tests across the 4 packages. Net +42 from this wave. Zero failures.
- **Invariant I-5 (no new deps):** `node:crypto` (utils) is built-in. No `package.json` dependency added in any of the 4 packages.
- **Invariant I-6 (forgeplan MCP discipline):** PRD-030 + RFC-021 + EVID-046 all via MCP `forgeplan_update`.
- **Invariant I-7 (backward-compat additive):** all new exports are additive (`BodyTooLargeError`, `getSecureRandomId`, `ValidationResultAsync`). `getRandomId` keeps working with a warn-once. `validateKeys: false` still opts out. `runBatch` return type unchanged.

## Behavioural changes worth flagging

- **`validateKeys` default flip** is a soft-breaking change for any consumer that constructed `CacheStore` without `validateKeys: false` AND passed keys with invalid chars. They will now throw `CacheKeyError`. This is the desired security posture; consumers should either fix their keys or add `validateKeys: false` explicitly.
- **`validateWebhookUrlAsync` return type** moved from `Promise<void>` to `Promise<ValidationResultAsync>`. Old void-callers continue to work (the new return value is non-void but ignorable). New `resolvedIp` field is opt-in for callers who want rebinding protection.
- **`getRandomId` deprecation warning** prints on first call in non-test envs. Migration to `getSecureRandomId` is voluntary — old function still works.
- **`PgBatchRunner._apply` semantics** now atomic. The earlier behaviour (partial commit on N-th failure) was a latent data-integrity hazard; correcting it is non-breaking in the strict sense (callers reasonably expected atomicity) but downstream business logic that relied on partial-commit must be reviewed.

## Files changed

**`@gertsai/fetch`:**
- M `packages/fetch/src/fetchers/undiciFetcher.ts` (+~30 LOC: `BodyTooLargeError` + `_checkBodySize` + 6 branch guards)
- M `packages/fetch/src/fetchers/index.ts` (re-export)
- M `packages/fetch/src/index.ts` (public re-export)
- A `packages/fetch/src/__tests__/resolveBody.test.ts` (20 tests)

**`@gertsai/utils`:**
- M `packages/utils/src/security/url-validator.ts` (+~120 LOC: `ValidationResultAsync`, `abortableResolve`, AbortSignal wiring)
- M `packages/utils/src/security/url-validator.test.ts` (4 updated + 4 new tests)
- M `packages/utils/src/generators/getRandomId.ts` (@deprecated + warn-once)
- M `packages/utils/src/generators/index.ts` (re-export)
- A `packages/utils/src/generators/getSecureRandomId.ts` (~40 LOC)
- A `packages/utils/src/generators/getSecureRandomId.test.ts` (6 tests)

**`@gertsai/m9s-cache`:**
- M `packages/m9s-cache/src/lock-provider.ts` (+~30 LOC: `_isLockHeldError` classifier)
- M `packages/m9s-cache/src/cache-store.ts` (default flip)
- M `packages/m9s-cache/src/cache-store.test.ts` (3 strict-default tests)
- A `packages/m9s-cache/src/lock-provider.test.ts` (11 tests)

**`@gertsai/pg-client`:**
- M `packages/pg-client/src/storage-provider.ts` (+~30 LOC: BEGIN/COMMIT/ROLLBACK envelope)
- M `packages/pg-client/src/storage-provider.test.ts` (1 updated + 2 new tests)

**Changesets (4):** `.changeset/wave-12-b-fix-2-{fetch-body-size,utils-ssrf-hardening,m9s-cache-security-defaults,pg-client-batch-atomic}.md` — each cites the relevant finding numbers and CWE.

## Suggested follow-up

Per EVID-044 §"Suggested follow-up wave structure":

- **Wave 12.B-fix-3 (HIGH type-system closures):** `@gertsai/collection` pervasive `any` in exported generics, brand-bypass factories, missing `typesVersions`; `@gertsai/ws-rpc` Node-only `headers?` split; `@gertsai/utils` `getSyncFields` `Record<string, any>`. Plus the `ws-rpc connect()` second-call race (logic HIGH, moved here from fix-2). ~1 day, ~150 LOC.

## Refs

- PRD-030 — this fix wave's PRD
- RFC-021 — execution strategy
- EVID-044 — sources of the 7 HIGH findings
- PRD-029 + RFC-020 + EVID-045 — Wave 12.B-fix-1 (precedent)



