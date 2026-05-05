---
depth: standard
id: ADR-001
kind: adr
last_modified_at: 2026-05-05T07:22:04.302991+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-001
  relation: based_on
status: superseded
title: Module composition framework — gerts-module.yaml + module-loader (YAML-driven)
---

---
id: ADR-001
title: "Module composition framework — gerts-module.yaml + module-loader (YAML-driven)"
status: superseded
depth: deep
valid_until: 2027-05-05
prd_ref: PRD-001
created: 2026-05-05
updated: 2026-05-05
superseded_by: "deferred to Wave 3"
---

# ADR-001: Module composition framework — YAML-driven (gerts-module.yaml + module-loader)

> ⚠️ **STATUS: SUPERSEDED → deferred to Wave 3** (decision 2026-05-05).
>
> **Reason for deferral**: Wave 2 reframed from "Hub backend foundation" → "library-first clean platform" (PRD-001 reframe 2026-05-05). User decision: «YAML-framework — Wave 3».
>
> **Что остаётся в силе**: B1 как принципиальный выбор для будущего Wave 3 — когда придёт время делать декларативную композицию, делаем YAML-driven (не TS-decorator), на основании FPF EVALUATE matrix ниже. Этот ADR сохраняется как **зафиксированное намерение**, не как активная work item.
>
> **Что выпадает из Wave 2 scope**: `@gertsai/module-spec`, `@gertsai/module-loader`, `gerts-module.yaml`, `gerts-app.yaml` — все откладываются.
>
> **Что заменяет в Wave 2**: программная композиция через composition root (как в текущем m9s-example), на основе **decomposed api-core** (см. ADR-003). m9s-example рефакторится на чистые либы, не на YAML loader.
>
> **Refresh trigger**: когда Wave 2 завершён и есть ≥2 проекта, которые повторяют composition pattern руками — это сигнал, что декларативная yaml-композиция нужна. Тогда этот ADR re-activate'ится.

---

## Context (preserved for future Wave 3)

PRD-001 (Wave 2) изначально фиксировал необходимость декларативной композиции Moleculer-бэкендов. Сейчас:

- **m9s-example** wired вручную через `composition/infrastructure.ts` (~80 LOC TS): factory functions читают env, создают adapters, экспортируют singleton — потом каждый сервис в `src/services/<name>/lifecycle.ts` импортирует этот singleton.
- **GertsHub** планировался под 6 P0 services × 9 bounded contexts × множественные deployment-варианты (Free/Pro/Enterprise/Self-hosted) — это N×M файлов TS-композиции, которые нельзя поменять без redeploy.
- **gertsai_codex** имеет свой `apps/pipeline/src/composition/*` стиль — не унифицирован.

**После reframe 2026-05-05**: Hub перестал быть driver. Wave 2 теперь — про чистые либы, на которых можно собрать что угодно (Hub — частный случай, придёт позже). Программная композиция через composition root **достаточна** для Wave 2 acceptance (m9s-example refactor на decomposed api-core).

YAML-framework нужен только если ≥2 независимых проекта повторят composition pattern руками — тогда абстракция оправдана.

User decision (2026-05-05, развилка B + последующий reframe): B1 (YAML-driven подход) принят как **направление**, но defer to Wave 3.

## Decision (preserved for Wave 3 reactivation)

**Selected (для Wave 3)**: B1 — YAML-driven module composition через два артефакта:

1. `gerts-module.yaml` (per package): декларация модуля — exposes (actions/channels/queues), ports (с list of available adapters), env (typed schema), requires (внешние пакеты + infra deps).
2. `gerts-app.yaml` (per deployment): композиция — какие модули включить, какие adapters per port, transport, observability, workers config.

**Реализуется двумя пакетами** (Wave 3):

- `@gertsai/module-spec` — JSON Schema + TypeScript types + ajv-validator.
- `@gertsai/module-loader` — runtime: читает app.yaml, разрешает зависимости, строит DI-граф через `@gertsai/di`, стартует `@gertsai/api-core` `ApiController`.

**Программный API сохраняется** (escape hatch): `ModuleLoader.fromObjects({...})`. Yaml не делает ничего, чего нельзя сделать программно.

**Why Selected (rationale preserved)**:

1. **Декларация → диффы → GitOps**. Operator может менять deployment topology через PR yaml-файла, без re-build Docker image.
2. **Schema = контракт между сервисом и платформой**. JSON Schema валидирует на boot — нельзя стартовать с typo.
3. **CI/tooling-friendly**. YAML читается без TS-компиляции — можно делать `gerts mod graph`, `gerts mod diff dev pro` без рантайма.
4. **Multi-deployment scaling**. Hub имел бы 4+ deployment variants — каждый один yaml.
5. **Hex compatibility**. Ports → adapters mapping в yaml = декларация того, что hex-теория уже фиксирует доктринально.

