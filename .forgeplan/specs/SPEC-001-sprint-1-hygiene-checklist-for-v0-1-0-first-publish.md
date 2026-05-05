---
depth: standard
id: SPEC-001
kind: spec
last_modified_at: 2026-05-05T07:33:02.989368+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-001
  relation: based_on
- target: ADR-003
  relation: informs
status: active
title: Sprint 1 — Hygiene checklist for v0.1.0 first publish
---

---
id: SPEC-001
title: "Sprint 1 — Hygiene checklist for v0.1.0 first publish"
status: draft
author: explosivebit
created: 2026-05-05
updated: 2026-05-05
prd_ref: PRD-001
type: hygiene-checklist
depth: standard
---

# SPEC-001: Sprint 1 — Hygiene checklist for v0.1.0 first publish

## Summary

Чек-лист 9 объективных hygiene items, **обязательных** к выполнению до первого `npm publish` Wave 1 (`@gertsai/*` v0.1.0). Каждый item — concrete fix с file path, текущим состоянием и acceptance criterion.

Источник: аудит `docs/dd.md` (2026-05-05). Все items проверяемы через grep / npm publint / dependency audit — нет subjective judgment.

**Sprint 1 — preрequisite для Sprint 2 (decomposition api-core, ADR-003) и любого будущего code work**.

## Scope

**In-scope** (9 items):

1. `@gertsai/api-core` — license/private metadata fix (release-blocker).
2. `@gertsai/api-core` — убрать `import 'dotenv/config'` side-effect из root export.
3. `@gertsai/api-core` — lazy GCP Cloud Logger init (убрать MetadataLookupWarning к 169.254.169.254).
4. `@gertsai/api-core` — broken peer dep: `PubSub` тип публичный, `@google-cloud/pubsub` в devDependencies.
5. `@gertsai/api-rlr` — `ioredis` runtime import, но в devDependencies.
6. `@gertsai/api-rlr` — `moleculer-web` runtime import, но в devDependencies.
7. `examples/m9s-example` — unused deps `@gertsai/collection`, `@gertsai/utils` в package.json.
8. `examples/m9s-example` — `PermissionDeniedError` shared между ingest и search use cases (горизонтальная связность).
9. `CLAUDE.md` — устаревший package count (13 вместо 14).

**Out-of-scope** (откладывается на Sprint 2 / Wave 2):

- ❌ Decomposition api-core на subpath exports — это ADR-003, отдельный sprint.
- ❌ Расширение api-rlr с decoupling от api-core — следствие ADR-003, не Sprint 1.
- ❌ Workflows-first-class API (`controller.setWorkflows`) — ADR-003 Phase 2.
- ❌ Любая новая функциональность.

## Data Models

Sprint 1 модифицирует только конфигурационные / метаданные структуры — **не код**, не публичные API. Целевые data models:

### `package.json` shape

**`packages/api-core/package.json`** (H-1, H-4):
```jsonc
{
  "private": false,                 // было true
  "license": "Apache-2.0",          // было MIT
  "peerDependencies": {
    "@google-cloud/pubsub": "^4.0.0"
  },
  "peerDependenciesMeta": {
    "@google-cloud/pubsub": { "optional": true }
  }
}
```

**`packages/api-rlr/package.json`** (H-5, H-6):
```jsonc
{
  "peerDependencies": {
    "ioredis": "^5.0.0",
    "moleculer-web": "^0.10.0"
  }
}
```

**`examples/m9s-example/package.json`** (H-7):
```jsonc
{
  "dependencies": {
    // удалить:
    // "@gertsai/collection": "workspace:*",
    // "@gertsai/utils": "workspace:*"
  }
}
```

### Source code shape

**`packages/api-core/src/index.ts`** (H-2): НЕ содержит `import 'dotenv/config'` или подобных side-effect imports. Только pure reexports.

**`packages/api-core/src/moleculer/moleculerConfig.template.ts`** (H-3):
```typescript
// BEFORE (top-level eager init):
const cloudLogger = new GoogleCloudLogger({...});

// AFTER (factory):
export function createGcpLogger(opts: GcpLoggerOptions): Logger {
  return new GoogleCloudLogger(opts);
}
```

