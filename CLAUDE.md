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
- **Scope**: `@gertsai/*` — 14 packages в first wave (v0.1.0).
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

## 14 packages — деп-граф и build-команды

| Tier | Package | Internal deps | Build |
|---|---|---|---|
| 1 | `@gertsai/fsm` | — | `tsc --build tsconfig.json` |
| 1 | `@gertsai/fetch` | — | `tsc` |
| 1 | `@gertsai/collection` | — | `tsc --build tsconfig.json` |
| 1 | `@gertsai/llm-costs` | — | dual `build:esm` + `build:cjs` |
| 1 | `@gertsai/utils` | — | dual `build:esm` + `build:cjs` |
| 1 | `@gertsai/m9s-cache` | — | `tsc --build tsconfig.json` |
| 1 | `@gertsai/ws-rpc` | — | `tsc -p tsconfig.json` |
| 2 | `@gertsai/di` | utils | dual `build:esm` + `build:cjs` |
| 2 | `@gertsai/flux` | collection | `tsc --build tsconfig.json` |
| 3 | `@gertsai/core` | llm-costs | `tspc --build tsconfig.json` (ts-patch + typia) |
| 3 | `@gertsai/hsm` | — | `tspc --build tsconfig.json` |
| 4 | `@gertsai/auth-openfga` | core | `tsc` |
| 4 | `@gertsai/api-core` | core, auth-openfga | `tspc` |
| 5 | `@gertsai/api-rlr` | api-core | dual `build:esm` + `build:cjs` |

**Что важно знать**:
- `tspc` = ts-patch wrapped tsc (для typia transformer). Если build падает с
  "transform not found" — `pnpm rebuild` или `ts-patch install -s`.
- `dual ESM+CJS` packages выводят в `dist/esm/` + `dist/cjs/`.
- `core/src/connectors/identity-resolver.ts` — закомментирован экспорт. См.
  `KNOWN-ISSUES.md` пункт 1.

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
