---
'@gertsai/api-core': patch
---

Wave 35 — polish 9 of 11 EVID-087 audit follow-ups (2 explicitly deferred).

5-phase forge-cycle through 4 parallel teammates by disjoint file scope. Closes all actionable polish items from Wave 31/32/33/34 multi-expert audit (8.6/10, APPROVE_WITH_FIXES).

**Phase A — types + extension API tightening**:
- **type-W2** (CRIT-priority): `ComposableStageName = Exclude<StageName, 'translateError' | 'cleanup'>` narrows `setStageOverride`/`addStageBefore`/`addStageAfter`/`wrapStage` signatures. Compile-time rejection of `'translateError'`/`'cleanup'` (which are hard-wired in PipelineRunner). Was silent no-op runtime bug.
- **arch-W1 + type-W1 consensus**: replaced parallel `STAGE_NAMES`/`DEFAULT_STAGES` arrays with single `STAGE_REGISTRY` tuple-array (`as const satisfies`). Eliminates parallel-array drift hazard + `STAGE_NAMES[i]!` non-null assertion. Backward-compat derived exports preserved.
- **arch-W2**: reverted Wave 33.C W1 cosmetic `sessionFactory` param rename — `user_uuid`/`user_type` now consistent with wire-level Moleculer `ContextMeta` snake_case. JSDoc-only revert.

**Phase B — middleware edge case hardening**:
- **logic-W1**: `Array.isArray()` guard on multi-value `x-tenant-id` HTTP header in `tryGetRequestContextFromCtx`. Misleading "Tenant scope violation" replaced with clear "multi-value tenant header" error.
- **logic-W2**: empty-string `testSession.tenantId=''` now collapses to `undefined` via `normalizedSessionTenantId`. Prevents silent `isInTenant('')` ambiguity downstream.

**Phase C — test fidelity**:
- **test-C1** (CRITICAL): replaced impossible assertion in `coercion.test.ts` 4th CRIT-6 test (`expect(typeof __proto__).not.toBe('number')` — always true regardless of guard). New test snapshots `Object.getOwnPropertyNames(Object.prototype)`, runs coerceQueryParams with prototype-pollution payload + legit `limit: '42'`, asserts prototype unchanged + legit value coerced. Now FAILS if guard removed.
- **test-W1**: widened runner.test.ts `stageTimeoutMs` ratio from 4x (25ms vs 100ms) to 10x (20ms vs 200ms) — reduces slow-CI-runner flake risk.
- **security-W2**: added AC-A7 + AC-A8 tests covering `addStageAfter` + `wrapStage` sensitive-stage `logger.warn` emission (mirrors AC-A6 for `addStageBefore`).
- **security-W1**: deferred — testSession gating negative test is structurally untestable inside running Vitest suite (module-load env capture happens before `process.env` mutation can take effect). Requires separate Vitest worker config. Documented for future hardening.

**Phase D — perf-check + README polish**:
- **arch-W4**: dropped dead `controller: {}` from `perf-check.mjs` deps literal (PipelineDeps dropped field in Wave 32.C HIGH-5).
- **logic-W3**: `gatePct <= 0` guard (was `< 0`) — closes DoS-via-bad-baseline vector (a committed `gate_pct: 0` would make any drift fail CI).
- **arch-W3**: added "Naming boundary" sections to `storage-core/README.md` + `entity-storage/README.md` documenting `_uid` (storage row-id) vs `uuid` (entity JSON) distinction.

**Phase E — final verification**:
- `pnpm typecheck` workspace — 0 errors
- `pnpm --filter @gertsai/api-core test` — **401/401** (399 + 2 new AC-A7/A8)
- `pnpm --filter @gertsai/session test` — 32/32
- `pnpm --filter @gertsai-examples/m9s-example typecheck` — 0 errors
- m9s real-infra test count unchanged (pre-existing Docker timeout, not regression)

**Bump**: `@gertsai/api-core` PATCH — `ComposableStageName` is a TYPE NARROWING (subset of existing `StageName`). Calls like `setStageOverride('translateError', ...)` that previously compiled but silently no-op'd now FAIL at compile time. This is a strict improvement; existing consumer code that passed 11 valid stage names is unaffected.

**API impact**: zero public surface breaks for correct consumer code. Only previously-broken-but-silent code (anchor='translateError'/'cleanup') now surfaces as compile error — net positive.

After Wave 35: EVID-087 9/11 closed (82%), 2 deferred. Combined session audit closure 44/44 unchanged. Project state v1.0-ready.

Refs: PRD-069, EVID-088 (closure proof), EVID-087 (audit source)
