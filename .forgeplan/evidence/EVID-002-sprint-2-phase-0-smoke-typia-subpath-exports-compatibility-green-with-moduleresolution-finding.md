---
depth: standard
id: EVID-002
kind: evidence
last_modified_at: 2026-05-05T08:57:09.510298+00:00
last_modified_by: claude-code/2.1.128
links:
- target: ADR-003
  relation: informs
- target: SPEC-002
  relation: informs
status: active
title: Sprint 2 Phase 0 smoke — typia + subpath exports compatibility GREEN with moduleResolution finding
---

---
id: EVID-002
title: "Sprint 2 Phase 0 smoke — typia + subpath exports compatibility GREEN with moduleResolution finding"
status: draft
created: 2026-05-05
updated: 2026-05-05
---

# EVID-002: Sprint 2 Phase 0 smoke — typia + subpath GREEN

## Structured Fields

verdict: supports
congruence_level: 3
evidence_type: test

## Summary

Phase 0 smoke test для ADR-003 §Implementation Plan §0.2 (mitigation R-1 «typia transformer compatibility»). Single smoke-tester worker на временной branch `sprint-2/smoke-typia-subpath` создал минимальные subpath exports в api-core, переключил один import в каждом из двух consumers (m9s-example, api-rlr), прогнал full build/test/typecheck.

**Verdict GREEN с условием**: typia transformer **полностью совместим** с subpath exports. R-1 (typia compat risk) **REFUTED** evidence. Phase A safe to proceed.

## Refuted hypothesis (ADR-003 R-1)

H1 (R-1): «typia transformer не поддерживает корректно subpath imports».

Smoke evidence:
- `pnpm --filter @gertsai/api-core build` (tspc — ts-patch wrapped tsc) на новом `src/contracts/index.ts` barrel прошёл без warnings.
- `pnpm --filter @gertsai/api-core test` — 370/370 pass (включая typia-driven type-guards).
- `pnpm exec tsc --noEmit` в api-rlr (consumer импортит из `@gertsai/api-core/contracts`) — 0 errors.

**Verdict**: **REFUTED**. typia не зависит от resolver mode и видит исходные `.ts` через свой transformer как обычно.

## Discovered finding (NEW — drives ADR-003 amendment)

**Real gate**: `moduleResolution`. Текущий `tsconfig.base.json` использует `node` (Node10 spec), который **в принципе не читает `package.json` exports field** (TS-known limitation, документировано в TS docs).

**First smoke attempt** (без tsconfig change) упал с:
```
TS2307: Cannot find module '@gertsai/api-core/contracts' or its corresponding type declarations.
There are types at '...dist/src/contracts/index.d.ts', but this result could not be resolved
under your current 'moduleResolution' setting.
Consider updating to 'node16', 'nodenext', or 'bundler'.
```

**Resolution applied**:
- `packages/api-rlr/tsconfig.json`: `module: CommonJS → Node16`, `moduleResolution: node → Node16`.
- `examples/m9s-example/tsconfig.json`: `module: commonjs → ESNext`, `moduleResolution: node → Bundler` (Node16 ломает m9s — CJS-в-ESM imports `@gertsai/m9s-cache`, `@moleculer/workflows`).
- После — все builds + tests green.

**Implication**: Phase A требует **prerequisite** — bump `tsconfig.base.json` на `moduleResolution: Bundler` (или per-consumer override). Это **scope expansion** ADR-003 → закреплено amendment 2026-05-05 (см. ADR-003 §⚠️ Amendment).

## Additional finding — stale `paths` mappings

`packages/api-rlr/tsconfig.json` имел legacy `paths` mapping:
```jsonc
{
  "paths": {
    "@gertsai/api-core": ["../api-core/dist/index.d.ts"]
  }
}
```

Фактический путь — `../api-core/dist/src/index.d.ts`. Не палилось из-за pnpm symlinks через `package.json main`. Удалил `paths` целиком — Node16 resolution через symlinks + exports работает напрямую.

