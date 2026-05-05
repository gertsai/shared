---
depth: standard
id: ADR-003
kind: adr
last_modified_at: 2026-05-05T08:53:27.534621+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-001
  relation: based_on
status: active
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
amendments: ["2026-05-05-smoke-discovery"]
---

# ADR-003: Platform Runtime Boundaries — decompose api-core

## ⚠️ Amendment 2026-05-05 — smoke discovery + tsconfig migration scope expansion

Phase 0 smoke test (EVID-002, branch `sprint-2/smoke-typia-subpath`) показал:

**Главный finding (R-1 reframed)**: typia transformer **полностью совместим** с subpath exports — не риск. Реальный gate — **`moduleResolution`**: текущий `tsconfig.base.json` использует `node` (Node10), который **в принципе не читает `package.json` exports field** (TS-known limitation, документировано в TS docs).

**Дополнительный finding (R-5)**: `packages/api-rlr/tsconfig.json` имел stale `paths` mapping на `../api-core/dist/index.d.ts` (фактический путь — `../api-core/dist/src/index.d.ts`). Не палилось из-за pnpm symlinks через root `main`. Возможно аналогичный mess в других 13 пакетах.

**User decision** (per Q1/Q2/Q3 development session 2026-05-05):
- **Q1 → B**: bump `tsconfig.base.json` → `moduleResolution: Bundler` (читает exports, не enforce ESM/CJS strictness, минимальный risk regression на существующем коде).
- **Q2 → Yes**: stale `paths` cleanup включается в Sprint 2 scope (одно дерево с decomposition).
- **Q3 → Delete**: smoke branch удаляется после Sprint 2 done (evidence сохраняется в EVID-002 + git reflog).

### Дополнительные invariants (amendment)

- **I-10**: `tsconfig.base.json` использует `moduleResolution: Bundler`. Per-package overrides допустимы только для legacy edge cases с явным comment.
- **I-11**: stale `paths` mappings в `packages/<x>/tsconfig.json` (указывающие на конкретные `dist/...` пути конкретных пакетов) **запрещены** — pnpm workspace + symlinks + exports field резолвят без manual paths.
- **I-12**: При создании barrel reexports (`src/contracts/index.ts` reexport из `../lib/error`, и т.д.) — ОК для backward compat в первой итерации Phase A. Physical move файлов в правильные subpaths (без reexport) — Phase A2 (вторая итерация) или сразу же если scope позволяет.

### Дополнительные evidence requirements

- **E-7**: smoke branch `sprint-2/smoke-typia-subpath` сохраняется до Sprint 2 done как ground-truth для tsconfig migration; затем удаляется.
- **E-8**: после Sprint 2 — `grep -rn 'paths' packages/*/tsconfig.json` показывает 0 stale references на конкретные `dist/*` пути.

### Дополнительные risks (amendment)

- **R-5 (mitigated)**: `moduleResolution: Bundler` теоретически менее строгий чем `Node16` для ESM/CJS interop. Mitigation: documented в этом amendment; future migration на `Node16` — отдельный ADR (Wave 3+) когда экосистема готова.
- **R-6**: stale `paths` cleanup в 13 пакетах может выявить hidden imports, которые сейчас работают только через эти overrides. Mitigation: каждый пакет проверяется build + test после tsconfig edit.

### Корректировка Implementation Plan §Phase 2

Добавлены steps:
- **2.0** (NEW, prerequisite): bump `tsconfig.base.json` → `moduleResolution: Bundler`; verify все 14 пакетов build green.
- **2.10** (NEW): grep + cleanup stale `paths` mappings во всех `packages/*/tsconfig.json`; verify build green per package.

Полный обновлённый Implementation Plan живёт в **SPEC-002** (Sprint 2 Phase A checklist).

---

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

