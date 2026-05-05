---
depth: standard
id: ADR-003
kind: adr
last_modified_at: 2026-05-05T07:24:29.619510+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-001
  relation: based_on
status: draft
title: Platform Runtime Boundaries — decompose api-core into contracts plus moleculer plus runtime-node subpaths
---

---
id: ADR-003
title: "Platform Runtime Boundaries — decompose api-core into contracts + moleculer + runtime-node subpaths"
status: proposed
depth: deep
valid_until: 2027-05-05
prd_ref: PRD-001
created: 2026-05-05
updated: 2026-05-05
---

# ADR-003: Platform Runtime Boundaries — decompose api-core

## Context

Аудит `@gertsai/api-core` v0.1.0 (см. `docs/dd.md` 2026-05-05) выявил, что пакет ведёт себя как **приложение**, а не как **библиотека**:

- `src/index.ts:4` — `import 'dotenv/config'` на module-load (side-effect для любого consumer на старте процесса).
- `src/moleculer/moleculerConfig.template.ts:13` — Google Cloud Logger создаётся eager на module-load, делает запрос к `169.254.169.254` (GCP metadata) → MetadataLookupWarning.
- `src/lib/controller/types.ts:3` — экспорт типа `PubSub` из `@google-cloud/pubsub`, который сидит только в devDependencies (broken peer dep).
- `package.json:13` — `private: true` + `MIT`, при том что репо Apache 2.0 public OSS.
- В одном пакете смешаны: pure API contracts (APIError, ResponseCode, envelope), Moleculer runtime (ApiController, BullMQ queues, channels, gateway templates), Node-specific runtime (env loading, GCP logger, .env interpolation), OpenAPI helpers, OAuth.

**Последствия**:

- Любой consumer (downstream package, OSS adopter, Hub в будущем) получает в bundle всю api-core, включая Moleculer + BullMQ + GCP SDK + dotenv. Несовместимо с библиотечной моделью.
- `@gertsai/api-rlr` (Tier 5) уже жёстко сцеплен с api-core через `APIError`/`ResponseCode` — для standalone rate limiter лишняя связность; должен иметь чистый contracts subpath.
- Невозможно поддерживать language-agnostic AI platform: contract types живут вместе с Node runtime, не extract'имы для FastAPI/Go/Rust клиента.

PRD-001 (после reframe 2026-05-05) фиксирует library-first философию: «делаем чистые либы, на которых можно собрать любой проект». ADR-003 фиксирует **архитектурную границу** — как именно api-core разделить.

User decision (2026-05-05, после ознакомления с docs/dd.md): «нам сейчас важно api-core и другие либы чтобы сперва были разделены и типизация сделана хорошо».

## Decision

**Selected**: **Phase A — логическая декомпозиция api-core через subpath exports без breaking changes.**

В `@gertsai/api-core@0.2.0` добавляются три зоны и три subpath exports, корневой export сохраняет backward compatibility (с deprecated reexports + JSDoc warnings).

### Зоны

```
packages/api-core/src/
├── contracts/                ← pure types, zero runtime deps
│   ├── error/                  APIError, ResponseCode, ErrorCode
│   ├── envelope/               OrchestraApiResponse, response wrappers
│   ├── apiResponse/            success/error builders (pure functions)
│   ├── openapi/                OpenAPI 3.x types + merge helpers (pure)
│   └── index.ts
├── moleculer/                ← Moleculer-specific runtime
│   ├── controller/             ApiController, ApiControllerConfigOptions (без PubSub в типе)
│   ├── service/                createApiService, createOpenApiService
│   ├── config/                 createMoleculerConfig (factory), broker template
│   ├── queue/                  BullMQ wiring, queue-controller helpers
│   ├── channel/                setChannels, channel handler helpers
│   ├── workflow/               setWorkflows, workflow registration (NEW first-class)
│   ├── auth/                   OAuth/auth mixin
│   ├── gateway/                moleculer-web gateway templates
│   └── index.ts
├── runtime/node/             ← Node.js-specific side-effects (opt-in)
│   ├── config/                 loadConfig + dotenv loader (explicit init only)
│   ├── logger/                 GCP Cloud Logger (lazy, factory-based)
│   ├── env/                    typed env interpolation
│   └── index.ts
└── index.ts                  ← legacy root: deprecated reexports c JSDoc warnings
```

