# CLAUDE.md — gertsai/shared

Apache 2.0 OSS multi-package monorepo для `@gertsai/*` shared infrastructure
packages, extracted из `gertsai_codex` (RFC-extracted с preserved git history).
Публикация через Changesets в npm public registry под scope `@gertsai`.

Язык документации/коммитов: **English** для commit subjects (Conventional Commits)
и кода/идентификаторов; **русский** допустим в commit body, PR description и
этом файле.

---

## 🔴 Красные линии

- **Деструктивные git** (`push --force`, `reset --hard`, удаление веток/тегов,
  `rebase -i` на published истории) — только после явного "да" в текущей сессии.
- **Никогда не публиковать на npm без подтверждения**: `pnpm changeset publish`,
  `npm publish`, `pnpm publish` — все требуют ручного `Y` от пользователя.
  Опубликованную версию **нельзя** удалить, только `npm deprecate`.
- **Не пушить в `main` напрямую** — все merge только через PR (см. branch
  protection в `guides/GIT-FLOW-GUIDE.ru.md` §8).
- **Не править файлы в `gertsai_codex`** из этой сессии — это отдельный repo,
  отдельный scope (Phase 2 миграция = отдельная сессия).
- **Не трогать packages/*/dist/, *.tsbuildinfo, packages/*/reports/junit/** —
  это build artifacts. Если видишь tracked → `git rm --cached` + `.gitignore`.

---

## Что это за проект

- **Тип**: TypeScript-only multi-package OSS monorepo (npm packages).
- **Scope**: `@gertsai/*` — **28 packages** (14 first-wave v0.1.0 + 5 foundation libs Wave 1 v0.2.0 per ADR-004 + 4 entity/session/audit + di-enhanced Wave 4A per PRD-002 + ADR-005 + 2 Wave 5 Phase 1 errors/tenant-resolver per PRD-003 + ADR-006).
- **Стек**: Node ≥22 LTS · pnpm 10.x · TypeScript 5.9 · Vitest · moonrepo · Changesets.
- **Источник foundation-решений**: `~/Work/GertsHub/.forgeplan/{adrs,epics,evidence}/`
  (read-only, не править отсюда). Главные: ADR-005, ADR-006, ADR-009, EPIC-007, EVID-008.
- **Текущий статус**: v0.1.0 готов локально, не запушен и не опубликован. См. `KNOWN-ISSUES.md`.

---

## Session start (первое, что делаешь в новой сессии)

Параллельно:

```bash
git status && git log --oneline -5
cat KNOWN-ISSUES.md       # текущие limitations v0.1.0
ls packages/              # подтверди 14 пакетов на месте
```

**Не читать на старте** (читать только когда релевантно):
- содержимое `guides/*.ru.md` (открывай по запросу, не "на всякий случай")
- `pnpm-lock.yaml` (только при dependency-debug)
- историю по preserved-history packages (`git log packages/<pkg>`) — только
  если работаешь с конкретным пакетом

**Re-warm**: переключаешься на новый пакет → прочти `packages/<pkg>/package.json`
+ `packages/<pkg>/README.md`. Меняешь release/CI flow → прочти `guides/GIT-FLOW-GUIDE.ru.md`
и `.github/workflows/`.

**Критерий достаточности**: можешь назвать (a) tier пакета и его internal deps,
(b) build command (`tsc` / `tspc` / dual ESM+CJS), (c) публиковался ли уже.

---

## Repo layout

```
packages/<14-packages>/   ← @gertsai/<name> sources
.changeset/               ← pending bumps (config.json: public access)
.moon/                    ← workspace.yml + toolchain.yml + tasks.yml
.github/workflows/        ← ci.yml + release.yml (changesets/action)
guides/                   ← методические гайды (источник истины)
KNOWN-ISSUES.md           ← v0.1.0 limitations
LICENSE                   ← Apache 2.0
tsconfig.base.json        ← module=CommonJS, moduleResolution=node, strict=true
pnpm-workspace.yaml       ← packages: ['packages/*']
```

---

## 28 packages — tier таблица + build (post-Sprint 3.0/3.0.1/3.2/3.4/3.5/3.6 per ADR-004 + ADR-005 + ADR-006)

Все 28 packages используют **uniform tsup dual ESM+CJS** (Sprint 3.0 §U-1..U-6) с фиксированными scripts (`build`, `clean`, `test`, `typecheck`, `lint` — Sprint 3.0.1 F-8).

| Tier | Package | Internal deps | Source | Notes |
|---|---|---|---|---|
| 1 | `@gertsai/fsm` | — | first wave | finite state machine primitives |
| 1 | `@gertsai/fetch` | — | first wave | HTTP fetch wrapper |
| 1 | `@gertsai/collection` | — | first wave | collection utilities (subpaths) |
| 1 | `@gertsai/llm-costs` | — | first wave | LLM cost calculation |
| 1 | `@gertsai/utils` | — | first wave | generic utilities |
| 1 | `@gertsai/m9s-cache` | — | first wave | Moleculer cache adapter |
| 1 | `@gertsai/ws-rpc` | — | first wave | WebSocket RPC primitives |
| **1** | **`@gertsai/errors`** | — | **Sprint 3.6 W-3-6-1..8 (F fresh)** | Universal error taxonomy (10 ErrorKind `as const`) + AppError<D> + 10 typed subclasses + `/http` (RFC 9457 ProblemDetails + bucket types + redaction) + `/grpc` (canonical status codes vendored) + cycle/depth guard. **Shared Kernel** for `@gertsai/*` ecosystem per ADR-006 §D §6 |
| **1** | **`@gertsai/tenant-resolver`** | errors (peer) | **Sprint 3.6 W-3-6-9..17 (F fresh)** | Composable strategy chain + 3 hardened built-in strategies (Header trustProxy, Subdomain strict-suffix, Path URL-normalised) + `/moleculer` + `/http` subpaths; **default `mode: 'strict'`** fail-closed per ADR-006 I-18 |
| **1** | **`@gertsai/config`** | api-core | **Sprint 3.2 W-1 (S shim)** | re-exports api-core/runtime/node — ADR-004 |
| **1** | **`@gertsai/tenant`** | — | **Sprint 3.2 W-2 (F fresh)** | TenantId brand + getTenantIdStrict/Optional + `/moleculer` adapter |
| **1** | **`@gertsai/otel`** | — | **Sprint 3.2 W-3 (F fresh)** | OTel SDK setup + `/moleculer` tracing; lazy peer-deps |
| **1** | **`@gertsai/pg-client`** | — (root); storage-core, query-dsl peer (`/storage`) | **Sprint 3.2 W-4 (F)** + **Sprint 3.5 W-4B-4 (A — additive `/storage` adapter)** | Root: agnostic 3-method PgClient + mockPgClient (ADR-011 I-1/I-2 unchanged). `./storage` subpath: PgStorageProvider implements IStorageProvider per ADR-005 I-3 (additive, peer-optional storage-core+query-dsl) |
| **1** | **`@gertsai/session`** | errors (peer for `*Strict`) | **Sprint 3.4 W-4A-2 (F fresh)** + **Sprint 3.6 W-3-6-18..22 (E+ additive)** | Session class + AbstractDialog + 24-value OperatorType + dataAccessUuid (Sprint 3.4) + Sprint 3.6: additive scoping (`tenantId/projectId/spaceId` flat tags per ADR-006 I-17) + 3 strict helpers (`getTenantStrict` throws `UnauthorizedError`; `getProjectStrict`/`getSpaceStrict` throw `ValidationError` per ADR-006 I-16) |
| **1** | **`@gertsai/entity-audit`** | session | **Sprint 3.4 W-4A-3 (F fresh)** | MutationMarks + UpdateActionMap + 4 builder funcs (set/update/delete/restore) — backend-agnostic Timestamp |
| 2 | `@gertsai/di` | utils | **enhanced Sprint 3.4 W-4A-4 (E)** | DI container + new guards/destroy/inference helpers (Orchestra orchlab/di patterns) |
| 2 | `@gertsai/flux` | collection | first wave | reactive streams |
| **2** | **`@gertsai/queue`** | — | **Sprint 3.2 W-5 (P+F)** | BullMQ wrappers + `/standalone` runner; consumed BY api-core (Sprint 3.x migration) |
| **2** | **`@gertsai/entity`** | session | **Sprint 3.4 W-4A-1 (F fresh)** | Model + Entity + EntityWithMetadata base classes; pluggable ReactiveAdapter; `/vue` subpath; multi-framework adapter snippets in README |
| **2** | **`@gertsai/storage-core`** | di | **Sprint 3.5 W-4B-1 (F fresh)** | Backend-agnostic IStorageProvider<Meta> interface + StorageMetadata generic + IBatchRunner/ITransactionRunner + capabilities flag + storageProviderIdentifier DI token + ListenersNotSupportedError/TransactionConflictError per ADR-005 Decision A |
| **2** | **`@gertsai/query-dsl`** | storage-core | **Sprint 3.5 W-4B-3 (F fresh)** | Type-safe query constraints (whereField/orderBy/limit/start*/end*) compile-validated against Meta['indexed']; `./sql` subpath = compileToSql reference Postgres compiler |
| 3 | `@gertsai/core` | llm-costs | first wave | platform contracts (Workflow types, Sprint 3.1 W-1; Sprint 3.0.1 F-9 meta) |
| 3 | `@gertsai/hsm` | — | first wave | hierarchical state machines |
| **3** | **`@gertsai/entity-storage`** | storage-core, entity, entity-audit, session, di | **Sprint 3.5 W-4B-2 (F fresh)** | abstract BaseEntityStorageService<Meta, UpdateActionTypes> session-aware audit-stamped CRUD + soft-delete + EventEmitter (STORAGE_EVENTS) + IDestroyable; class InMemoryStorageProvider<Meta> Map-backed test fixture full-listeners support |
| 4 | `@gertsai/auth-openfga` | core | first wave | OpenFGA ReBAC adapter |
| 4 | `@gertsai/api-core` | core, auth-openfga | first wave | Moleculer SDK; subpaths /contracts /moleculer /runtime/node (Sprint 2 ADR-003) |
| 5 | `@gertsai/api-rlr` | api-core | first wave | rate limiter / retry loop runtime (ADR-011) |

