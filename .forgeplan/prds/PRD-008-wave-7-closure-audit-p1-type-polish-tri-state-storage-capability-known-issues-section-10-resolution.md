---
depth: standard
id: PRD-008
kind: prd
last_modified_at: 2026-05-08T16:00:19.213777+00:00
last_modified_by: claude-code/2.1.133
status: active
title: Wave 7 closure — audit P1 type polish + tri-state storage capability + KNOWN-ISSUES section 10 resolution
---

---
id: PRD-008
title: "Wave 7.3: workspace-wide strict TypeScript flags (noUncheckedIndexedAccess + exactOptionalPropertyTypes)"
status: Draft
author: gerts_shared
created: 2026-05-08
updated: 2026-05-08
priority: P1
depth: deep
domain: library
projectType: library
stepsCompleted: []
---

# PRD-008: Wave 7.3 — workspace-wide strict TypeScript flags

## Progress

```
Phase 0 (Shape)   ░░░░░░░░░░░░░░░░░░░░░░░░  0/4  (  0%)
Phase 1 (Pilot)   ░░░░░░░░░░░░░░░░░░░░░░░░  0/3  (  0%)
Phase 2 (Build)   ░░░░░░░░░░░░░░░░░░░░░░░░  0/38 (  0%)
Phase 3 (Prove)   ░░░░░░░░░░░░░░░░░░░░░░░░  0/3  (  0%)
─────────────────────────────────────────────────
TOTAL                                       0/48 (  0%)
```

---

## Executive Summary

### Vision

Все 38 packages в `@gertsai/*` workspace проходят compile-time проверки с двумя строгими TypeScript флагами `noUncheckedIndexedAccess` и `exactOptionalPropertyTypes`, эмитят `.d.ts` с точной семантикой optional полей и индексных доступов, без скрытых null-leaks.

### Problem

В текущем `tsconfig.base.json` стоит `strict: true`, но не включены `noUncheckedIndexedAccess` и `exactOptionalPropertyTypes`. Это означает:

- При `arr[i]` или `record[key]` тип результата НЕ содержит `| undefined` — TypeScript считает все индексные обращения safe, что приводит к runtime undefined leaks
- Для optional properties (`foo?: string`) разница между «отсутствует» и `{ foo: undefined }` не enforced — поведение `Object.keys` / spread / serialization непредсказуемо для consumers
- Public `.d.ts` эмитят менее точные типы, чем код реально требует — downstream consumers получают слабые гарантии

**Impact**: эти баги проходят через code review и тесты, всплывают в production через `Cannot read properties of undefined`, влияют на reliability OSS пакетов которые мы публикуем под `@gertsai`.

### Target Users

| Персона | Описание | Ключевая боль |
|---|---|---|
| @gertsai package maintainer | Разработчик внутри monorepo | Compiler не ловит обращения к `arr[i]` без проверки → баги доходят до runtime |
| Downstream consumer | Внешний разработчик пишущий код против `@gertsai/*` | Получает `.d.ts` с неточной optional/index семантикой → false confidence |
| OSS contributor | Внешний contributor открывающий PR | Хочет strict environment предотвращающий regressions |

### Differentiators

- Защита на уровне типов, без runtime cost
- Соответствие best practice TypeScript 5.x для критичных кодовых баз
- Workspace-wide consistency: все 38 packages играют по одним правилам

---

## Success Criteria

| ID | Criterion | Metric | Current | Target | Timeframe | How to Measure |
|---|---|---|---|---|---|---|
| SC-1 | Все packages typecheck clean с обоими флагами | TS errors | unknown (pilot) | 0 | Wave 7.3 close | `pnpm typecheck` |
| SC-2 | Test suite не имеет regressions | Tests pass | 4843 | ≥ 4843 | Wave 7.3 close | `pnpm test` |
| SC-3 | DTS emit без скрытых breaking changes | Manual diff sample size | 0 | 5 packages reviewed | Wave 7.3 close | DTS diff review |
| SC-4 | Strict flags applied workspace-wide | flag count | 0/2 | 2/2 | Wave 7.3 close | `grep noUncheckedIndexedAccess tsconfig.base.json` |
| SC-5 | typecheck wall-clock в пределах +20% baseline | duration ratio | 1.0x | ≤ 1.2x | Wave 7.3 close | `time pnpm typecheck` |

---

## Product Scope

### MVP (In-Scope)