### Filesystem shape

**m9s-example** (H-8) — добавляется новый файл:
```
examples/m9s-example/src/application/
├── errors/
│   └── permission-denied.error.ts   ← NEW
├── IngestDocumentUseCase.ts          ← imports from ./errors/, не определяет
└── SearchDocumentsUseCase.ts         ← imports from ./errors/
```

### Documentation shape

**`CLAUDE.md`** (H-9): все вхождения `13 пакет(ов|а|s)` / `13-package` / `4 tier(s)` → `14` / `5`. api-rlr добавлен в любые package-таблицы как Tier 5.

**Этот SPEC не вводит новых API endpoints, не меняет существующие contracts** — это конфигурационная гигиена. Все contract-changes откладываются на ADR-003 Sprint 2.

## Acceptance Checklist

### H-1 — api-core packaging metadata fix (RELEASE BLOCKER)

**Current state**:
```jsonc
// packages/api-core/package.json (lines 13-14, approximate)
"private": true,
"license": "MIT"
```

**Issue**:
- `private: true` блокирует `npm publish` для public scope `@gertsai`.
- `MIT` license расходится с repo Apache 2.0 (root `LICENSE` + Apache headers в `.ts`).

**Fix**:
```jsonc
"private": false,
"license": "Apache-2.0"
```

**Acceptance**:
- [ ] `pnpm --filter @gertsai/api-core publint` зелёный.
- [ ] `cat packages/api-core/package.json | jq '.private,.license'` → `false`, `"Apache-2.0"`.
- [ ] `cat packages/api-core/LICENSE` совпадает с root LICENSE (или symlink на root).
- [ ] grep SPDX в всех `.ts` файлах api-core — все `Apache-2.0`, нет `MIT`.

**Effort**: 5 минут. **Risk**: zero (никаких code changes).

---

### H-2 — api-core убрать `import 'dotenv/config'` side-effect

**Current state**: `packages/api-core/src/index.ts:4` (approx) — `import 'dotenv/config';` на module-load.

**Issue**: любой consumer `import { APIError } from '@gertsai/api-core'` получает скрытое чтение `.env` файла. Антипаттерн для library.

**Fix**:
- Удалить `import 'dotenv/config'` из `src/index.ts`.
- Если dotenv нужен — переместить в **explicit** API в `src/runtime/node/config.ts` (Sprint 2 ADR-003 Phase A это делает «по-крупному»; в Sprint 1 — просто удалить из root, dotenv функциональность остаётся через `loadConfig()` если она уже есть).
- Если у consumers есть зависимость на этот side-effect — добавить в README migration note: «Wave 1 v0.1.0: вызывайте `import 'dotenv/config'` сами в entry point вашего приложения».

**Acceptance**:
- [ ] `grep -r "dotenv/config" packages/api-core/src/` → 0 results (или только в `src/runtime/node/`).
- [ ] `node -e "require('@gertsai/api-core'); console.log(process.env.SOME_TEST_VAR)"` → undefined (.env НЕ был прочитан).
- [ ] Existing tests pass (тесты, которые полагались на dotenv — должны явно загружать его сами).

**Effort**: 15-30 минут. **Risk**: low — может потребовать update в нескольких тестах.

---

### H-3 — api-core lazy GCP Cloud Logger init

**Current state**: `packages/api-core/src/moleculer/moleculerConfig.template.ts:13` (approx) — `new GoogleCloudLogger()` или эквивалент создаётся на module-load.

**Issue**: при импорте api-core (даже в local dev, без GCP credentials) — eager попытка достучаться до GCP metadata endpoint `169.254.169.254` → MetadataLookupWarning в логах. Bad UX для local dev и non-GCP deployments.

**Fix**:
- Заменить top-level instantiation на factory function `createGcpLogger(options)`.
- Logger создаётся **только** при явном вызове в moleculer broker config.
- Default fallback — local console logger.

**Acceptance**:
- [ ] `grep -r "new GoogleCloudLogger\|new CloudLogging" packages/api-core/src/moleculer/` → инстанциации только внутри factory function, не на top-level module.
- [ ] `node -e "require('@gertsai/api-core/moleculer/config')"` НЕ выводит MetadataLookupWarning (с timeout 5 сек).
- [ ] Existing tests pass; если есть тест на logger, он использует factory с mock config.
- [ ] Documentation update: README или `docs/gcp-logger-setup.md` описывает, как явно инициализировать GCP logger.