### Subpath exports (package.json)

```json
{
  "exports": {
    ".": "./dist/index.js",                        // legacy compat
    "./contracts": "./dist/contracts/index.js",
    "./moleculer": "./dist/moleculer/index.js",
    "./runtime/node": "./dist/runtime/node/index.js"
  }
}
```

### Side-effect rules (invariants)

- `@gertsai/api-core/contracts` — **zero side effects**, zero peer deps на Moleculer/BullMQ/dotenv/GCP. Только TypeScript types + pure functions.
- `@gertsai/api-core/moleculer` — peer deps на `moleculer`, `bullmq`, `@moleculer/channels`, `@moleculer/workflows`. Lazy-init runtime; нет module-load side effects.
- `@gertsai/api-core/runtime/node` — peer deps на `dotenv`, `@google-cloud/logging`. **Только** explicit `loadConfig()` или `createGcpLogger()` вызовы; `import` сам по себе нейтрален.
- Корневой `@gertsai/api-core` — **без `dotenv/config` import**; экспорты переадресованы на subpaths с JSDoc deprecated warnings.

### Workflows как first-class в moleculer subpath

Новый submodule `moleculer/workflow/` фиксирует workflows как 4-ю равноправную поверхность runtime (наряду с actions / queues / channels):

- `controller.setWorkflows({...})` API — analog `setChannels`.
- Workflow handler signature типизирован через **нейтральный contract** (`WorkflowDefinition`/`WorkflowRun`/`WorkflowSignal`/`WorkflowState`/`WorkflowStepResult`), который живёт в `@gertsai/core` (см. ниже §Neutral platform contracts).
- Implementation использует `@moleculer/workflows`; контракт остаётся реализацией-агностичным.

### Neutral platform contracts (@gertsai/core extension)

В `@gertsai/core` добавляется (или подтверждается) набор language-neutral types:

- `Session`, `Tenant`, `Trace`, `Envelope`, `ErrorModel` (большинство уже есть)
- `WorkflowDefinition`, `WorkflowRun`, `WorkflowSignal`, `WorkflowState`, `WorkflowStepResult` (NEW)
- `EventEnvelope` для channel events (NEW typed shape)
- `Pipeline` / `Chunk` / `Embed` / `Search` / `Document` contracts (consolidate существующие — уже доказаны в m9s-example)

Эти типы — **single source of truth** для всех runtime adapters (Moleculer сейчас, FastAPI/Go/Rust позже).

**Why Selected (Phase A, не Phase B сразу)**:

1. **Zero breaking** для уже-build'ed v0.1.0 — не ломает ни одного теста, ни одного API.
2. **Reverse-friendly** — если subpath exports создадут проблемы (напр., с typia transformer), revert один файл `package.json`.
3. **Postpone naming bikeshed** — новый пакет `@gertsai/api-moleculer` или `@gertsai/runtime-moleculer` — это Phase B, требует ADR amendment + npm publication. Phase A не блокируется этим решением.
4. **Smoke-test foundation** — m9s-example (Sprint 3) рефакторится на subpath imports, проверяет что границы работают на реальном коде.
5. **Phase B готова всегда** — после Phase A физический split = `pnpm move` файлов из `api-core/src/moleculer/` в `packages/api-moleculer/src/`, package.json deps fix, и subpath users мигрируют через single rename.

## Alternatives Considered

