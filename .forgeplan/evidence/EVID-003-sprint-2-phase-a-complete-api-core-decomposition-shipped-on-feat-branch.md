---
depth: standard
id: EVID-003
kind: evidence
last_modified_at: 2026-05-05T11:41:13.803742+00:00
last_modified_by: claude-code/2.1.128
links:
- target: SPEC-002
  relation: informs
- target: ADR-003
  relation: informs
- target: ADR-002
  relation: informs
- target: PRD-001
  relation: informs
status: active
title: Sprint 2 Phase A complete — api-core decomposition shipped on feat branch
---

---
id: EVID-003
title: "Sprint 2 Phase A complete — api-core decomposition shipped on feat branch"
status: draft
created: 2026-05-05
updated: 2026-05-05
---

# EVID-003: Sprint 2 Phase A complete — api-core decomposition

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: measurement

## Summary

Sprint 2 Phase A implementation per SPEC-002 завершён через AgentTeams pattern: 5 phases (Phase 1 team-lead solo → Phase 2 3 parallel workers → Phase 3 2 parallel migrators → Phase 4 team-lead solo → Phase 5 verify+commit). Все 12 task items (T-1..T-12) applied на branch `feat/api-core-decomposition`.

**Branch**: `feat/api-core-decomposition` (4 commits, locally complete; не запушено).

## Implementation evidence per task

### T-1: tsconfig.base.json → ESNext + Bundler (Phase 1, commit cff1736)
- `module: "CommonJS" → "ESNext"`, `moduleResolution: "node" → "Bundler"`.
- Discovery: `Preserve` (TS 5.4+) конфликтует с CJS sub-build CLI overrides (TS5095) — pivoted к `ESNext` (es2015+).
- 3 dual-build packages (llm-costs, utils, di) получили `--moduleResolution node` override в `build:cjs` script для CJS sub-build compat.
- `packages/api-core/tsconfig.json` получил per-package `moduleResolution: node` override (CJS-only legacy package; per ADR-003 amendment legacy-edge-case provision).
- Other CJS-only packages (core, fsm, fetch, collection, ws-rpc, flux, api-rlr) уже имели per-package overrides — unaffected.
- NodeNext packages (m9s-cache, auth-openfga, hsm) — unaffected.

### T-2: Neutral workflow contracts in @gertsai/core (Phase 2, commit 4d07403)
- `packages/core/src/workflow/types.ts` (NEW) + `index.ts` barrel.
- Types: `WorkflowDefinition<TInput, TOutput>`, `WorkflowRun`, `WorkflowSignal`, `WorkflowState` (discriminated union), `WorkflowStepResult`, `EventEnvelope<TPayload>`.
- `packages/core/src/index.ts` reexport.

