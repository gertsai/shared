---
'@gertsai/api-core': patch
---

Wave 32 — close 2 CRIT + 9 HIGH from EVID-083 audit (Wave 31 multi-expert review).

7-phase sequential forge-cycle through 6 teammates by disjoint file scope:

**Phase A — Security CRIT-1 + CRIT-3 (testSession seam)**:
- `wave5-middlewares.ts`: `TEST_SESSION_ALLOWED` requires `NODE_ENV !== 'production' && GERTSAI_TEST_SESSION_ALLOW === '1'`
- Module-load-time throw if `GERTSAI_TEST_SESSION_ALLOW=1` in production (fail-loud)
- `expectedTenantId` derived from `testSession.tenantId` (single source of truth); throws on header mismatch
- `vitest.config.ts` sets env for tests

**Phase B — Security CRIT-6 (prototype pollution)**:
- `coercion.ts`: `DANGEROUS_KEYS` Set + `if (DANGEROUS_KEYS.has(field)) continue` in 4 coerce helpers
- +4 tests verifying `Object.prototype` not mutated via `__proto__`/`constructor`/`prototype` field names

**Phase C — Pipeline core hardening (HIGH-2/5/8/9)**:
- `runner.ts`: `cleanup(ctx, deps)` wrapped in try/catch in finally; cleanup errors logged via `deps.logger?.error`, original error preserved (JS finally-vs-catch fix)
- `types.ts` + `ApiController.class.ts`: dropped unused `controller: AnyApiController` field from `PipelineDeps`
- `establish-auth-session.ts`: removed `meta.user_type as any` cast + `eslint-disable` (newly-introduced regression closed)
- `wrap-response.ts`: replaced `ctx.result!` non-null with explicit guard + diagnostic error (safe under setStageOverride('invokeHandler', ...))

**Phase D — setStageOverride threat model (HIGH-4)**:
- `ApiController.class.ts`: module-private `SENSITIVE_STAGES` Set (4 names: `establishAuthSession`, `validateRequest`, `validateResponse`, `injectTenantId`)
- `setStageOverride` emits `logger.warn` on sensitive-stage override
- Enhanced JSDoc with `@security` warning + composition-pattern example
- README.md: new "Security boundary — sensitive stages" subsection

**Phase E — Missing tests (HIGH-10/11)**:
- `cleanup.test.ts`: +1 test for `$destroy() throws` (meets SPEC-021 ≥5 AC)
- `establish-auth-session.test.ts`: +2 tests for `sessionFactory === undefined` (required + optional)
- `apiController-stage-override.test.ts`: +2 bonus tests for warn on sensitive/non-sensitive override

**Phase F — perf-check.mjs hardening (HIGH-3)**:
- Default `PERF_WARMUP` 200 → 1000 (V8 TurboFan threshold)
- `parseFiniteIntEnv` / `parseFiniteNumberEnv` validators (NaN-silent-bypass closed)
- `--dry-run` flag for `--update` mode (poison protection)
- baseline JSON.parse wrapped (tampering surfaces with distinct exit codes 4-7)
- dist/ existence check up-front

**Phase G — Final verification**:
- `pnpm typecheck` workspace: 0 errors
- `pnpm --filter @gertsai/api-core test`: 390/390 passing (+5 new since EVID-083)
- `pnpm --filter @gertsai/api-core build`: dual ESM+CJS green
- m9s-example: 15 passed, 1 skipped, 1 failed (pre-existing Docker timeout, NOT regression)

**API impact**: zero public surface breaks. `PipelineDeps.controller` was internal (never documented; no stage used it). `setStageOverride` signature unchanged; `logger.warn` is additive observability.

After Wave 32: **Wave 25 (EVID-080) + Wave 31 (EVID-083) audit ledgers 100% closed**. Path clear for v1.0 release decision.

Refs: PRD-066, EVID-083 (Wave 31 audit), EVID-084 (Wave 32 closure proof), Wave 27 PRD-065/SPEC-021/RFC-027/ADR-015.