**Strategy markers** (per ADR-004 + ADR-005 + ADR-006 extensions):
- **P** = Preserve git history; **F** = Fresh code; **S** = Shim/thin re-export; **P+F** = Preserve-history core + fresh boundary; **E** = Enhancement of existing package (additive only); **A** = Additive non-breaking adapter extension.
- **F+** = Fix on existing — additive only, no breaking changes (Wave 5 ADR-006 §D §4; e.g. Sprint 3.6 polish batch).
- **E+** = Enhancement of existing package, additive only (Wave 5 ADR-006 §D §5; e.g. Sprint 3.6 session scoping).

**Что важно знать**:
- All 14 first-wave + 5 Sprint 3.2 + 3 Sprint 3.4 + 3 Sprint 3.5 packages (25 physical directories; di-enhanced counted as 26th deliverable in Wave 4 logical roll-up): uniform tsup dual ESM+CJS (Sprint 3.0 §U-3..U-6).
- `tspc` only used in m9s-example (typia transformer). Production packages migrated off ts-patch.
- `core` + `api-core` имеют subpath exports + typesVersions для Node10 fallback (Sprint 3.0.1 F-4).
- `tenant`, `otel`, `queue`, `entity`, `query-dsl`, `pg-client` имеют `/moleculer`, `/moleculer`, `/standalone`, `/vue`, `/sql`, `/storage` subpaths соответственно — typesVersions добавлен per Sprint 3.0.1 F-4 pattern.
- ApiController workflow internal hook keyed by `Symbol.for('@gertsai/api-core:registerWorkflow')` — never surfaces в emitted `.d.ts` (Sprint 3.0.1 F-1).
- `core/src/connectors/identity-resolver.ts` — закомментирован экспорт. См. `KNOWN-ISSUES.md` пункт 1.
- **PgStorageProvider** (Sprint 3.5 `@gertsai/pg-client/storage`) wraps existing 3-method PgClient via raw SQL (compileToSql). capabilities { listeners: false, transactions: true, batches: true }. SQLSTATE 40001/40P01 → TransactionConflictError. ADR-005 I-3 + ADR-011 I-1/I-2 preserved (root surface unchanged).