**Дополнено amendment**: `tsconfig.base.json` мигрируется на `moduleResolution: Bundler` как prerequisite для subpath exports работы; stale `paths` mappings во всех 14 пакетах cleanup'ятся в одном sprint.

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
    ".": "./dist/src/index.js",
    "./contracts": "./dist/src/contracts/index.js",
    "./moleculer": "./dist/src/moleculer/index.js",
    "./runtime/node": "./dist/src/runtime/node/index.js"
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

В `@gertsai/core` добавляется набор language-neutral types:

- `Session`, `Tenant`, `Trace`, `Envelope`, `ErrorModel` (большинство уже есть)
- `WorkflowDefinition`, `WorkflowRun`, `WorkflowSignal`, `WorkflowState`, `WorkflowStepResult` (NEW)
- `EventEnvelope` для channel events (NEW typed shape)
- `Pipeline` / `Chunk` / `Embed` / `Search` / `Document` contracts (consolidate существующие — уже доказаны в m9s-example)

Эти типы — **single source of truth** для всех runtime adapters (Moleculer сейчас, FastAPI/Go/Rust позже).

### tsconfig.base.json migration (added per amendment)

```jsonc
{
  "compilerOptions": {
    // BEFORE:
    // "module": "CommonJS",
    // "moduleResolution": "node",

    // AFTER:
    "module": "Preserve",          // или ESNext, см. SPEC-002 для exact value
    "moduleResolution": "Bundler"  // читает package.json exports
  }
}
```

Per-package overrides:
- `m9s-example/tsconfig.json` — уже на Bundler после smoke (см. EVID-002).
- Остальные 13 пакетов — наследуют root.
- Если пакет требует strict ESM/CJS interop (специфический case) — explicit override на `Node16` с comment.

**Why Selected (Phase A, не Phase B сразу)**:

1. **Zero breaking** для уже-build'ed v0.1.0 — не ломает ни одного теста, ни одного API.
2. **Reverse-friendly** — если subpath exports создадут проблемы, revert один файл `package.json` + один `tsconfig.base.json`.
3. **Postpone naming bikeshed** — новый пакет `@gertsai/api-moleculer` или `@gertsai/runtime-moleculer` — это Phase B, требует ADR amendment + npm publication.
4. **Smoke-test confirmed** — typia transformer compatible (EVID-002).
5. **Phase B готова всегда** — после Phase A физический split = `pnpm move` файлов из `api-core/src/moleculer/` в `packages/api-moleculer/src/`.

## Alternatives Considered

| Option | Verdict | Why |
|--------|---------|-----|
| **Phase A only (this ADR)** | **Chosen** | Zero breaking; reverse-friendly; smoke confirmed |
| Phase A + B вместе (выделить @gertsai/api-moleculer сразу) | Rejected | Premature: API surface ещё не tested на real consumer; bikeshed naming |
| Не разделять, только hygiene fix | Rejected | Закрепляет «api-core = всё» |
| Полный rewrite api-core с нуля | Rejected | Overkill, ломает gertsai_codex consumer migration |
| Per-feature flags (env-controlled exports) | Rejected | Не решает runtime side-effects на import |

### ADI Reasoning

**Hypotheses**:
- H1: Phase A subpath exports изолируют zones без breaking — достаточно для library-first foundation.
- H2: Phase B (физическое выделение) нужно сразу.
- H3: api-core нужно оставить монолитом.

**Evidence check**:
- H1 supported: pattern проверен в Vite, OpenTelemetry, TypeORM. **Smoke test confirmed** typia compat (EVID-002).
- H2 partially supported: subpath exports могут «утечь». Mitigation — ESLint rule + JSDoc deprecation. **Soft-supported, не требует Phase B сейчас**.
- H3 refuted: docs/dd.md показывает 4 объективных бага именно в смешении зон. **Refuted**.

**Conclusion**: H1 supported. Phase A — sufficient minimum.

## Trade-off Analysis