- Включить `noUncheckedIndexedAccess` в `tsconfig.base.json` или per-package configs (стратегия — RFC)
- Включить `exactOptionalPropertyTypes` в `tsconfig.base.json` или per-package configs
- Зафиксить все compile errors в 38 packages source кода
- Зафиксить все compile errors в test файлах packages
- Зафиксить compile errors в `examples/m9s-example/` если задействован
- Changeset для consumer-facing release note (minor bump на затронутые packages)
- Сохранить test green, build clean, smoke pass

### Out of Scope

- Никаких new APIs / публичных контрактов
- Никаких breaking changes для consumers БЕЗ намеренного решения через RFC
- Не переписывать существующие data structures для оптимизации под флаги
- Не включать дополнительные strict флаги (`noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `verbatimModuleSyntax`)
- Не модифицировать внешний `gertsai_codex` repo
- Не делать API redesign по результатам найденных type-narrowing мест

### Growth Vision

- Wave 7.6 — рассмотреть `noPropertyAccessFromIndexSignature`
- Wave 8 — `verbatimModuleSyntax` для ESM cleanup
- Standard для всех новых @gertsai packages going forward

---

## User Journeys

### Journey 1: Maintainer ловит null-leak compile-time

**Цель**: Написать код без runtime undefined errors.

| Шаг | Действие | Ответ системы | Заметки |
|---|---|---|---|
| 1 | `const item = arr[i]; item.method()` | Compile error TS2532 — `item` may be undefined | До Wave 7.3 — compile clean, runtime crash |
| 2 | Добавляет `if (item)` или `arr.at(i) ?? throw` | Compile clean | Pattern identified compile-time |
| 3 | PR проходит CI typecheck | Green | Нет null-leak в production |

### Journey 2: Consumer видит точные .d.ts

**Цель**: Использовать `@gertsai/*` package с точными типами.

| Шаг | Действие | Ответ системы | Заметки |
|---|---|---|---|
| 1 | Импортирует `interface Foo { bar?: string }` | TS отличает `{ bar: undefined }` от `{}` | EOPT включён |
| 2 | Передаёт `{ bar: undefined }` в `Foo`-функцию (если у consumer EOPT) | Compile error | Точная семантика |
| 3 | Consumer без EOPT — поведение pre-Wave 7.3 | No regression | EOPT не ломает loose consumers без opt-in |

### Journey 3: OSS contributor PR

**Цель**: Открыть PR не привносящий null-leak.

| Шаг | Действие | Ответ системы | Заметки |
|---|---|---|---|
| 1 | Пишет код с `record[key]` access | CI typecheck fails locally + GitHub Actions | Catches early |
| 2 | Правит до проверки `if (record[key])` или `?.method()` | CI green | PR merge-able |

---

## Functional Requirements

| ID | Category | Priority | Requirement | Journey |
|---|---|---|---|---|
| FR-001 | Core | Must | Maintainer can detect all index-access null leaks at compile time across the workspace | Journey 1 |
| FR-002 | Core | Must | Maintainer can detect optional property exact-shape violations at compile time | Journey 1, 2 |
| FR-003 | Core | Must | Workspace can produce 0-error typecheck across all 38 packages with both flags enabled | Journey 1, 3 |
| FR-004 | UX | Must | Consumer receives type definitions reflecting strict-mode invariants | Journey 2 |
| FR-005 | UX | Should | OSS contributor sees CI failure on null-leak attempts before merge | Journey 3 |
| FR-006 | Integration | Must | `pnpm test` test suite remains green (no regression on 4843 baseline) | Journey 1 |
| FR-007 | Integration | Should | DTS emit changes pass manual review on 5 sample packages without unintended consumer breaks | Journey 2 |

---

## Non-Functional Requirements

| ID | Category | Requirement | Metric | Condition | Measurement |
|---|---|---|---|---|---|
| NFR-001 | Performance | System shall complete workspace typecheck | within +20% of baseline duration | Full workspace `pnpm typecheck` | `time pnpm typecheck` before/after |
| NFR-002 | Maintainability | System shall provide narrow patterns guide | ≥ 1 documented pattern per error category | Wave 7.3 close | `grep guides/` |
| NFR-003 | Reversibility | System shall support single-revert rollback | 1 commit revert restores pre-Wave 7.3 state | Any time post-merge | `git revert HEAD` smoke |
| NFR-004 | Compatibility | System shall avoid forced consumer upgrades | 0 unintended breaking DTS changes | Wave 7.3 close | Manual DTS diff on 5 packages |

---

## Acceptance Criteria

### AC-1: Workspace-wide compile-clean

```gherkin
Given оба флага включены через chosen rollout strategy
When  запускается `pnpm typecheck` от root
Then  exit code 0
And   нет TypeScript errors в любом из 38 packages
And   нет TypeScript errors в examples/m9s-example
```

### AC-2: Test suite parity

```gherkin
Given Wave 7.3 включён
When  запускается `pnpm test` от root
Then  pass count >= 4843 (baseline)
And   skip count <= 103 (baseline)
And   нет новых failing tests
```

### AC-3: Build artifact integrity

```gherkin
Given Wave 7.3 включён
When  запускается `pnpm build` от root
Then  все 38 packages emit dist/ с .d.ts + .js
And   .d.ts отражают strict optional/index семантику
And   нет ошибок компиляции
```

### AC-4: Reversibility

```gherkin
Given Wave 7.3 закоммичен
When  запускается `git revert <commit>`
Then  workspace возвращается в pre-Wave 7.3 state
And   typecheck passes без strict flags
And   test suite остаётся green
```

### AC-5: Performance budget

```gherkin
Given Wave 7.3 включён
When  измеряется wall-clock `pnpm typecheck`
Then  duration <= 1.2x baseline duration
And   memory usage <= 1.3x baseline
```

---

## Dependencies

| Dependency | Type | Status | Owner |
|---|---|---|---|
| TypeScript 5.9 (pinned) | Technical | Ready | n/a |
| Pilot evidence (fsm) | Internal | Pending | gerts_shared |
| SPEC acceptance criteria | Internal | Pending | gerts_shared |
| RFC rollout strategy | Internal | Pending | gerts_shared |
| ADR adoption decision | Internal | Pending | gerts_shared |

---

## Risks & Mitigations

| ID | Risk | Probability | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R-1 | Pilot покажет >500 errors → unbounded effort | Medium | High | Timebox pilot 1-2 дня; если переполнение — split на multiple sprints через RFC | gerts_shared |
| R-2 | EOPT ломает existing consumer code в Hub/Codex | Medium | High | DTS diff review on 5 sample packages; communication с downstream owners перед публикацией | gerts_shared |
| R-3 | Type-fixing вводит implicit null checks где их не было — perf regression | Low | Medium | Спот-проверка benchmark на pg-client critical path; rollback если regression | gerts_shared |
| R-4 | Workspace sequential build уже медленный — typecheck ещё дольше | Low | Low | NFR-001 monitor; revert флага если +>20% | gerts_shared |
| R-5 | Test files имеют много index access — fix scope расширяется | High | Medium | Допустимо `// @ts-expect-error` в test-utils если pattern non-trivial | gerts_shared |
| R-6 | EOPT enforces точную optional семантику, что меняет JSON serialization предположения | Medium | Medium | Сохранить runtime поведение через `Object.assign` patterns; тесты на serialization | gerts_shared |

---

## Timeline

| Milestone | Target Date | Description |
|---|---|---|
| PRD Approved | 2026-05-08 | Requirements locked, validate PASS |
| Pilot Complete | 2026-05-08 | fsm + 2 sample packages measured |
| SPEC/RFC/ADR Approved | 2026-05-09 | Strategy decided, validated |
| Build Complete | 2026-05-10 | All 38 packages green, DTS reviewed |
| Evidence + Activate | 2026-05-10 | EVID linked, R_eff > 0.5, all activated |
| Local Commit | 2026-05-10 | Conventional commits ready BEFORE push gate |

---

## Stakeholders

| Role | Name | Sign-off |
|---|---|---|
| Product Owner | explosivebit | [ ] |
| Engineering Lead | explosivebit | [ ] |
| Implementer | gerts_shared (assistant) | [ ] |
| Reviewer (post-Build) | TBD subagent or fidelity 4∥ | [ ] |

---

## Affected Files

- `tsconfig.base.json` (primary change)
- `packages/*/tsconfig.json` (per-package overrides if strategy=per-package)
- `packages/*/src/**/*.ts` (compile-error fixes)
- `packages/*/src/**/*.test.ts` (test compile-error fixes)
- `examples/m9s-example/{tsconfig.json,src/**}`
- `.changeset/wave-7-3-strict-flags.md` (consumer-facing release note)

---

## Related Artifacts

| Artifact | Relation | Status |
|---|---|---|
| PRD-008 | Self | Draft |
| SPEC-NNN | Acceptance specification (Deep depth) | TBD |
| RFC-NNN | Rollout strategy | TBD |
| ADR-013 (next #) | Strict flags adoption decision | TBD |
| EVID-NNN | Pilot + rollout evidence | TBD |
| ADR-005 | Storage architecture (peer reference) | active |
| ADR-011 | api-rlr boundary (peer reference) | active |

---

> **Next step**: validate PRD-008 → run pilot on `@gertsai/fsm` → create SPEC + RFC + ADR informed by pilot → build → evidence → activate.