**Cross-references**:
- ADR-004 (Foundation libs naming + extraction strategy) — обоснование rename `observe→otel`, `database→pg-client`, drop `auth-moleculer`.
- ADR-003 (Platform Runtime Boundaries) — subpath patterns; new packages follow.
- ADR-002 (Hex layer enforcement) — applies к `examples/m9s-example/` only; foundation libs flat utility packages OUTSIDE hex.
- ADR-011 (Hub) — `@gertsai/pg-client` invariants I-1, I-2 (agnostic, no Prisma binding).

---

## Полный цикл работы

### Изменить существующий пакет

```bash
# 1. Branch от main
git checkout main && git pull
git checkout -b feat/<scope>-<short-desc>

# 2. Правки в packages/<pkg>/
# 3. Локальный smoke
pnpm install                    # если поменял deps
pnpm --filter @gertsai/<pkg> run build
pnpm --filter @gertsai/<pkg> run test

# 4. Полный smoke (см. ниже Smoke test)
pnpm build && pnpm test

# 5. Changeset (описание + bump-уровень)
pnpm changeset
#   - выбери пакет(ы)
#   - выбери minor/patch/major
#   - напиши описание (попадёт в CHANGELOG)

# 6. Commit + PR
git add . && git commit -m "feat(<pkg>): <description>"
git push -u origin <branch>
gh pr create --base main --fill
```