| Критерий | Phase A only | Phase A+B вместе | Не разделять | Full rewrite |
|----------|----------|------|-----|------|
| Breaking changes | 0 | 1 (новый пакет) | 0 | много |
| Implementation cost | 1 неделя | 2-3 недели | 0 | 6+ недель |
| Reversibility | high | medium | n/a | low |
| Risk | low (smoke confirmed) | medium | high (debt) | very high |
| **Total fit для Wave 2** | **★★★★★** | ★★★ | ★ | ★ |

## Consequences

### Positive

- **Library-first достижим**: contracts subpath = zero runtime, можно использовать в Browser / FastAPI / Rust.
- **Hygiene баги** (Sprint 1) фиксированы; subpath enforcement не даёт им вернуться.
- **Wave 2 unblock**: новые foundation пакеты сразу импортят `@gertsai/api-core/contracts`.
- **m9s-example quality**: services/lib/composition импортят правильный subpath.
- **api-rlr cleanup**: peer-dep'ит `@gertsai/api-core/contracts` вместо целого root.
- **moduleResolution Bundler** modernizes whole repo TS resolution — единый pattern.

### Negative (trade-offs)

- **Чуть больше mental load**: разработчик должен знать `/contracts` vs `/moleculer` vs `/runtime/node`.
- **Subpath exports требуют bundler awareness**: tsup, vite, esbuild — все понимают.
- **Корневой root export сохраняется как compat** — нужен deprecation timeline.
- **Bundler не enforce'ит strict ESM/CJS interop** — приемлемая trade-off для не-сломать m9s-example.

### Risks (revised post-amendment)

- **R-1 (REFUTED by smoke)**: typia compat. EVID-002 показал GREEN.
- **R-2**: deprecated reexports не используются. Mitigation: ESLint rule.
- **R-3**: Phase B откладывается надолго. Mitigation: explicit trigger в этом ADR.
- **R-4**: workflows-first-class API требует stable `@moleculer/workflows`. Mitigation: stub реализация в первой версии, документируем как experimental.
- **R-5 (mitigated)**: Bundler менее строгий чем Node16. Future migration — отдельный ADR.
- **R-6**: stale `paths` cleanup может выявить hidden imports. Mitigation: build + test per package.

## Invariants

- **I-1**: `@gertsai/api-core/contracts` имеет zero runtime side effects на module load.
- **I-2**: `@gertsai/api-core/contracts` имеет zero peer deps кроме TypeScript stdlib.
- **I-3**: `@gertsai/api-core/moleculer` peer deps factory-based (lazy init).
- **I-4**: `@gertsai/api-core/runtime/node` — только explicit calls запускают side-effects.
- **I-5**: Корневой `@gertsai/api-core` НЕ содержит side-effect imports.
- **I-6**: `ApiControllerConfigOptions` НЕ экспортирует cloud SDK types.
- **I-7**: Workflow contracts живут в `@gertsai/core`, не в moleculer.
- **I-8**: Phase B (физический split) — отдельный ADR-amendment.
- **I-9**: Любой новый код использует subpath imports. ESLint enforce.
- **I-10** (amendment): `tsconfig.base.json` → `moduleResolution: Bundler`.
- **I-11** (amendment): no stale `paths` mappings в `packages/*/tsconfig.json`.
- **I-12** (amendment): barrel reexports OK для backward compat в первой итерации Phase A.

## Evidence Requirements

- **E-1**: subpath import не подтаскивает Moleculer/BullMQ/dotenv/GCP в bundle audit.
- **E-2**: m9s-example tests pass с subpath imports.
- **E-3**: typia smoke test зелёный — **CONFIRMED EVID-002 (2026-05-05)**.
- **E-4**: `node -e "require('@gertsai/api-core/contracts')"` без warnings.
- **E-5**: `controller.setWorkflows({...})` API доступен.
- **E-6**: `pnpm publint` зелёный для api-core с exports field.
- **E-7** (amendment): smoke branch сохраняется до Sprint 2 done как evidence.
- **E-8** (amendment): `grep -rn 'paths' packages/*/tsconfig.json` → 0 stale references.