**Suspicion**: аналогичный mess в других 13 пакетах. Включается в Sprint 2 scope (T-9 в SPEC-002).

## Configuration tested

**Branch**: `sprint-2/smoke-typia-subpath` (НЕ committed, НЕ pushed; будет deleted после Sprint 2 done per ADR-003 amendment Q3 decision).

**5 modified files + 1 new dir**:
- `packages/api-core/package.json` — добавлен `exports["./contracts"]` → `./dist/src/contracts/index.{js,d.ts}`
- `packages/api-core/src/contracts/index.ts` — NEW barrel, реэкспорт `../lib/error` + `../lib/apiResponse`
- `packages/api-rlr/tsconfig.json` — Node16 module/resolution + paths cleanup
- `packages/api-rlr/src/utils/validations.ts` — `from '@gertsai/api-core'` → `from '@gertsai/api-core/contracts'`
- `examples/m9s-example/tsconfig.json` — ESNext + Bundler
- `examples/m9s-example/src/services/ingest/src/actions/start-workflow.action.ts` — subpath import

## Commands run (all GREEN)

| Command | Result |
|---------|--------|
| `pnpm install` | ✅ 0 errors; ts-patch postinstall OK для core, api-core, m9s-example |
| `pnpm --filter @gertsai/api-core build` | ✅ tspc green, typia transformer на `src/contracts/` штатно |
| `pnpm --filter @gertsai/api-core test` | ✅ **370/370 passed**, 14 test files |
| `pnpm --filter @gertsai/api-rlr build` | ✅ tsc + copy:lua green |
| `pnpm --filter @gertsai/api-rlr test` | ✅ **289 passed | 48 skipped** (Redis-required skipped как ожидалось) |
| `pnpm exec tsc --noEmit` (api-rlr) | ✅ 0 errors |
| `pnpm --filter m9s-example build` | ✅ tspc green |
| `pnpm --filter m9s-example test` | ✅ **12 passed | 1 skipped** (e2e expected skip) |
| `pnpm --filter m9s-example typecheck` | ✅ tspc --noEmit 0 errors |

## Verdict rationale

`supports` ADR-003 + SPEC-002:
- R-1 (typia compat) refuted — Phase A architecture safe.
- Discovery (moduleResolution gate) — actionable, mitigation = Bundler bump (Q1 user decision: B).
- All measured commands green; no regressions.

`congruence_level: 3` (CL3): измерения на real repository, real tests, real consumer paths. Не synthetic.

`evidence_type: test`: концептуально — smoke test (controlled experiment с известной hypothesis), не одноразовое measurement. Pre/post conditions сравнимы, repeatable.

## Decisions driven by this evidence

- **ADR-003 amendment**: добавлены invariants I-10 (Bundler), I-11 (no stale paths), I-12 (barrel reexports OK Phase A); обновлены risks R-1 (refuted), R-5/R-6 (new); Implementation Plan §Phase 2 расширен T-2.0 (tsconfig prereq) + T-2.10 (paths cleanup).
- **SPEC-002**: создан с 12 task items, включая T-1 (tsconfig migration), T-9 (paths cleanup) как direct response на findings.
- **Smoke branch retention**: до Sprint 2 done (per Q3 decision); затем delete.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| ADR-003 (Platform Runtime Boundaries) | ADR | informs (refutes R-1, supports Phase A direction, drives amendment) |
| SPEC-002 (Sprint 2 Phase A checklist) | Spec | informs (Phase 0 prerequisite confirmed; SPEC-002 actionable) |
| PRD-001 (Wave 2 — Clean Library Platform) | PRD | informs |
| Branch sprint-2/smoke-typia-subpath | git artifact | implementation evidence (НЕ committed на main) |
| docs/dd.md | external doc | informs (источник decomposition motivation) |