| Option | Verdict | Why |
|--------|---------|-----|
| **Phase A only (this ADR)** | **Chosen** | Zero breaking; reverse-friendly; smoke-tests boundaries on m9s-example before commitment к extraction |
| Phase A + B вместе (выделить @gertsai/api-moleculer сразу) | Rejected | Premature: API surface новых subpaths ещё не tested на real consumer; bikeshed naming; +1 publish unit; consumer migration cost ×2 |
| Не разделять, оставить api-core как есть, только hygiene fix | Rejected | Закрепляет «api-core = всё»; через 6 мес — major-breaking decomposition; downstream packages всё равно тащат Moleculer/BullMQ/GCP |
| Полный rewrite api-core с нуля | Rejected | 14 packages уже building; rewrite ломает gertsai_codex consumer migration path; не оправдано evidence |
| Per-feature flags (env-controlled exports) | Rejected | Не решает проблему — runtime side-effects всё равно проявляются при `import` |

### ADI Reasoning

**Hypotheses**:
- H1: Phase A subpath exports изолируют zones без breaking — достаточно для library-first foundation.
- H2: Phase B (физическое выделение) нужно сразу, иначе субpaths останутся косметикой.
- H3: api-core нужно оставить монолитом, рефактор переоценен.

**Evidence check**:
- H1 supported: pattern проверен в Vite (`vite/client`, `vite/dynamic-import-polyfill`), OpenTelemetry (`@opentelemetry/api/experimental`), TypeORM. Production-tested. **Confirmed**.
- H2 partially supported: subpath exports могут «утечь» через unwise imports (например, `import { ApiController } from '@gertsai/api-core'` — root reexport остаётся compat). Mitigation — ESLint rule `no-restricted-imports` для root path в новом коде; deprecated JSDoc warning при использовании root reexports. **Soft-supported, не требует Phase B сейчас**.
- H3 refuted: docs/dd.md показывает 4 объективных бага именно в смешении зон (dotenv eager, GCP eager, broken peer dep, license mismatch); все они являются прямым следствием отсутствия границ. **Refuted**.

**Conclusion**: H1 supported. Phase A — sufficient minimum.

## Trade-off Analysis

| Критерий | Phase A only | Phase A+B вместе | Не разделять | Full rewrite |
|----------|----------|------|-----|------|
| Breaking changes | 0 | 1 (новый пакет) | 0 | много |
| Implementation cost | 1 неделя | 2-3 недели | 0 | 6+ недель |
| Reversibility | high (single file) | medium (rename + dep update) | n/a | low |
| Test surface | существующие тесты pass | + новый пакет boot тесты | 0 | rewrite all |
| Boundary enforcement | ESLint rule + JSDoc | physical npm boundary | 0 | maximum |
| Future-proof для Wave 3 yaml loader | ready (subpath docs) | ready | NOT ready | ready |
| Risk | low | medium | high (debt) | very high |
| **Total fit для Wave 2** | **★★★★★** | ★★★ | ★ | ★ |

## Consequences

### Positive

- **Library-first достижим**: contracts subpath = zero runtime, можно использовать в Browser / FastAPI clients / Rust через ts-types.
- **Hygiene баги фиксируются автоматически**: dotenv side-effect и GCP eager init убираются из root export.
- **Wave 2 unblock**: новые foundation пакеты (`@gertsai/observe`, `tenant`, `database`, etc.) сразу импортят `@gertsai/api-core/contracts` — не тащат Moleculer.
- **m9s-example quality**: services/lib/composition импортят правильный subpath; transparent для разработчика.
- **api-rlr cleanup**: следующий минор api-rlr может peer-dep'ить `@gertsai/api-core/contracts` вместо целого `@gertsai/api-core`.

### Negative (trade-offs)

- **Чуть больше mental load**: разработчик должен понимать что `/contracts` vs `/moleculer` vs `/runtime/node`.
- **Subpath exports требуют bundler awareness**: tsup, vite, esbuild — все понимают; но edge-case бандлеры (старые webpack) могут потребовать config.
- **Корневой root export сохраняется как compat** — сам по себе антипаттерн; нужен deprecation timeline (≥3 minor releases с warnings, потом убираем в major).
- **typia compatibility**: Phase A нужно smoke-test'ить — typia transformer может задавать сложности с subpath. Если что — ESLint автoматических fix не будет, придётся явно прописывать.

