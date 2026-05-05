---
depth: standard
id: PRD-001
kind: prd
last_modified_at: 2026-05-05T07:30:31.155892+00:00
last_modified_by: claude-code/2.1.128
status: draft
title: Wave 2 — Backend Foundation Extension for @gertsai/* monorepo
---

---
id: PRD-001
title: "Wave 2 — Clean Library Platform (library-first reframe)"
status: draft
author: explosivebit (mirik.kubal@gmail.com)
created: 2026-05-05
updated: 2026-05-05
priority: P0
depth: deep
domain: developer_platform
projectType: library
stepsCompleted: ["shape:start", "reframe:library-first"]
---

# PRD-001: Wave 2 — Clean Library Platform

> **Reframe note (2026-05-05)**: PRD-001 был изначально написан как «backend foundation для Hub» с YAML composition framework + Hub adapters в scope. После аудита `docs/dd.md` и user pivot — переписан в **library-first** философию: чистые либы, на которых можно собрать любой проект (Hub — частный случай). YAML composition framework переехал в **Wave 3** (ADR-001 superseded). Hub-specific adapters (`git-client`, `artifact-client`, `rdf-client`) — отложены до момента, когда Hub реально пишет код. m9s-example стал **acceptance test** для всей foundation.

## Progress

```
Sprint 1  ░░░░░░░░░░░░░░░░░░░░░░░░  0/9   (  0%) ← hygiene → SPEC-001
Sprint 2  ░░░░░░░░░░░░░░░░░░░░░░░░  0/9   (  0%) ← decomp api-core → ADR-003
Sprint 3  ░░░░░░░░░░░░░░░░░░░░░░░░  0/8   (  0%) ← clean libs + m9s refactor + hex enforce → ADR-002
Wave 3    ░░░░░░░░░░░░░░░░░░░░░░░░  0/?   (  0%) ← YAML composition (deferred) → ADR-001 (superseded)
─────────────────────────────────────────────────
TOTAL                              0/26  (  0%)
```

---

## Executive Summary

### Vision

`gertsai/shared` становится **clean library platform** — набор чётко разделённых, well-typed npm пакетов под Apache 2.0, на которых можно собрать **любой** Moleculer/Node бэкенд, AI pipeline, OSS приложение. m9s-example — reference blueprint, доказывающий, что foundation работает на реальном hexagonal AI pipeline (ingest + search + workflows + channels + queue).

«Любой другой проект» — Hub, gertsai_codex apps, external OSS adopters — собирается **поверх** этих либ, не диктует их API.

### Problem

Аудит `docs/dd.md` (2026-05-05) выявил, что текущий `@gertsai/api-core` v0.1.0 **ведёт себя как приложение, а не библиотека**:

1. `import 'dotenv/config'` на module-load — скрытый side effect для любого consumer.
2. Eager Google Cloud Logger init — MetadataLookupWarning к `169.254.169.254` (GCP metadata) в local dev.
3. `private: true` + `MIT` license при scope `@gertsai` Apache 2.0 — **release-blocker** (npm откажет).
4. Broken peer dep: `PubSub` тип в публичном API, `@google-cloud/pubsub` в devDependencies.
5. Смешение зон: contracts (APIError, ResponseCode), Moleculer runtime (ApiController, BullMQ, channels, gateway), Node-specific (env, GCP logger), OAuth — всё в одном пакете.

Параллельно `@gertsai/api-rlr` нарушает peer-dep boundary (`ioredis`, `moleculer-web` в devDependencies, импортируется runtime'ом) и жёстко coupled с api-core (`APIError`/`ResponseCode` import).

m9s-example имеет небольшие нарушения hex layout (горизонтальная связь между ingest и search через shared `PermissionDeniedError`) + dependency noise (`@gertsai/collection`, `@gertsai/utils` в `package.json`, не используются).

**Impact**:
- **Невозможно publish** v0.1.0 на npm — `private: true` блокирует.
- **OSS репутация** повреждена с первого релиза — eager GCP eager init, broken peer dep, license mismatch видны first-impression при попытке использовать.
- **Любой downstream проект** (Hub в будущем, external adopter, новый Moleculer бэкенд в `gertsai/shared`-style) **переизобретает** mixin patterns + tracing config + tenant utils + БД-клиента, потому что нет clean foundation packages.
- **Library-first философия не работает**, потому что api-core диктует «вы получаете Moleculer + BullMQ + GCP + dotenv».

### Target Users

| Персона | Описание | Ключевая боль |
|---------|----------|---------------|
| **OSS developer** | Сторонний разработчик находит `@gertsai/*` на npm, хочет собрать свой Moleculer/Node бэкенд | Сейчас api-core тащит Moleculer/BullMQ/GCP/dotenv даже если нужны только error codes — bundle вырастает в 5-10 раз |
| **Reference reader** | Изучает `examples/m9s-example/` чтобы понять как собирать на @gertsai/* | Видит unused deps, горизонтальную связь между use cases — не понимает что копировать |
| **Maintainer (мы)** | Развивает либы, фиксит баги, добавляет фичи | api-core слишком широкий, любое изменение risks affecting множества зон одновременно |
| **Future projects** (Hub, gertsai_codex new services, external adopters) | Собирают backend поверх либ | Без чистых границ — каждый проект изобретает свои patterns, drift гарантирован |

### Differentiators (после Wave 2)

- **Single source of truth для API contracts** через `@gertsai/api-core/contracts` — pure types, zero runtime, использование в Browser / FastAPI / Rust клиенты.
- **Lazy Moleculer runtime** через `@gertsai/api-core/moleculer` — opt-in, никаких side-effects на module load.
- **Neutral platform contracts** в `@gertsai/core` — Workflow, Session, Tenant, Trace, Envelope как language-agnostic types (готовится почва для cross-runtime adapters позже).
- **Hex enforcement в CI** — layer rules не дрейфуют (см. ADR-002).
- **Production-tested** — все либы extracted из 4-летнего gertsai_codex, не green-field.

---

## Success Criteria

| ID | Criterion | Metric | Current | Target | Timeframe | How to Measure |
|----|-----------|--------|---------|--------|-----------|----------------|
| SC-1 | `npm publish` для всех 14 packages под `@gertsai` scope | publish success | impossible (`private: true`) | 14/14 published | 2026-Q3 | `npm view @gertsai/<name> version` для каждого |
| SC-2 | `@gertsai/api-core/contracts` subpath даёт pure types | bundle audit: deps вытянутые при `import { APIError } from '@gertsai/api-core/contracts'` | n/a (subpath не существует) | 0 transitive deps на Moleculer/BullMQ/GCP/dotenv | 2026-Q3 | `pnpm dlx pkg-size @gertsai/api-core/contracts` или isolated test project + `npm ls --all` |
| SC-3 | m9s-example рефакторен на subpath imports + clean libs | counts: imports from root vs from subpaths | 0 subpath imports | 100% imports use subpaths (root reexports не используются в новом коде) | 2026-Q3 | grep audit |
| SC-4 | Hex layer rules enforced в CI gate | PRs, заваленные нарушением layer rules | n/a (нет enforcement) | ≥1 за первый месяц = доказательство, что gate работает | 2026-Q3 | GitHub Actions `lint:depcruise` job log |
| SC-5 | Bundle size `@gertsai/api-core/contracts` (если публикуется отдельно или замеряется через subpath) | minified+gzipped | n/a | ≤ 30 KB | 2026-Q3 | `pkg-size` CI check |
| SC-6 | OSS onboarding — external developer собирает простой Moleculer бэкенд | Hello-world + ingest/search demo, по step-by-step из README, до working state | n/a | ≤ 60 минут wall-clock | 2026-Q4 | tutorial measured on 3 external testers |
| SC-7 | Foundation packages для clean library platform доступны | Counts published clean libs (post-Sprint 3) | 14 (Wave 1) | 14 + 5 minimum (config, tenant, observe, queue, auth-moleculer) | 2026-Q3 | npm view audit |
| SC-8 | Существующая v0.1.0 testsuite остаётся зелёной после Sprint 1 + 2 | Test count | 3187 passed / 54 skipped (per CLAUDE.md baseline) | ≥ 3187 passed (allow new tests; no regressions) | каждый sprint | `pnpm test` |
| SC-9 | Workflow contracts neutral в `@gertsai/core` | Files: `packages/core/src/workflow/*.ts` define WorkflowDefinition / WorkflowRun / WorkflowSignal / WorkflowState / WorkflowStepResult | 0 | ≥5 type files | 2026-Q3 | `ls packages/core/src/workflow/` |

---

## Product Scope

### Sprint 1 — Hygiene (preрequisite, ~3 часа) — see SPEC-001

9 объективных fixes для unblock release v0.1.0.

### Sprint 2 — Decomposition Phase A (~1 неделя) — see ADR-003

Логическая декомпозиция api-core на subpath exports без breaking changes:
- `@gertsai/api-core/contracts` — pure types.
- `@gertsai/api-core/moleculer` — Moleculer runtime (включая `setWorkflows` first-class).
- `@gertsai/api-core/runtime/node` — opt-in Node side-effects.

Neutral platform contracts в `@gertsai/core`:
- WorkflowDefinition / WorkflowRun / WorkflowSignal / WorkflowState / WorkflowStepResult.
- EventEnvelope (typed).

api-rlr: peer-dep `@gertsai/api-core/contracts` вместо корня.

### Sprint 3 — Clean libs + m9s-example refactor + hex enforcement (~3-4 недели)

**Новые / extracted clean foundation packages** (5 минимум):

1. `@gertsai/config` — `loadConfig()` + project.config pattern (extract из gertsai_codex).
2. `@gertsai/tenant` — `getTenantIdStrict/Optional` + ctx.meta propagation.
3. `@gertsai/observe` — OTel tracing/metrics/logs setup (lazy, opt-in).
4. `@gertsai/queue` — standalone queue runner (extract из api-core integrated path).
5. `@gertsai/auth-moleculer` — Moleculer auth middleware (extract из api-core/moleculer/oauth.mixin.ts; теперь живёт в `@gertsai/api-core/moleculer/auth/` после ADR-003 — этот пункт может стать subpath, не отдельный package).

**m9s-example refactor** (acceptance test):
- Все imports из api-core — на subpaths.
- `composition/infrastructure.ts` использует чистые либы.
- Workflows используют `controller.setWorkflows()` вместо ручного `serviceCreated`.
- `PermissionDeniedError` shared (по SPEC-001 H-8).
- `application/`, `domain/`, `infrastructure/` строго следуют hex layer rules.

**Hex enforcement enable**:
- `dependency-cruiser` CI gate (per ADR-002).
- ESLint config через `@gertsai/eslint-config-hex`.
- Initially warning-only mode 2 недели → switch на fail-on-violation.

**Опционально** (если время):
- `@gertsai/database` — agnostic Postgres client (по образцу api-rlr `PgClient`). Может перейти в Sprint 3.5 если scope tight.
- `@gertsai/protocol-types` — generated TS types (если есть OpenAPI source). Может перейти в Wave-N.

### Out of Scope (Wave 2)

- ❌ **YAML composition framework** (gerts-module.yaml + module-loader) — переехал в Wave 3 (ADR-001 superseded).
- ❌ **Hub-specific adapters** (`git-client`, `artifact-client`, `rdf-client`) — Wave-Hub-Integration, когда Hub реально пишет P0 service.
- ❌ **Phase B — физическое выделение `@gertsai/api-moleculer`** в отдельный пакет — отложено до evidence что Phase A subpath exports недостаточны (≥3 external requests).
- ❌ **Полный extraction `@gertsai/api-types`** (64k LOC) — нет источника правды (Hub OpenAPI Spec-001 ещё draft).
- ❌ **Полный extraction `@gerts/database`** Prisma schema (29k LOC, gerts-tied) — наш `@gertsai/database` останется agnostic client.
- ❌ **Domain packages** (`@gertsai/agent`, `tools`, `flow`, `graph`, `scheduler`) — Wave 3+, после доказательства что foundation работает.
- ❌ **CLI tooling** (`gerts mod ...`) — нужен только для YAML framework (Wave 3).
- ❌ **Migration других consumers** (gertsai_codex apps/pipeline) — отдельный effort после Wave 2 stable.

### Growth Vision

- **Wave 3**: YAML composition framework + module-loader — когда есть ≥2 проекта повторяющих composition pattern руками.
- **Wave 4**: Domain layer packages (`agent`, `tools`, `flow`, `graph`, `scheduler`) — для AI pipeline DSL.
- **Wave-Hub-Integration**: `git-client`, `artifact-client`, `rdf-client` — когда GertsHub реально пишет код.
- **Cross-runtime**: `@gertsai/api-fastapi`, `@gertsai/api-go`, `@gertsai/api-rust` — реализации поверх neutral `@gertsai/core` contracts.
- **v1.0**: GA после ≥3 production deployments + 6 месяцев стабильности.

---

## User Journeys

### Journey 1 — OSS developer собирает свой Moleculer бэкенд на чистых либах

**Цель**: external developer хочет собрать «hello-world ingest+search» Moleculer service на `@gertsai/*` за ≤60 минут wall-clock.

| Шаг | Действие | Ответ системы | Заметки |
|-----|---------|---------------|---------|
| 1 | `pnpm add @gertsai/api-core @gertsai/core @gertsai/config @gertsai/tenant @gertsai/observe @gertsai/queue` | Установлены чистые foundation deps. Bundle audit: zero GCP/dotenv в production deps | Без Sprint 2 это было бы tag `@gertsai/api-core` потягающий 30+ MB |
| 2 | `import { APIError, ResponseCode } from '@gertsai/api-core/contracts'` в business logic | Type-check проходит; в bundle нет Moleculer | Subpath exports per ADR-003 |
| 3 | `import { ApiController } from '@gertsai/api-core/moleculer'` в `mol-services/api.service.ts` | Moleculer wiring работает | Lazy Moleculer subpath |
| 4 | `import { setupObservability } from '@gertsai/observe'` в moleculer config | OTel tracing + logs автоматически | Без копипасты ~30 LOC config |
| 5 | `import { loadConfig } from '@gertsai/config'` для typed env | Config loaded, no .env side-effects unless explicit | Нужно явно `loadDotenv()` если требуется |
| 6 | Запускает service, проверяет endpoint | Service работает, OTel экспортит, логи структурные | За ≤60 мин — vs ≥3 дней копипасты mixin'ов из gertsai_codex |

**Результат**: external developer получает working backend за час, без понимания всей gertsai_codex истории.

### Journey 2 — Reference reader изучает m9s-example

**Цель**: разработчик читает `examples/m9s-example/` чтобы понять структуру hexagonal AI pipeline на @gertsai/*.

| Шаг | Действие | Ответ системы | Заметки |
|-----|---------|---------------|---------|
| 1 | `git clone gertsai/shared && cd examples/m9s-example` | — | — |
| 2 | `cat package.json` | Видит **только** реально используемые deps (по SPEC-001 H-7 unused убраны) | Чистый dependency graph |
| 3 | `tree src/` | Видит hex layout: domain/, application/, infrastructure/, services/, mol-services/, lib/, composition/ | По ADR-002 layer rules clear |
| 4 | Открывает `application/SearchDocumentsUseCase.ts` | Импортирует `PermissionDeniedError` из `application/errors/` (по SPEC-001 H-8 — не из ingest!) | Чистый hexagonal |
| 5 | Открывает `mol-services/api.service.ts` | Видит import из `@gertsai/api-core/moleculer` (subpath, не root) | По ADR-003 subpath |
| 6 | `pnpm install && pnpm test` | All green; copy-paste structure в свой проект | Reference works as expected |

**Результат**: m9s-example служит **рабочим blueprint** для любого hexagonal Moleculer проекта, без misleading deps и без layer violations.

### Journey 3 — Maintainer фиксит bug в api-core/moleculer

**Цель**: maintainer находит bug в Moleculer queue handler, хочет починить **без affecting** api-core/contracts users.

| Шаг | Действие | Ответ системы | Заметки |
|-----|---------|---------------|---------|
| 1 | Edit `packages/api-core/src/moleculer/queue/...` | TypeScript compiler видит изменения только в moleculer subpath | Ясные границы благодаря ADR-003 |
| 2 | `pnpm test --filter @gertsai/api-core` | Фокусированные тесты по queue feature | 370+ tests scoped |
| 3 | `pnpm publint @gertsai/api-core` | Зелёный | Per ADR-003 invariants |
| 4 | Bump patch version (api-core@0.2.x) | Changeset entry: bug fix не затрагивает contracts surface | Subpath isolation позволяет minor cycles на части пакета |

**Результат**: bug fix scoped, downstream consumers `/contracts` не affected; downstream consumers `/moleculer` получают patch bump только если они используют moleculer subpath.

### Journey 4 — Wave 3 trigger («у нас уже 2 проекта повторяют composition pattern»)

**Цель**: после Wave 2 у нас m9s-example + ещё один OSS adopter оба пишут TS composition root руками. Это сигнал, что YAML framework нужен.

| Шаг | Действие | Ответ |
|-----|---------|-------|
| 1 | Maintainer reviews trigger evidence (2 projects with repetitive composition) | — |
| 2 | Reactivate ADR-001 (status proposed) | Wave 3 начинается |
| 3 | Создание RFC + Spec для `gerts-module.yaml` schema + module-loader runtime | По ADR-001 §Decision (preserved) |
| 4 | Implementation, m9s-example рефакторится **снова** под yaml | Sprint 3 era refactor — но composition уже clean (благодаря ADR-003 subpath imports), миграция дешевле |

**Результат**: YAML framework приходит **по evidence**, не по предположению.

---

## Functional Requirements

| ID | Category | Priority | Requirement | Journey |
|----|----------|----------|-------------|---------|
| FR-001 | Hygiene | Must | `@gertsai/api-core` package.json declares `private: false` and `license: "Apache-2.0"` | Journey 1 |
| FR-002 | Hygiene | Must | `@gertsai/api-core` root entry point does not execute `dotenv/config` or any side-effect on import | Journey 1, 3 |
| FR-003 | Hygiene | Must | `@gertsai/api-core` Google Cloud Logger initialised lazily via factory; no module-load network call to `169.254.169.254` | Journey 1, 3 |
| FR-004 | Hygiene | Must | `@gertsai/api-core` declares `@google-cloud/pubsub` in `peerDependencies` (optional); type `PubSub` in public surface resolves for consumers | Journey 1 |
| FR-005 | Hygiene | Must | `@gertsai/api-rlr` declares `ioredis`, `moleculer-web` in `peerDependencies`; runtime imports resolve | Journey 1 |
| FR-006 | Hygiene | Must | `examples/m9s-example/package.json` declares only deps actually imported in src | Journey 2 |
| FR-007 | Hygiene | Must | `examples/m9s-example` defines `PermissionDeniedError` in `src/application/errors/`; ingest/search use cases import from there | Journey 2 |
| FR-008 | Hygiene | Should | `CLAUDE.md` accurately documents 14 (not 13) packages including api-rlr | Journey 2, 3 |
| FR-009 | Decomposition | Must | `@gertsai/api-core/contracts` subpath exports pure types: APIError, ResponseCode, response envelope, OpenAPI helpers; zero runtime side-effects | Journey 1, 3 |
| FR-010 | Decomposition | Must | `@gertsai/api-core/moleculer` subpath exports ApiController, queue, channel, **workflow** wiring; lazy init, no module-load side-effects | Journey 1, 3 |
| FR-011 | Decomposition | Must | `@gertsai/api-core/runtime/node` subpath exports `loadConfig`, `createGcpLogger` factories; opt-in side-effects only on explicit call | Journey 1, 3 |
| FR-012 | Decomposition | Must | Root `@gertsai/api-core` entry remains backward-compatible reexports with JSDoc deprecation warnings; no new code uses root | Journey 1, 3 |
| FR-013 | Platform contracts | Must | `@gertsai/core` exports neutral workflow contracts: WorkflowDefinition, WorkflowRun, WorkflowSignal, WorkflowState, WorkflowStepResult | Journey 1, 3 |
| FR-014 | Platform contracts | Must | `@gertsai/core` exports typed EventEnvelope for channel events | Journey 1, 3 |
| FR-015 | Workflows-first-class | Should | `controller.setWorkflows(...)` API available in `@gertsai/api-core/moleculer`; handler signature typed via WorkflowDefinition contract | Journey 1, 3 |
| FR-016 | Clean libs | Must | `@gertsai/config` package provides `loadConfig({SCHEMA})` returning typed env-loaded config with defaults; no eager dotenv | Journey 1 |
| FR-017 | Clean libs | Must | `@gertsai/tenant` package provides `getTenantIdStrict(ctx)` / `getTenantIdOptional(ctx)` with type-narrowed return | Journey 1 |
| FR-018 | Clean libs | Must | `@gertsai/observe` package provides `setupObservability(brokerOptions)` for OTel tracing/metrics/logs; lazy peer dep on OTel SDK | Journey 1 |
| FR-019 | Clean libs | Should | `@gertsai/queue` package can run BullMQ workers as standalone process without full ApiController boot | Journey 1 |
| FR-020 | Clean libs | Should | `@gertsai/auth-moleculer` (or subpath under api-core/moleculer/auth) provides OAuth2/API-key Moleculer middleware | Journey 1 |
| FR-021 | m9s acceptance | Must | `examples/m9s-example` refactored: all imports from api-core use subpaths (contracts/moleculer/runtime/node); zero root imports in new code | Journey 2 |
| FR-022 | m9s acceptance | Must | `examples/m9s-example` workflow registration uses `controller.setWorkflows(...)` (not manual ServiceSchema in services/workflows/) | Journey 2 |
| FR-023 | m9s acceptance | Must | `examples/m9s-example` passes existing test suite (no regressions) после Sprint 1+2+3 | Journey 2, 3 |
| FR-024 | Hex enforcement | Must | CI pipeline runs `dependency-cruiser` job; fails on layer-rule violation | Journey 2, 3 |
| FR-025 | Hex enforcement | Should | `@gertsai/eslint-config-hex` provides ESLint flat-config with same rules as dep-cruiser | Journey 2, 3 |
| FR-026 | Library quality | Should | All published packages pass `pnpm publint` | Journey 1 |
| FR-027 | Library quality | Should | All packages have README + CHANGELOG + LICENSE Apache 2.0 + SPDX headers in source | Journey 1, 2 |

---

## Non-Functional Requirements

| ID | Category | Requirement | Metric | Condition | Measurement |
|----|----------|-------------|--------|-----------|-------------|
| NFR-001 | Library boundary | `@gertsai/api-core/contracts` import shall not pull Moleculer/BullMQ/dotenv/GCP into bundle | 0 transitive runtime deps on these libs | Isolated TypeScript project + `npm ls --all` audit | CI smoke test |
| NFR-002 | Library boundary | `@gertsai/api-core` root import shall not execute side-effects | 0 network calls, 0 fs reads on import | `node -e "require('@gertsai/api-core')"` with strace/dtrace | manual audit + CI smoke |
| NFR-003 | Bundle size | `@gertsai/api-core/contracts` minified+gzipped | ≤ 30 KB | Built via tsup | `pkg-size` CI check |
| NFR-004 | Boot performance | `@gertsai/api-core/moleculer` ApiController.start() | < 500 ms p50, < 1.5 s p95 | 6 services, in-memory adapters, M2 MacBook | Vitest benchmark `__bench__/boot.bench.ts` |
| NFR-005 | Compatibility — Node | All packages run on | Node 22 LTS minimum, Node 24 forward-compatible | CI matrix (22.x, 24.x) | GitHub Actions |
| NFR-006 | Compatibility — Moleculer | Moleculer-touching packages support | Moleculer 0.14.x latest minor | Existing major | Peer dep declared, integration tests |
| NFR-007 | Compatibility — backward | After Sprint 1+2 fixes, existing API surface remains stable | Zero breaking changes in api-core public types (`/contracts` reexports as root for compat) | Each package update | `@arethetypeswrong/cli` + manual API extractor diff |
| NFR-008 | Hex enforcement — CI time | `lint:depcruise` job duration | < 30 s | On full monorepo | GitHub Actions duration |
| NFR-009 | Documentation | Each package README sections | ≥5 of: Install, Quickstart, API, Examples, Compatibility, FAQ, License | Audit | `scripts/audit-readme-sections.sh` |
| NFR-010 | License | All packages Apache 2.0 with SPDX header in every `.ts` source file | 100% | Audit | `scripts/audit-spdx.sh` |
| NFR-011 | Reliability — channel publishes | DeferredChannelPublisher (preserved from gertsai_codex inheritance) shall persist channel events to Redis Streams | 100% delivery (zero loss) | Chaos test killing publisher between buffer-and-flush | Integration test |
| NFR-012 | Subpath compatibility | `tsc`, `tsup`, `vite`, `esbuild`, `webpack 5+` shall resolve subpath exports correctly | All major bundlers green | CI matrix smoke | Multi-bundler test workflow |

---

## Acceptance Criteria

### AC-1 — Sprint 1 hygiene complete (RELEASE BLOCKER)

```gherkin
Given Sprint 1 implementation per SPEC-001 is complete
When  CI runs `pnpm install && pnpm build && pnpm test && pnpm typecheck && pnpm publint`
Then  all 9 hygiene checklist items in SPEC-001 pass green
And   `pnpm changeset publish --dry-run` succeeds for all 14 packages (no `private: true` block)
```

### AC-2 — Decomposition Phase A boundary works

```gherkin
Given Sprint 2 implementation per ADR-003 Phase A is complete
When  a TypeScript project outside the monorepo runs `pnpm add @gertsai/api-core`
And   imports `import { APIError } from '@gertsai/api-core/contracts'`
Then  `npm ls --all` shows zero transitive deps on `moleculer`, `bullmq`, `dotenv`, `@google-cloud/logging`
And   `node -e "require('@gertsai/api-core/contracts')"` produces no console output, no warnings, no network calls
```

### AC-3 — m9s-example acceptance test (Sprint 3 deliverable)

```gherkin
Given Sprint 3 m9s-example refactor is complete
When  developer runs `pnpm --filter m9s-example test`
Then  all existing tests pass (≥ 191 — current baseline; allow more for new test cases)
And   grep `from '@gertsai/api-core'` (not `/contracts` or `/moleculer`) in `src/**/*.ts` returns 0 hits
And   grep `from '../../infrastructure/'` in `src/services/**` returns 0 hits (composition root only)
And   workflows registered via `controller.setWorkflows(...)` (not manual ServiceSchema)
And   `pnpm --filter m9s-example dev` boots and serves `POST /api/v1/ingest` + `POST /api/v1/search` correctly
```

### AC-4 — Hex enforcement gate works

```gherkin
Given dependency-cruiser CI gate enabled (per ADR-002)
When  a PR introduces `import { MemoryDocumentStore } from '../../infrastructure/memory-document.store'` in `services/ingest/lifecycle.ts`
Then  CI `lint:depcruise` job fails with exit code 1
And   PR cannot merge due to required check failure
```

### AC-5 — OSS developer onboarding ≤60 minutes

```gherkin
Given external developer with Node 22, pnpm 10, zero prior @gertsai knowledge
When  developer follows `examples/hello-clean/README.md` step-by-step (TBD as part of Sprint 3)
Then  developer has working Moleculer service with REST endpoint within 60 minutes wall-clock
And   service uses subpath imports (contracts + moleculer)
And   service boots without GCP/dotenv warnings
```

### AC-6 — Backward compat for v0.1.0 → v0.2.0 root reexports

```gherkin
Given existing v0.1.0 consumer code uses `import { APIError } from '@gertsai/api-core'` (root)
When  consumer upgrades to api-core v0.2.x
Then  TypeScript still compiles (root reexports work)
And   JSDoc deprecation warning visible in IDE for root imports
And   no runtime behaviour change
```

### AC-7 — Workflow contracts neutral

```gherkin
Given Sprint 2 introduces neutral workflow contracts in `@gertsai/core`
When  developer imports `import type { WorkflowDefinition } from '@gertsai/core'`
Then  type does not depend on Moleculer or any runtime adapter
And   `controller.setWorkflows(...)` in `@gertsai/api-core/moleculer` accepts WorkflowDefinition-typed entries
```

---

## Dependencies

| Dependency | Type | Status | Owner |
|-----------|------|--------|-------|
| GertsHub `.forgeplan/RFC-004` (Moleculer Customization Patterns) | Architectural | Draft (informs) | explosivebit |
| GertsHub `.forgeplan/ADR-005`, `ADR-006`, `ADR-009`, `ADR-011` | Architectural | Draft (informs Wave 1 baseline) | explosivebit |
| `docs/dd.md` (audit 2026-05-05) | Internal doc | Done (informs Sprint 1+2) | explosivebit |
| `@gertsai/*` Wave 1 v0.1.0 (built locally) | Code | Ready locally, NOT pushed/published | explosivebit |
| `@moleculer/channels` v0.2+ | External | Available | Moleculer team |
| `@moleculer/workflows` (work-in-progress) | External | Available, marked WIP | Moleculer team |
| `dependency-cruiser` ≥17 | External | Available | Sverre Wisløff |
| OpenTelemetry JS SDK 1.x | External | Available | OTel community |
| Source: `gertsai_codex/apps/pipeline/src/{mixins,utils/project-config,moleculer.config.ts}` | Source repo | Read-only access | maintainer = explosivebit |

---

## Risks & Mitigations

| ID | Risk | Probability | Impact | Mitigation | Owner |
|----|------|-------------|--------|------------|-------|
| R-1 | typia transformer не работает корректно с subpath exports → ADR-003 Phase A падает на build | Medium | High | Sprint 2 starts с smoke test на тестовом branch (1-2 часа); если fail — pivot к Phase B sooner или document workaround | explosivebit |
| R-2 | Sprint 1 `dotenv/config` removal ломает скрытые dependencies в test setup | Low | Medium | Audit `apps/pipeline/src/**/*.ts` consumer; explicit `import 'dotenv/config'` в test bootstrap если нужно | explosivebit |
| R-3 | `@moleculer/workflows` instability ломает workflows-first-class API | Medium | Medium | API контракт фиксируется в neutral `@gertsai/core/workflow`; Moleculer realisation помечается experimental в первой версии | explosivebit |
| R-4 | Subpath exports не поддерживаются старыми бандлерами (webpack 4) | Low | Low | NFR-012 — multi-bundler CI matrix; webpack 4 — out of support, mention в README | explosivebit |
| R-5 | Sprint 3 scope creep (5 packages + m9s refactor + hex enforcement = много) | High | Medium | Strict scope: только packages в Sprint 3 list; `database` + `protocol-types` отложены если время tight | explosivebit |
| R-6 | Hex enforcement ловит false positives → blocked PRs | Medium | Medium | 2-week warning-only mode перед switching на fail-on-violation (ADR-002 plan) | explosivebit |
| R-7 | Backward-compat reexports не используются (никто не мигрирует на subpaths) → root остаётся forever | Medium | Low | ESLint `no-restricted-imports` rule force'ит subpath в новом коде; deprecation timeline ≥3 minor releases с warnings | explosivebit |
| R-8 | OSS adopter сообщает баг в clean lib раньше чем v1 stable | High | Low | v0.x policy explicit: breaking changes в minor; clear migration guide per minor; GitHub issues channel | explosivebit |
| R-9 | License re-issue (extracted code) требует contributor consent | Low | Critical | Per ADR-011 GertsHub model: verify sole-author via `git log` before changing; для shared sole-author = explosivebit (confirmed) | explosivebit |
| R-10 | Phase B (физический split api-moleculer) откладывается надолго → subpaths становятся вечным compromise | Medium | Low | Trigger в ADR-003: ≥3 external requests на отдельный пакет → открывать Phase B ADR | explosivebit |

---

## Timeline

| Milestone | Target Date | Description |
|-----------|-------------|-------------|
| PRD-001 reframed | 2026-05-05 | This document validated |
| ADR-003 (Platform Runtime Boundaries) approved | 2026-05-08 | Decomposition decision fixed |
| SPEC-001 (Sprint 1 hygiene) approved | 2026-05-08 | Checklist locked |
| Sprint 1 implementation | 2026-05-09 | ~3 часов; 9 items; PR + changeset; release v0.1.0 (first publish) |
| Sprint 2 — typia smoke test | 2026-05-12 | 1-2 часа validation Phase A subpath exports |
| Sprint 2 implementation (decomposition Phase A) | 2026-05-12 → 2026-05-19 | ~1 неделя; api-core decomp + neutral workflow contracts; release v0.2.0 |
| Sprint 3 — clean libs extraction | 2026-05-19 → 2026-06-05 | config, tenant, observe, queue, auth-moleculer (5 packages) |
| Sprint 3 — m9s refactor | 2026-06-05 → 2026-06-15 | acceptance test; hex enforcement enable |
| Sprint 3 — release v0.3.0 | 2026-06-19 | All Wave 2 packages published |
| Wave 2 GA evaluation | 2026-09-30 | 3 месяца стабильности evidence |
| v1.0 milestone evaluation | 2026-12-31 | GA decision based on adoption + bug rate |

---

## Stakeholders

| Role | Name | Sign-off |
|------|------|----------|
| Product Owner | explosivebit (mirik.kubal@gmail.com) | [ ] |
| Engineering Lead | explosivebit | [ ] |
| Architecture Reviewer | explosivebit | [ ] |
| OSS Maintainer | explosivebit | [ ] |
| QA / Testing | explosivebit | [ ] |

---

## Affected Files

- `packages/api-core/**` (Sprint 1 hygiene + Sprint 2 decomposition)
- `packages/api-rlr/**` (Sprint 1 peer deps + Sprint 2 subpath consumer)
- `packages/core/**` (Sprint 2 — neutral workflow contracts)
- `packages/config/**` (Sprint 3 — new)
- `packages/tenant/**` (Sprint 3 — new)
- `packages/observe/**` (Sprint 3 — new)
- `packages/queue/**` (Sprint 3 — new)
- `packages/auth-moleculer/**` (Sprint 3 — new или subpath под api-core/moleculer/auth)
- `packages/eslint-config-hex/**` (Sprint 3 — new, для ADR-002)
- `packages/depcruise-config-hex/**` (Sprint 3 — new, для ADR-002)
- `examples/m9s-example/**` (Sprint 1 hygiene + Sprint 3 refactor)
- `examples/hello-clean/**` (Sprint 3 — new, OSS onboarding reference)
- `.github/workflows/ci.yml` (lint:depcruise + publint + multi-bundler test)
- `.changeset/sprint-{1,2,3}-*.md` (per sprint)
- `CLAUDE.md` (Sprint 1 H-9 + Wave 2 cross-link updates)
- `README.md` (Wave 2 quickstart section)
- `.forgeplan/**` (this workspace; ongoing artifacts)

---

## Related Artifacts

| Artifact | Relation | Status |
|----------|----------|--------|
| ADR-001 (Module composition framework — YAML-driven) | based_on (deferred to Wave 3) | superseded |
| ADR-002 (Hex layer enforcement — dep-cruiser + ESLint) | based_on | draft |
| **ADR-003 (Platform Runtime Boundaries — decomposition api-core)** | **based_on (CENTRAL)** | draft |
| **SPEC-001 (Sprint 1 hygiene checklist)** | **based_on (PREREQUISITE)** | draft |
| GertsHub PRD-001 (`~/Work/GertsHub/.forgeplan/prds/PRD-001-gerts-hub.md`) | informs (Hub — future consumer, not driver after reframe) | active |
| GertsHub RFC-004 (Moleculer Customization Patterns) | informs | draft |
| GertsHub ADR-005 (Shared Packages Strategy) | informs | draft |
| GertsHub ADR-009/ADR-011 (Wave 1 baseline 14 packages) | informs | draft |
| docs/dd.md (audit 2026-05-05) | informs (источник Sprint 1 + Sprint 2 motivation) | done |
| KNOWN-ISSUES.md | informs (некоторые items уже документированы) | active |

---

> **Next step**: review + activate ADR-003 + SPEC-001; затем Sprint 1 implementation (~3 часа); затем Sprint 2 typia smoke + decomposition Phase A.