**Effort**: 30-60 минут. **Risk**: low-medium — нужно проверить что Moleculer broker всё ещё может использовать factory.

---

### H-4 — api-core broken peer dep: PubSub тип в devDependencies

**Current state**:
- `packages/api-core/src/lib/controller/types.ts:3` (approx) — `import type { PubSub } from '@google-cloud/pubsub';`
- `packages/api-core/package.json:50` (approx) — `@google-cloud/pubsub` только в `devDependencies`.

**Issue**: TypeScript consumer пакета получает unresolvable type reference (`Cannot find module '@google-cloud/pubsub'`). Нарушает type contract публичного API.

**Fix (3 варианта, выбираем простейший)**:
- **Option A (минимум усилий)**: переместить `@google-cloud/pubsub` в `peerDependencies` + `peerDependenciesMeta.optional: true`. Consumer install'ит сам, если использует PubSub features.
- **Option B**: вынести `PubSub`-specific типы в отдельный subpath `@gertsai/api-core/moleculer/pubsub-extension` (требует подготовки к ADR-003 Phase A — может, делать сразу там).
- **Option C**: убрать `PubSub` из публичного API, заменить на generic interface `IMessagePublisher`.

**Recommended**: **Option A** для Sprint 1 (минимум boundary changes). Option B/C — в ADR-003 Phase A.

**Acceptance**:
- [ ] `cat packages/api-core/package.json | jq '.peerDependencies."@google-cloud/pubsub"'` → version range present.
- [ ] `cat packages/api-core/package.json | jq '.peerDependenciesMeta."@google-cloud/pubsub".optional'` → `true`.
- [ ] `cat packages/api-core/package.json | jq '.devDependencies."@google-cloud/pubsub"'` → version (для local development — оставляем).
- [ ] `pnpm publint` для api-core — зелёный.
- [ ] `tsc --noEmit` в isolated test project с `@gertsai/api-core` (без `@google-cloud/pubsub` installed) — падает с понятным сообщением, или type становится `unknown`/`never`.

**Effort**: 15 минут. **Risk**: low.

---

### H-5 — api-rlr `ioredis` runtime import в devDependencies

**Current state**:
- `packages/api-rlr/src/client/rlr.ts:5` — `import Redis from 'ioredis';`
- `packages/api-rlr/package.json:52` (approx) — `ioredis` в `devDependencies`.

**Issue**: runtime импорт без proper dependency declaration → consumer получает unresolved module на runtime.

**Fix**: переместить `ioredis` из `devDependencies` в `peerDependencies` + дублировать в `devDependencies` для локальной разработки.

**Acceptance**:
- [ ] `cat packages/api-rlr/package.json | jq '.peerDependencies.ioredis'` → version range.
- [ ] `cat packages/api-rlr/package.json | jq '.devDependencies.ioredis'` → version.
- [ ] `pnpm publint` для api-rlr — зелёный.
- [ ] Existing api-rlr tests pass (ioredis резолвится через workspace).

**Effort**: 5 минут. **Risk**: zero.

---

### H-6 — api-rlr `moleculer-web` runtime import в devDependencies

**Current state**: аналогично H-5 — `moleculer-web` импортируется runtime'ом, лежит только в devDependencies.

**Fix**: переместить `moleculer-web` из `devDependencies` в `peerDependencies` + сохранить в `devDependencies`.

**Acceptance**:
- [ ] `cat packages/api-rlr/package.json | jq '.peerDependencies."moleculer-web"'` → version range.
- [ ] `cat packages/api-rlr/package.json | jq '.devDependencies."moleculer-web"'` → version.
- [ ] `pnpm publint` для api-rlr — зелёный.
- [ ] Existing api-rlr tests pass.

**Effort**: 5 минут. **Risk**: zero.

---

### H-7 — m9s-example unused deps `@gertsai/collection`, `@gertsai/utils`