### T-3..T-8: api-core decomposition (Phase 2, commit 4d07403)
- 4 NEW barrels:
  * `src/contracts/index.ts` — reexports lib/error, lib/apiResponse, lib/envelope, lib/common, lib/diagnostics
  * `src/moleculer/index.ts` — reexports lib/controller, lib/oauth, all moleculer/*, workflow stub
  * `src/moleculer/workflow/{types,setWorkflows,index}.ts` — experimental setWorkflows stub импортирующий WorkflowDefinition из @gertsai/core
  * `src/runtime/node/index.ts` — reexport loadConfig + createGcpLoggerStream (no physical move per I-12)
- `src/index.ts` обновлён: JSDoc @deprecated, reexports только contracts + moleculer (НЕ runtime/node).
- `package.json exports` field с 4 entries (".", "./contracts", "./moleculer", "./runtime/node", "./package.json").
- `src/__test__/configLoader.test.ts` migrated к subpath `../runtime/node`.
- BREAKING: root @gertsai/api-core больше не reexports `loadConfig`.

### T-9: Stale paths cleanup (Phase 2, commit 4d07403)
- 6 tsconfig.json удалили stale `paths` mappings: api-core (`@gerts/core` pre-rename!), api-rlr (workspace api-core override), auth-openfga, collection, flux, fsm.
- `grep -rn '"paths"' packages/*/tsconfig.json` → 0 hits после cleanup.

### T-10: api-rlr subpath migration (Phase 3, commit 76dd74b)
- 2 imports `from '@gertsai/api-core'` → `from '@gertsai/api-core/contracts'` (`APIError`, `ResponseCode`, `ResponseDataType`).
- `packages/api-rlr/tsconfig.json` per-package override на ESNext+Bundler (mirror m9s-example) для subpath resolver compat.
- 0 hits root imports после migration.

### T-11: m9s-example subpath migration (Phase 3, commit 76dd74b)
- 10 source files migrated, 11 import statements rewritten:
  * 3 → /contracts (APIError, ResponseCode в action handlers)
  * 7 → /moleculer (ApiController, createApiService, ServiceContextBase, BullMQConnectionOptions, QueueHandlerCtx)
  * 0 → /runtime/node (m9s-example не использует loadConfig из api-core)
- `examples/m9s-example/tsconfig.json` восстановлен на ESNext+Bundler.
- **Hex layer compliance preserved**: zero `@gertsai/api-core/*` imports в `domain/` или `application/` (per ADR-002).
- 0 hits root imports после migration.

### T-12: Hex enforcement (Phase 4, commit 231d51d)
- `examples/m9s-example/.dependency-cruiser.cjs` (NEW) с 6 rules: 5 layer-violation rules (error severity) + 1 prefer-subpath rule (warn).
- `.eslintrc.cjs` (root, NEW) с no-restricted-imports на `@gertsai/api-core` + pre-rename `@gerts/api-core` (warn level).
- Verify: `pnpm dlx dependency-cruiser src/index.ts` (in m9s-example) → ✔ no dependency violations found (216 modules, 356 dependencies cruised). Baseline GREEN.

## Full repo verification (Phase 5)

| Check | Result |
|------|--------|
| `pnpm install --frozen-lockfile` | ✅ Done in 2s; postinstall ts-patch OK |
| `pnpm build` | ✅ All 14 packages + m9s-example green (21 Done outputs) |
| `pnpm test` | ✅ **3488 passed / 103 skipped** — matches Sprint 1 baseline (zero regressions) |
| `pnpm typecheck` | ✅ All projects green |
| `pnpm dlx publint --strict packages/api-core` | ✅ Exports field валиден; 1 suggestion про `type` field (pre-existing) |

## Test counts (per package)

| Package | Pass / Skip | Status |
|---------|-------------|--------|
| llm-costs | 33/0 | ✓ |
| fsm | 201/0 | ✓ |
| fetch | 64/0 | ✓ |
| m9s-cache | 106/0 | ✓ |
| collection | 761/1 | ✓ |
| ws-rpc | 107/0 | ✓ |
| flux | 353/0 | ✓ |
| core | 1107/53 | ✓ (workflow types added, no regressions) |
| auth-openfga | 60/0 | ✓ |
| hsm | 25/0 | ✓ |
| api-core | 370/0 | ✓ (decomposition, no regressions) |
| api-rlr | 289/48 | ✓ (subpath migration, no regressions; Redis tests skipped) |
| m9s-example | 12/1 | ✓ (subpath migration, no regressions; e2e skipped) |
| **TOTAL** | **3488/103** | ✓ |

## Commits (4 на feature branch)

```
231d51d feat(monorepo,m9s-example): Phase 4 — hex layer enforcement (T-12)
76dd74b feat(api-rlr,m9s-example): Phase 3 — consumer migration to api-core subpaths (T-10, T-11)
4d07403 feat(api-core,core): Phase 2 — subpath decomposition + neutral workflow contracts (T-2..T-9)
cff1736 feat(monorepo): tsconfig.base.json → ESNext+Bundler (T-1, SPEC-002)
```

Plus changeset `.changeset/sprint-2-decomposition-phase-a.md` (minor bumps для api-core, api-rlr, core).

## Wall-clock metrics

- Phase 1 (T-1): ~15 минут team-lead solo (включая discovery + 2 retries для CJS sub-build).
- Phase 2 (T-2..T-9): 3 параллельных воркера, ~25 минут (token limit pause учитывая).
- Phase 3 (T-10..T-11): 2 параллельных migrators, ~5 минут.
- Phase 4 (T-12): ~10 минут team-lead solo.
- Phase 5 (verify): ~5 минут.
- **Total**: ~60 минут wall-clock (vs SPEC-002 estimate 3.5-4 часа без token limit, что подтверждает estimate accuracy).

## AgentTeams pattern observations

- Disjoint file scope worked perfectly — 0 merge conflicts между phases.
- api-core-decomposer спонтанно re-verified build after tsconfig-cleaner finish — emergent coordination без explicit instruction.
- tsconfig-cleaner ушёл idle без summary — нормальное worker behavior; team-lead заметил через TaskList + git status.

## Discrepancies / known limitations

- **`runtime/node/index.ts`** — barrel reexport, не physical move (per I-12 amendment). Phase A2 / Sprint 3 может перенести физически.
- **`setWorkflows()` — experimental stub** per ADR-003 §R-4. Real implementation deferred до Wave 3 stability `@moleculer/workflows`.
- **Hex enforcement в warning-only mode** для prefer-subpath rule — fail-on-violation switch в Sprint 3 phase 2 per ADR-002 plan.
- **api-core publint suggests `type` field** — pre-existing, не от Sprint 2.
- **Smoke branch `sprint-2/smoke-typia-subpath`** — retained; будет deleted после Sprint 2 PR merge.

## Verdict rationale

`supports` ADR-003 + SPEC-002 + PRD-001:
- All 12 acceptance check-boxes (T-1..T-12) met.
- Zero regressions (3488 passed = baseline preserved).
- Wave 2 acceptance test (m9s-example на decomposed api-core) PASSED.
- Library boundary properly drawn — confirmed by m9s-migrator's hex compliance audit.
- ADR-003 §I-1 (zero side effects на contracts subpath) measurable via `node -e require`.
- ADR-003 §I-9 (no-restricted-imports rule) implemented в Phase 4.

`congruence_level: 3` (CL3): full repo measurements на real workspace, real tests, real builds.

`evidence_type: measurement`: structured measurement (test counts, build outputs, commit hashes), не synthetic experiment.

## Decisions driven by this evidence

- ADR-003 ready to activate (post-EVID-003 + post-EVID-002 chain).
- SPEC-002 ready to activate (R_eff support через EVID-003 measurement evidence).
- ADR-002 (hex enforcement) ready to activate — T-12 implementation done.
- Smoke branch может быть deleted после feature branch merge (per ADR-003 amendment Q3 decision).

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| ADR-003 (Platform Runtime Boundaries) | ADR | informs (full implementation evidence) |
| ADR-002 (Hex layer enforcement) | ADR | informs (T-12 implementation) |
| SPEC-002 (Sprint 2 Phase A checklist) | Spec | informs (all 12 checklist items applied) |
| PRD-001 (Wave 2 — Clean Library Platform) | PRD | informs |
| EVID-001 (Sprint 1 fixes applied) | Evidence | informs (Sprint 1 was preрequisite) |
| EVID-002 (smoke typia + subpath) | Evidence | informs (smoke evidence supported Phase A direction) |
| Branch feat/api-core-decomposition | git artifact | implementation (4 commits) |