### Добавить новый пакет

1. `mkdir packages/<name> && cd packages/<name>`
2. `package.json`: `"name": "@gertsai/<name>"`, `"version": "0.0.0"`, `"license": "Apache-2.0"`,
   `"publishConfig": {"access": "public"}`, scripts (`build`, `test`, `typecheck`).
3. `tsconfig.json`: `extends: "../../tsconfig.base.json"`, `outDir: "./dist"`, `rootDir: "./src"`.
4. `src/index.ts`, `README.md`, `ln -sf ../../LICENSE LICENSE`.
5. `pnpm install` (от root) — wire workspace.
6. `pnpm changeset` — отметь как `minor` (initial release).

### Релиз

Обычный flow — автоматически через `release.yml` после merge в `main`:
1. PR с changesets merged в `main`
2. `changesets/action` создаёт "Version Packages" PR с bump'ами
3. Merge этого PR → CI публикует на npm

Ручной (если нужно вручную):
```bash
pnpm install && pnpm build && pnpm test
pnpm changeset version           # применяет changesets, обновляет CHANGELOGs
git commit -am "chore: release packages"
pnpm changeset publish           # публикация на npm — требует NPM_TOKEN или login
git push --follow-tags origin main
```

---

## Конвенции

- **Git Flow + Conventional Commits**: см. `guides/GIT-FLOW-GUIDE.ru.md`.
  Scope в commit ≈ имя пакета: `feat(core): ...`, `fix(api-core): ...`,
  `chore(release): ...`. Multi-package change → `feat(*): ...` или несколько коммитов.
- **Versioning**: SemVer, pre-1.0 даёт право на breaking changes в minor bumps.
- **Branches**: `feat/*`, `fix/*`, `chore/*`, `docs/*` от `main`. PR mandatory.
- **License header**: каждый новый файл начинается с
  `// SPDX-License-Identifier: Apache-2.0` (опционально, не enforced на v0.1.0).
- **Code style**: defaults TypeScript strict mode (`strict: true`). Не вводи
  `any` без явного `// reason: ...`. Public API — JSDoc на exports.