### Risks

- **R-1**: typia transformer не поддерживает корректно subpath imports → smoke test перед commitment. Mitigation: создать temporary branch, попробовать imports из api-core/contracts в одном файле, прогнать build.
- **R-2**: deprecated reexports не используются (никто не мигрирует) → через 6 месяцев убирать сложно. Mitigation: ESLint rule `no-restricted-imports` который при появлении в новом коде force'ит subpath; CI lint step.
- **R-3**: Phase B (физический split) откладывается надолго → subpaths становятся вечным «временным решением». Mitigation: trigger в этом ADR — если ≥3 external consumers просят `@gertsai/api-moleculer` отдельно от `@gertsai/api-core/contracts`, — открывать Phase B ADR.
- **R-4**: workflows-first-class API (`controller.setWorkflows`) требует stable `@moleculer/workflows` — он помечен work-in-progress (per dd.md). Mitigation: API контракт фиксируется в этом ADR, реализация может deferred — registerWorkflow возвращает stub в первой версии, документируем как experimental.

## Invariants

- **I-1**: `@gertsai/api-core/contracts` имеет zero runtime side effects на module load. Любой `import { X } from '@gertsai/api-core/contracts'` НЕ запускает dotenv, не создаёт логгер, не connect'ится к сервисам. CI lint check.
- **I-2**: `@gertsai/api-core/contracts` имеет zero peer deps кроме TypeScript stdlib. Можно использовать в browser context.
- **I-3**: `@gertsai/api-core/moleculer` peer deps: `moleculer`, `bullmq`, `@moleculer/channels`, `@moleculer/workflows`. Все factory-based (lazy init).
- **I-4**: `@gertsai/api-core/runtime/node` peer deps: `dotenv`, `@google-cloud/logging`. **Только** explicit calls запускают side-effects; `import` нейтрален.
- **I-5**: Корневой `@gertsai/api-core` НЕ содержит `import 'dotenv/config'` или подобных side-effect imports. Reexports — pure type/value forwards.
- **I-6**: `ApiControllerConfigOptions` НЕ экспортирует тип из `@google-cloud/pubsub` в публичной surface. Если PubSub support нужен — отдельный subpath `@gertsai/api-core/moleculer/pubsub-extension` (или вынести в отдельный пакет позже).
- **I-7**: Workflow contracts (`WorkflowDefinition` etc.) живут в `@gertsai/core`, **не** в `@gertsai/api-core/moleculer`. Moleculer — одна реализация нейтрального контракта.
- **I-8**: Phase B (физический split на `@gertsai/api-moleculer`) НЕ происходит без отдельного ADR-amendment.
- **I-9**: Любой новый код в этом репо использует subpath imports (`@gertsai/api-core/contracts`, etc.), не root. ESLint rule `no-restricted-imports` enforce.

## Evidence Requirements

- **E-1**: После Phase A — `import { APIError, ResponseCode } from '@gertsai/api-core/contracts'` работает в isolated TypeScript project (не моно-репо), без подтаскивания Moleculer/BullMQ/dotenv в node_modules audit.
- **E-2**: m9s-example refactored на subpath imports; existing tests (370+) pass без изменений.
- **E-3**: typia smoke test — `pnpm --filter @gertsai/api-core build` зелёный после декомпозиции.
- **E-4**: `node -e "require('@gertsai/api-core/contracts')"` НЕ выводит MetadataLookupWarning или dotenv side-effect logs.
- **E-5**: `controller.setWorkflows({...})` API доступен в `@gertsai/api-core/moleculer`, имеет typed handler signature через WorkflowDefinition контракт.
- **E-6**: package.json `exports` field валиден через `pnpm publint`.

## Valid Until

`2027-05-05` (1 год).