## Valid Until

`2027-05-05` (1 год).

**Refresh Triggers**:
- ≥3 external OSS consumers просят `@gertsai/api-moleculer` отдельно → Phase B ADR.
- typia или ts-patch breaking change.
- Появляется cross-runtime adapter → подтверждение нейтральности contracts.
- Migration на `Node16`/`NodeNext` strict mode потребуется → отдельный ADR.

## Pre-conditions

- [x] PRD-001 reframed на library-first
- [x] ADR-001 superseded → Wave 3
- [x] User decision per Q1/Q2/Q3 (2026-05-05)
- [x] docs/dd.md аудит изучен
- [x] SPEC-001 hygiene checklist activated
- [x] Sprint 1 implementation completed (commit 1f8494e)
- [x] **Phase 0 smoke test GREEN (EVID-002, branch sprint-2/smoke-typia-subpath)**
- [ ] SPEC-002 Sprint 2 Phase A checklist activated

## Post-conditions

- [ ] `tsconfig.base.json` migrated на Bundler
- [ ] api-core/src/ переразложен по zones
- [ ] package.json exports field прописан с тремя subpaths
- [ ] Workflow contracts добавлены в `@gertsai/core`
- [ ] m9s-example рефакторен на subpath imports
- [ ] api-rlr v0.2.x использует `@gertsai/api-core/contracts`
- [ ] ESLint `no-restricted-imports` для root api-core path
- [ ] Stale `paths` cleanup в всех 14 tsconfig
- [ ] CI lint check `pnpm publint` для всех публикуемых пакетов

## Admissibility

- **NOT**: добавлять side-effect imports в `contracts/` или `moleculer/`.
- **NOT**: экспортировать cloud SDK types в публичный API.
- **NOT**: workflow реализация-specific contracts в `@gertsai/core`.
- **NOT**: физический split на `@gertsai/api-moleculer` в Wave 2.
- **NOT**: оставлять stale `paths` mappings (нарушает I-11).
- **NOT**: пропустить tsconfig migration (нарушает I-10, prerequisite для exports работы).

## Rollback Plan

**Triggers**:
- Bundler resolution breaks ≥2 production builds.
- typia transformer breaking changes.
- Performance regression > 20%.

**Steps**:
1. Revert `tsconfig.base.json` → `moduleResolution: node`.
2. Revert `package.json exports` field в один JSON.
3. Сохранить файлы в `contracts/`, `moleculer/`, `runtime/node/` — работают через root reexports.
4. Document в EVID + amendment.

**Blast Radius**: малый — два файла rollback атомарны.

## Affected Files

- `.forgeplan/adrs/ADR-003-*` (этот)
- `tsconfig.base.json` (root, moduleResolution migration)
- `packages/*/tsconfig.json` (cleanup stale paths)
- `packages/api-core/src/index.ts` (deprecated reexports)
- `packages/api-core/src/contracts/**` (new structure)
- `packages/api-core/src/moleculer/**` (existing files reorganized)
- `packages/api-core/src/runtime/node/**` (new — extracted from root)
- `packages/api-core/package.json` (exports field)
- `packages/api-core/src/lib/controller/types.ts` (PubSub type extraction)
- `packages/api-core/src/moleculer/workflow/index.ts` (NEW setWorkflows)
- `packages/core/src/workflow/**` (NEW neutral contracts)
- `packages/core/src/index.ts` (export workflow contracts)
- `packages/api-rlr/src/utils/validations.ts` (subpath import)
- `packages/api-rlr/src/errors/RateLimitError.ts` (subpath import)
- `examples/m9s-example/src/**` (subpath imports)
- `.eslintrc.cjs` (no-restricted-imports rule)
- `.github/workflows/ci.yml` (publint check)

## AI Guidance