- **Тесты**: Vitest. Файлы рядом с источником (`src/foo.ts` + `src/foo.test.ts`)
  или в `__tests__/`. Integration tests с `.integration.test.ts` суффиксом —
  skip-by-default (требуют DB / external infra).

---

## Smoke test (выполни перед каждым PR)

```bash
pnpm install --frozen-lockfile        # lockfile должен быть консистентен
pnpm build                             # 14/14 packages Done
pnpm test                              # ожидание: ~3187 passed, ~54 skipped
pnpm typecheck 2>&1 | tail -10        # отдельная проверка типов
```

Если упало — починить **до** push. CI запускает то же самое.

---

## AI-агентам (для autonomous session)

### Память (hindsight MCP)

- **Bank**: `gerts_shared` (config в `.mcp.json` репо). Проверь подключение
  через `memory_status` в начале сессии — если `connected`, см. **общее
  правило в `~/.claude/rules/hindsight.md`**.
- **На старте сессии**: `memory_recall("project context")` для restore
  основных фактов (что extracted, какие пакеты, текущий state).
- **Доступные группы** (10): list через `memory_recall("memory recall guide")`.
  Прямой доступ: `recall("pipeline pattern parity")`,
  `recall("m9s-example feature inventory")`,
  `recall("@gertsai api-core surface")`,
  `recall("queue handler this binding bug")`,
  `recall("workflows event log replay")` и т. д.
- **Когда retain**: новый bug + root cause + fix; новый pattern; что
  отложено / не extracted; live-tested integration с подтверждёнными env.
- **Не retain**: содержимое файлов, git log, ephemeral state.
- **Auto-MEMORY.md**: если есть `~/.claude/projects/.../memory/MEMORY.md`,
  подгружается автоматически — не дублируй recall тех же фактов.

### Subagents и safety

- Для сложных подсессий (filter-repo prep, bulk rename, audit) — **используй subagents**
  параллельно для prep, sequentially для merge/git-write (lock файла).
- При неуверенности про push/publish/destructive — **STOP и спроси**, не "решай за человека".
- При обнаружении незнакомых файлов / веток — не чисть. Может быть работа пользователя.

---

## Non-goals (что этот repo НЕ делает)

- **Не содержит** application/business logic — только infrastructure primitives.
  Application code остаётся в `gertsai_codex` и `GertsHub`.
- **Не использует Turborepo** (несмотря на typical TS-monorepo выбор) — moonrepo
  per ADR-003 (workspace consistency с Hub).
- **Не зависит** от `@gertsai/*` packages вне 14-package wave. Если код требует
  `@gertsai/database`, `@gertsai/api-types` и т.п. — это либо future work
  (вторая волна extraction), либо stub/comment-out (см. `KNOWN-ISSUES.md`).
- **Не публикуется на private registry** — только public npm, Apache 2.0.
- **Не extract'ит Fluxis** — это отдельный repo `TrivexDev/fluxis` (per ADR-008).
- **Не модифицирует upstream `gertsai_codex`** из этой сессии — это Phase 2,
  отдельная сессия с отдельным repo как cwd.

---

## Справочник

- **`guides/INDEX.md`** — оглавление методических гайдов
- **`guides/GIT-FLOW-GUIDE.ru.md`** — Git Flow, Conventional Commits, PR, SemVer, safety
- **`guides/CLAUDE-MD-GUIDE.ru.md`** — best practices для CLAUDE.md (этот файл следует им)
- **`KNOWN-ISSUES.md`** — текущие v0.1.0 limitations + workarounds
- **`README.md`** — public-facing intro для npm/GitHub visitors
- **`CONTRIBUTING.md`** — workflow для external contributors
- **`~/Work/GertsHub/.forgeplan/`** — архитектурные решения (read-only из этой сессии).
  Среди прочих: **ADR-011** — обоснование добавления `@gertsai/api-rlr` как Tier 5
  пакета (rate-limiter / retry-loop runtime поверх api-core).