**Current state**: `examples/m9s-example/package.json:24` (approx) — declares `@gertsai/collection` + `@gertsai/utils`, но `grep` показывает 0 imports в `examples/m9s-example/src/**/*.ts`.

**Issue**: misleading dependency graph для reference implementation. New developer видит deps и думает «эти пакеты обязательны для аналогичного проекта», что неверно.

**Fix (2 варианта)**:
- **Option A (cleanup)**: удалить из `package.json` → `pnpm install` пересобирает без этих deps.
- **Option B (justify)**: оставить с явным комментом в `package.json` или `README` объясняющим, **зачем** они в demo (если действительно демо planned use case).

**Recommended**: **Option A** (cleanup) — если в demo нет реального использования, не показываем misleading dep.

**Acceptance**:
- [ ] `cat examples/m9s-example/package.json | jq '.dependencies."@gertsai/collection",.dependencies."@gertsai/utils"'` → null (оба удалены).
- [ ] `pnpm install` from root — зелёный, no warnings.
- [ ] `grep -r "@gertsai/collection\|@gertsai/utils" examples/m9s-example/src/` → 0 results.
- [ ] `pnpm --filter m9s-example test` — pass.

**Effort**: 5 минут. **Risk**: zero.

---

### H-8 — m9s-example shared `PermissionDeniedError`

**Current state**:
- `examples/m9s-example/src/application/IngestDocumentUseCase.ts` определяет `PermissionDeniedError`.
- `examples/m9s-example/src/application/SearchDocumentsUseCase.ts:5` импортирует его из ingest.
- `examples/m9s-example/src/services/search/src/actions/search-query.action.ts:19` тоже импортирует из ingest.

**Issue**: горизонтальная связь между use cases (`SearchDocumentsUseCase → IngestDocumentUseCase`) нарушает hexagonal/clean слой application. По принципу DDD: errors, общие для bounded context, должны жить в `application/errors/` или `domain/errors/`, а не в одном из use cases.

**Fix**:
- Создать `examples/m9s-example/src/application/errors/permission-denied.error.ts` с типом + factory.
- Update imports в `IngestDocumentUseCase.ts`, `SearchDocumentsUseCase.ts`, `services/search/src/actions/search-query.action.ts` — все смотрят в `application/errors/`.
- Удалить определение из ingest use case.

**Acceptance**:
- [ ] Файл `examples/m9s-example/src/application/errors/permission-denied.error.ts` существует.
- [ ] `grep -rn "class PermissionDeniedError\|export.*PermissionDeniedError" examples/m9s-example/src/` → определение **только** в `application/errors/permission-denied.error.ts`.
- [ ] `grep -rn "import.*PermissionDeniedError" examples/m9s-example/src/` → все импорты из `application/errors/permission-denied.error`.
- [ ] `pnpm --filter m9s-example typecheck` — pass.
- [ ] `pnpm --filter m9s-example test` — pass.

**Effort**: 15-30 минут. **Risk**: low.

---

### H-9 — CLAUDE.md package count update

**Current state**: `CLAUDE.md` упоминает «13 пакетов» в разных местах, фактически 14 (api-rlr добавлен per ADR-011).

**Issue**: документация рассинхронизирована с реальностью. New AI agent / new contributor получит wrong context.

**Fix**:
- `grep -n "13 пакет\|13 packages\|13-package" CLAUDE.md` → найти все вхождения.
- Заменить на «14 пакетов» / «14 packages» / «14-package».
- Обновить упоминания tier (5 tiers вместо 4).
- Если есть таблица packages — проверить что api-rlr в ней.

**Acceptance**:
- [ ] `grep -n "13 пакет\|13 packages\|13-package" CLAUDE.md` → 0 results.
- [ ] api-rlr упомянут как Tier 5 в любых package таблицах.
- [ ] Cross-link на ADR-011 присутствует.

**Effort**: 10 минут. **Risk**: zero.

---

## Sprint 1 acceptance bundle

Sprint 1 считается **завершённым**, когда:

1. ✅ Все 9 acceptance check-boxes выше отмечены.
2. ✅ `pnpm install` от root — зелёный, zero warnings.
3. ✅ `pnpm build` (все 14 пакетов) — зелёный.
4. ✅ `pnpm test` — все existing тесты pass (ожидание ~3187 passed, ~54 skipped per CLAUDE.md baseline).
5. ✅ `pnpm typecheck` — зелёный.
6. ✅ `pnpm publint` для каждого published package — зелёный.
7. ✅ Один commit-набор / один PR (для атомарности revert).
8. ✅ Changeset entry: `chore: sprint 1 hygiene fixes`, patch bumps для api-core, api-rlr, m9s-example.

После Sprint 1 — `npm publish` НЕ выполняется автоматически. User триггерит `pnpm changeset publish` отдельно (per `gertsai/shared` CLAUDE.md red lines).

## Errors / risks (low — это hygiene, не feature work)

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R-1 | H-3 (lazy GCP logger) ломает existing tests, которые полагались на eager init | Low | Medium | Audit grep по тестам; mock factory если нужно |
| R-2 | H-2 (dotenv removal) ломает workflow где env'ы ожидались на module-load | Low | Medium | Check `apps/pipeline/src/**/*.ts` (consumer side) — dotenv-config должен быть явный там, не в lib |
| R-3 | H-4 (peer dep) — consumer не установит `@google-cloud/pubsub` и получит missing module на runtime | Medium | Low | Маркировать `optional: true` в `peerDependenciesMeta`; documentation note |
| R-4 | Sprint 1 затянется (>3 дней) если возникнут scope creep | Low | Low | Strict scope: только 9 items в этом SPEC; всё остальное — separate ADR/SPEC |

## Implementation Plan

Sprint 1 — single PR / single commit batch.

| Step | Item | Owner | Estimate |
|------|------|-------|----------|
| 1 | H-1 + H-9 (metadata + docs) | explosivebit | 15 min |
| 2 | H-2 + H-3 (api-core side-effects) | explosivebit | 60 min |
| 3 | H-4 (peer deps api-core) | explosivebit | 15 min |
| 4 | H-5 + H-6 (api-rlr peer deps) | explosivebit | 10 min |
| 5 | H-7 (m9s-example deps cleanup) | explosivebit | 5 min |
| 6 | H-8 (PermissionDeniedError shared) | explosivebit | 30 min |
| 7 | Verify: build + test + typecheck + publint | explosivebit | 30 min |
| 8 | Commit + changeset + PR | explosivebit | 10 min |
| | **Total** | | **~3 часа** |

## Affected Files

- `packages/api-core/package.json` (H-1, H-4)
- `packages/api-core/LICENSE` (H-1)
- `packages/api-core/src/*.ts` (H-1 SPDX headers)
- `packages/api-core/src/index.ts` (H-2)
- `packages/api-core/src/moleculer/moleculerConfig.template.ts` (H-3)
- `packages/api-core/src/lib/controller/types.ts` (H-4 — verify type stays valid)
- `packages/api-rlr/package.json` (H-5, H-6)
- `examples/m9s-example/package.json` (H-7)
- `examples/m9s-example/src/application/errors/permission-denied.error.ts` (H-8 NEW)
- `examples/m9s-example/src/application/IngestDocumentUseCase.ts` (H-8)
- `examples/m9s-example/src/application/SearchDocumentsUseCase.ts` (H-8)
- `examples/m9s-example/src/services/search/src/actions/search-query.action.ts` (H-8)
- `CLAUDE.md` (H-9)
- `.changeset/sprint-1-hygiene.md` (NEW)

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-001 | PRD | based_on |
| ADR-003 (Platform Runtime Boundaries) | ADR | informs (Sprint 1 — preрequisite для Sprint 2 decomposition) |
| ADR-002 (Hex layer enforcement) | ADR | informs (H-8 fixes hex violation в m9s-example) |
| ADR-011 GertsHub (api-rlr extraction model) | ADR (external) | informs (H-1 license model based on ADR-011 §Decision) |
| docs/dd.md (audit 2026-05-05) | external doc | informs (источник всех 9 items) |
| KNOWN-ISSUES.md | doc (existing) | informs (H-1, H-4 partly документированы там) |

> **Next step**: после approve этого SPEC-001 — запустить Sprint 1 implementation (~3 часа), commit, PR. После Sprint 1 — Sprint 2 (ADR-003 Phase A decomposition).