## Alternatives Considered (preserved)

(Полный анализ оставлен для Wave 3 reference.)

### Option A — Status quo (TypeScript composition root в каждом репо)

**Description**: продолжать `composition/infrastructure.ts` как в m9s-example. **CHOSEN FOR WAVE 2** (после reframe).

**Pros**:
- Type-safe (TS-компилятор проверяет всё).
- Нулевой extra runtime overhead.
- Знакомый pattern (NestJS modules, прямой DI).

**Cons (для будущего Wave 3 evaluation)**:
- N×M файлов TS на N сервисов × M deployments — copy-paste при росте.
- Нельзя переключить deployment без re-build/re-deploy.
- Нет машинно-читаемого manifest для tooling/observability.

### Option B1 — YAML-driven (CHOSEN as direction, deferred to Wave 3)

См. §Decision. Победитель FPF EVALUATE matrix.

### Option B2 — TypeScript decorator-driven (NestJS-style)

**Cons**: Нужна TS-компиляция для чтения композиции; operator не может менять deployment без re-build TS; не GitOps-friendly.

### Option B3 — Hybrid (TS source-of-truth + auto-export YAML)

**Cons**: Дублирование (TS + auto-yaml), двусторонняя синхронизация.

### Option C — Off-the-shelf framework (Backstage, NestJS, ts-mesh)

**Cons**: Backstage heavy; NestJS overlap с Moleculer; lock-in в чужой framework.

## Trade-off Analysis (preserved)

| Критерий | A (TS comp) | **B1 (YAML)** | B2 (decorator) | B3 (hybrid) | C (off-shelf) |
|----------|---------------|---------------|-----------------|-------------|----------------|
| **Total** | **31** | **44** | **34** | **34** | **23** |

B1 wins для Wave 3 timeline.

## Consequences (revised after deferral)

### Positive (preserved для Wave 3)

- Hub: 1 yaml на deployment instead of N×M TS-композиций.
- m9s-example: composition/infrastructure.ts уменьшится с 80 LOC до ≤10 LOC.
- OSS onboarding: external developer читает yaml, не разбирает TS-DI-граф.
- CI/CD: lint/diff/graph на yaml без node-runtime.

### Negative (revised — теперь deferral cost, не implementation cost)

- **Wave 2 не получает декларативной композиции** — программный composition root остаётся (как в m9s-example сегодня).
- **Hub при появлении** (Wave 4+) будет писать TS-композицию, не yaml — увеличивает cost migration на yaml позже, если Hub станет production.
- **Knowledge encoded** — этот ADR сохраняет рассуждения; refresh потребует только reactivate, не re-evaluation.

## Invariants (preserved для Wave 3 reactivation)

- I-1..I-7 как было (см. оригинальный текст до reframe). Не действуют до Wave 3.

## Refresh Triggers (для re-activation)

- ≥2 проекта на @gertsai/* foundation повторяют composition pattern руками — signal что абстракция оправдана.
- Hub переходит к active development и требует multi-deployment composition.
- TC39 decorators stage-4 + native runtime support → пересмотр B2 vs B1.

## Implementation Plan (REVISED — defer Wave 3)

### Phase 0 (Wave 2 deferral)

- [x] **0.1** ADR-001 (this) marked superseded → defer to Wave 3
- [x] **0.2** PRD-001 reframed to library-first; module framework FRs removed
- [x] **0.3** Wave 2 scope adjusted (см. ADR-003 + SPEC-001 + revised PRD-001)

### Phase 1+ (Wave 3 reactivation, when triggered)

- [ ] Re-activate ADR-001 (status proposed)
- [ ] Create RFC for `gerts-module.yaml` + `gerts-app.yaml` schema v1
- [ ] Create RFC for `@gertsai/module-loader` runtime architecture
- [ ] Create Spec for `@gertsai/module-spec` API
- [ ] Create Spec for `@gertsai/module-loader` API
- [ ] Implementation + m9s-example refactor под yaml

## Related Artifacts (revised)

| Artifact | Type | Relation |
|---|---|---|
| PRD-001 | PRD | based_on (но scope reframed) |
| ADR-002 (Hex layer enforcement) | ADR | informs (hex остаётся active в Wave 2) |
| ADR-003 (Platform Runtime Boundaries) | ADR | informs (decomposition api-core — теперь центр Wave 2) |
| SPEC-001 (Sprint 1 hygiene checklist) | Spec | informs (Sprint 1 предшествует декомпозиции) |
| GertsHub RFC-004 (Moleculer Customization Patterns) | RFC (external) | informs (preserved для Wave 3) |
| GertsHub RFC-001 (Bounded Context Map) | RFC (external) | informs |

> **Next step (Wave 2)**: ADR-003 (Platform Runtime Boundaries) — теперь это центральный ADR. Этот ADR-001 — frozen pending Wave 3.