- **При написании нового кода**: всегда импортить из subpath, никогда из корня.
- **При расширении moleculer/**: только Moleculer/BullMQ/channels deps; никаких dotenv/GCP.
- **При расширении contracts/**: zero peer deps; pure types или pure functions.
- **При расширении runtime/node/**: явный factory pattern; никаких top-level side effects.
- **При работе с workflow API**: нейтральные contracts из `@gertsai/core`; api-core/moleculer — только wiring.
- **Если возникает соблазн добавить runtime/edge или runtime/deno** — Phase B trigger, ADR amendment.
- **Если tsconfig падает** — проверить что `moduleResolution: Bundler`; не добавлять stale `paths`.

## Implementation Plan

### Phase 0: Decision + smoke (DONE)

- [x] **0.1** ADR-003 fixate Phase A decision
- [x] **0.2** Smoke test typia + subpath на branch — **GREEN** (EVID-002)
- [x] **0.3** Amendment ADR-003 — tsconfig migration scope expansion

### Phase 1: Sprint 1 (hygiene) — preрequisite (DONE)

- [x] SPEC-001 hygiene checklist applied (commit 1f8494e); EVID-001 R_eff=1.00.

### Phase 2: Sprint 2 (decomposition Phase A) — see SPEC-002 для full checklist

- [ ] **2.0** (PREREQUISITE) `tsconfig.base.json` → `moduleResolution: Bundler`; verify все 14 пакетов build green
- [ ] **2.1** `packages/api-core/src/contracts/` — barrel reexports из существующих lib/error, lib/apiResponse, etc.
- [ ] **2.2** `packages/api-core/src/moleculer/` — barrel reexports из существующих controller/service/config/queue/channel
- [ ] **2.3** `packages/api-core/src/moleculer/workflow/` — NEW setWorkflows API (stub реализация)
- [ ] **2.4** `packages/api-core/src/runtime/node/` — barrel reexports + extract loadConfig/createGcpLogger в этот subpath
- [ ] **2.5** `packages/core/src/workflow/` — NEW neutral contracts (WorkflowDefinition etc.)
- [ ] **2.6** `packages/api-core/package.json` exports field с тремя subpaths
- [ ] **2.7** Root `index.ts` — deprecated reexports с JSDoc warnings
- [ ] **2.8** ESLint `no-restricted-imports` rule для root api-core path
- [ ] **2.9** `pnpm publint` CI check
- [ ] **2.10** Stale `paths` cleanup во всех 14 `packages/*/tsconfig.json`
- [ ] **2.11** Consumer migration: api-rlr + m9s-example на subpath imports
- [ ] **2.12** Verify: full build/test/typecheck/publint
- [ ] **2.13** EVID-003 — Sprint 2 results
- [ ] **2.14** Activate ADR-003

### Phase 3: Wave 2 follow-ups

- [ ] **3.1** Documentation: README per package под subpath usage
- [ ] **3.2** changeset entry: minor bump v0.2.0 для api-core, api-rlr, core, m9s-example
- [ ] **3.3** Delete smoke branch `sprint-2/smoke-typia-subpath`

## Related Artifacts

| Artifact | Type | Relation |
|---|---|---|
| PRD-001 | PRD | based_on |
| ADR-001 (Module composition framework) | ADR | informs (deferred Wave 3) |
| ADR-002 (Hex layer enforcement) | ADR | informs |
| SPEC-001 (Sprint 1 hygiene checklist) | Spec | based_on (Sprint 1 предшествует Sprint 2) |
| SPEC-002 (Sprint 2 Phase A checklist) | Spec | refines (full implementation checklist) |
| EVID-001 (Sprint 1 fixes applied) | Evidence | informs |
| EVID-002 (smoke typia + subpath) | Evidence | informs (R-1 refuted, R-5/R-6 documented) |
| GertsHub RFC-004 (Moleculer Customization Patterns) | RFC (external) | informs |
| docs/dd.md (audit 2026-05-05) | external doc | informs |

> **Next step**: SPEC-002 (Sprint 2 Phase A checklist) approved → Sprint 2 implementation team.