**Refresh Triggers**:
- ≥3 external OSS consumers просят `@gertsai/api-moleculer` как отдельный пакет → открывать Phase B ADR.
- typia или ts-patch breaking change ломает subpath exports — переоценить decomposition shape.
- Появляется `@gertsai/api-fastapi` или `@gertsai/api-go` как cross-runtime adapter → подтверждение что нейтральный contracts слой работает.

## Pre-conditions

- [x] PRD-001 reframed на library-first
- [x] ADR-001 superseded → Wave 3
- [x] User decision: «api-core разделить, типизация сделать хорошо» (2026-05-05)
- [x] docs/dd.md аудит изучен (Group 16+17 в hindsight)
- [ ] SPEC-001 hygiene checklist утверждён (Sprint 1 предшествует Sprint 2 decomp)

## Post-conditions

- [ ] api-core/src/ переразложен по zones (contracts, moleculer, runtime/node) — Sprint 2 deliverable
- [ ] package.json exports field прописан с тремя subpaths
- [ ] Workflow contracts добавлены в `@gertsai/core` — neutral types
- [ ] m9s-example рефакторен на subpath imports — Sprint 3 deliverable
- [ ] api-rlr v0.2.x использует `@gertsai/api-core/contracts` (не root)
- [ ] ESLint `no-restricted-imports` для root api-core path в новом коде
- [ ] CI lint check `pnpm publint` для всех публикуемых пакетов

## Admissibility

- **NOT**: добавлять `import 'dotenv/config'` или другие side-effect imports в `contracts/` или `moleculer/` (нарушает I-1, I-3).
- **NOT**: экспортировать types из cloud SDK напрямую в публичный API (нарушает I-6).
- **NOT**: делать workflow реализацию-specific contracts в `@gertsai/core` (нарушает I-7).
- **NOT**: физически выделять `@gertsai/api-moleculer` в отдельный пакет в Wave 2 (нарушает I-8 — это Phase B, отдельный ADR).
- **NOT**: пропустить smoke test typia compatibility (R-1) — обязательный pre-merge check.

## Rollback Plan

**Triggers**:
- typia transformer breaking changes incompatible с subpath exports.
- ≥2 production builds (m9s-example + любой другой consumer) падают после Phase A.
- Performance regression > 20% в boot time из-за изменения import resolution.

**Steps**:
1. Revert package.json `exports` field в один JSON (root only).
2. Сохранить файлы в `contracts/`, `moleculer/`, `runtime/node/` — они работают через root reexports.
3. Document lessons learned в EVID + amendment ADR-003.
4. Если решение — pivot к Phase B (физический split) сразу: открыть новый ADR-004.

**Blast Radius**: малый — `package.json` rollback атомарен; код в zones остаётся, импортируется через root. Consumers не affected (root компат).

## Affected Files

- `.forgeplan/adrs/ADR-003-*` (этот)
- `packages/api-core/src/index.ts` (refactor: убрать dotenv import; deprecated reexports)
- `packages/api-core/src/contracts/**` (new structure)
- `packages/api-core/src/moleculer/**` (existing files reorganized)
- `packages/api-core/src/runtime/node/**` (new — extracted from root)
- `packages/api-core/package.json` (`exports` field, license fix, private fix)
- `packages/api-core/src/lib/controller/types.ts` (PubSub type extraction)
- `packages/api-core/src/moleculer/moleculerConfig.template.ts` (lazy GCP logger)
- `packages/api-core/src/moleculer/workflow/index.ts` (NEW — setWorkflows API)
- `packages/core/src/workflow/**` (NEW — neutral contracts)
- `packages/core/src/index.ts` (export workflow contracts)
- `packages/api-rlr/src/utils/validations.ts` (subpath: `@gertsai/api-core/contracts`)
- `packages/api-rlr/src/errors/RateLimitError.ts` (subpath: `@gertsai/api-core/contracts`)
- `examples/m9s-example/src/**` (Sprint 3 — refactor на subpaths)
- `.eslintrc.cjs` (root) — `no-restricted-imports` для legacy root api-core path
- `.github/workflows/ci.yml` (publint check)

## AI Guidance

- **При написании нового кода**: всегда импортить из subpath (`@gertsai/api-core/contracts` или `/moleculer`), никогда из корня.
- **При расширении moleculer/**: проверять что зависимости — только Moleculer/BullMQ/channels; никаких dotenv/GCP в этом subpath.
- **При расширении contracts/**: проверять zero peer deps; pure types или pure functions.
- **При расширении runtime/node/**: явный factory pattern (`createXxx()`), никаких top-level side effects.
- **При работе с workflow API**: используй `@gertsai/core` neutral contracts; api-core/moleculer — только wiring.
- **Если возникает соблазн добавить ещё один runtime в api-core** (e.g., `runtime/deno` или `runtime/edge`) — это Phase B trigger, открывай ADR amendment.

## Implementation Plan

### Phase 0: Decision (this ADR)

- [x] **0.1** ADR-003 (this) — fixate Phase A decision
- [ ] **0.2** Smoke test — typia + subpath exports на тестовом branch (1-2 часа)
- [ ] **0.3** Если smoke fail — pivot rollback или extend ADR с typia workarounds

### Phase 1: Sprint 1 (hygiene) — preрequisite

- См. SPEC-001 (Sprint 1 hygiene checklist) — устраняются 9 hygiene items до Phase A start.

### Phase 2: Sprint 2 (decomposition Phase A)

- [ ] **2.1** `packages/api-core/src/contracts/` — move pure types (errors, envelope, response, openapi)
- [ ] **2.2** `packages/api-core/src/moleculer/` — reorganize existing controller/service/config/queue/channel/oauth
- [ ] **2.3** `packages/api-core/src/moleculer/workflow/` — NEW setWorkflows API (initially stub'ы реализации)
- [ ] **2.4** `packages/api-core/src/runtime/node/` — extract loadConfig + lazy GCP logger
- [ ] **2.5** `packages/core/src/workflow/` — NEW neutral contracts (WorkflowDefinition etc.)
- [ ] **2.6** `packages/api-core/package.json` exports field
- [ ] **2.7** Root `index.ts` — deprecated reexports с JSDoc warnings
- [ ] **2.8** ESLint `no-restricted-imports` rule
- [ ] **2.9** `pnpm publint` CI check

### Phase 3: Sprint 3 (consumer migration)

- [ ] **3.1** m9s-example refactor: imports на subpaths
- [ ] **3.2** api-rlr v0.2.0: peer dep на `@gertsai/api-core/contracts`
- [ ] **3.3** Existing tests pass green (370+ api-core, 191 api-rlr, m9s-example tests)

### Phase 4: Stabilization + Wave-2 follow-ups

- [ ] **4.1** EVID-001 запись: smoke results + bundle size diff (contracts subpath)
- [ ] **4.2** changeset entry: minor bump v0.2.0 для api-core, api-rlr, core, m9s-example
- [ ] **4.3** Documentation: README per package обновлён под subpath usage

## Related Artifacts

| Artifact | Type | Relation |
|---|---|---|
| PRD-001 | PRD | based_on |
| ADR-001 (Module composition framework) | ADR | informs (deferred Wave 3 — этот ADR-003 теперь центр) |
| ADR-002 (Hex layer enforcement) | ADR | informs (hex остаётся; subpath imports compatible с hex layer rules) |
| SPEC-001 (Sprint 1 hygiene checklist) | Spec | based_on (Sprint 1 предшествует Sprint 2) |
| GertsHub RFC-004 (Moleculer Customization Patterns) | RFC (external) | informs |
| GertsHub ADR-005 (Shared Packages Strategy) | ADR (external) | informs |
| docs/dd.md (audit 2026-05-05) | external doc | informs (источник findings) |

> **Next step**: SPEC-001 (Sprint 1 hygiene) — preрequisite для Phase A start. Smoke test typia + subpath перед merge.



