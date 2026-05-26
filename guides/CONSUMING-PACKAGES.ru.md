# CONSUMING-PACKAGES-GUIDE

Как использовать `@gertsai/*` пакеты из этого репозитория в **другом** проекте.

> **Контекст**: пакеты публикуются в **GitHub Packages** (npm registry,
> scoped к owner org `gertsai`). Не на public npm — это намеренно (pre-v1.0,
> internal testing across multiple projects). После v1.0 будет миграция на
> public npm registry (см. ROADMAP P4.2).

---

## 0. Когда использовать какой подход

| Сценарий | Подход |
|---|---|
| Постоянный consumer (свой репо использует 1+ `@gertsai/*` пакет долго) | **Registry install** (раздел 2) |
| Эксперимент / short-lived spike | Registry install OK; или **git submodule** для прямого edit |
| Локальная разработка двух репо одновременно (живые правки) | **pnpm workspace link** (раздел 6) |
| CI/CD pipeline | Registry install (раздел 2) + `GITHUB_TOKEN` через secret |
| Forge другой версии (fork) | Git submodule + workspace link |

В 90% случаев — **registry install**.

---

## 1. Prerequisites

### Что нужно установить локально

- **Node ≥ 22 LTS** (тот же что в этом репо — см. `package.json` engines)
- **pnpm 10.x** (npm/yarn тоже работают, но pnpm — наш референс)
- **GitHub аккаунт** с доступом к org `gertsai` (read доступ к private packages
  если visibility = private; для public packages auth всё равно нужен — quirk GitHub Packages)

### GitHub Personal Access Token (PAT)

GitHub Packages требует auth даже для "public" scope packages. Один раз:

1. Открой <https://github.com/settings/tokens/new> (classic PAT) ИЛИ
   <https://github.com/settings/tokens?type=beta> (fine-grained)
2. **Classic PAT** — отметь scope: `read:packages` (минимум; добавь
   `write:packages` если будешь publish'ить)
3. **Fine-grained PAT** — выбрать `gertsai` org, permissions: `Packages: Read`
4. Сгенерируй, скопируй token (`ghp_...` или `github_pat_...`)
5. Сохрани в password manager — больше не покажет

### Установи token в окружение

```bash
# zsh / bash — в ~/.zshrc или ~/.bashrc
export GITHUB_PACKAGES_TOKEN="ghp_..."

# или per-project, через .envrc + direnv:
echo 'export GITHUB_PACKAGES_TOKEN="ghp_..."' > .envrc
direnv allow
```

Имя переменной — твой выбор; ниже использую `GITHUB_PACKAGES_TOKEN`.

---

## 2. Registry install (главный путь)

### Шаг 1 — добавь `.npmrc` в корень consumer проекта

```ini
# .npmrc
@gertsai:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}

# (Опционально) ускорение pnpm resolution для остальных пакетов
auto-install-peers=true
```

**Важно**: `${GITHUB_PACKAGES_TOKEN}` — это **literal** строка в `.npmrc`,
pnpm/npm подставит её из process env при resolve. Не вписывай токен в файл
напрямую — `.npmrc` попадёт в git, токен утечёт.

Добавь `.npmrc` в **commit** (только если он не содержит секрет напрямую —
наша версия с `${VAR}` ОК).

### Шаг 2 — добавь пакет(ы) в зависимости

```bash
# pnpm
pnpm add @gertsai/utils @gertsai/fsm @gertsai/api-core

# npm
npm install @gertsai/utils @gertsai/fsm @gertsai/api-core

# yarn
yarn add @gertsai/utils @gertsai/fsm @gertsai/api-core
```

Lock file (`pnpm-lock.yaml` / `package-lock.json` / `yarn.lock`) обновится с
точными версиями — закоммить.

### Шаг 3 — используй

```ts
import { ... } from '@gertsai/utils';
import { Fsm } from '@gertsai/fsm';
import { defineAction } from '@gertsai/api-core/moleculer'; // subpath
```

TypeScript types подцепляются автоматически (все пакеты ship `.d.ts` в `dist/`).

---

## 3. Version pinning strategy (важно pre-v1.0)

Пока проект **pre-v1.0** (текущее состояние):

- ❌ **Не используй `^0.x.y`** — pnpm/npm semver caret для `0.x` версий
  означает `>=0.x.y <0.(x+1).0`, но **breaking changes допустимы в minor
  bumps** при `0.x` (CLAUDE.md явно разрешает это; SPEC SemVer тоже).
- ✅ **Используй точную версию** или `~0.x.y`:

```json
{
  "dependencies": {
    "@gertsai/utils": "0.2.1",      // pin exact
    "@gertsai/fsm": "~0.2.1",        // accept 0.2.x patches only
    "@gertsai/api-core": "0.2.1"
  }
}
```

После **v1.0** (Phase 2 в ROADMAP) — стандартный semver caret `^1.0.0` будет
безопасен.

### Узнать актуальные версии

```bash
# Список всех опубликованных версий пакета
npm view @gertsai/utils versions --registry https://npm.pkg.github.com

# Latest
npm view @gertsai/utils version --registry https://npm.pkg.github.com
```

Или GitHub UI: <https://github.com/orgs/gertsai/packages?repo_name=shared>

---

## 4. Доступные пакеты (38 шт.)

| Tier | Package | Описание |
|---|---|---|
| 1 | `@gertsai/utils` | Generic utilities |
| 1 | `@gertsai/fsm` | Finite state machine primitives |
| 1 | `@gertsai/fetch` | HTTP fetch wrapper |
| 1 | `@gertsai/collection` | Collection utilities |
| 1 | `@gertsai/llm-costs` | LLM cost calculation (rate table) |
| 1 | `@gertsai/m9s-cache` | Moleculer cache adapter |
| 1 | `@gertsai/ws-rpc` | WebSocket RPC primitives |
| 1 | `@gertsai/async-utils` | sleep/retry/debounce/throttle/withTimeout |
| 1 | `@gertsai/logger-factory` | createLogger + pino/winston subpaths |
| 1 | `@gertsai/errors` | Universal error taxonomy (Shared Kernel) |
| 1 | `@gertsai/tenant-resolver` | Composable tenant strategy chain |
| 1 | `@gertsai/config` | Config primitives |
| 1 | `@gertsai/tenant` | TenantId brand + Moleculer adapter |
| 1 | `@gertsai/otel` | OpenTelemetry SDK setup |
| 1 | `@gertsai/pg-client` | Postgres client + storage adapter |
| 1 | `@gertsai/session` | Session + AbstractDialog + scoping |
| 1 | `@gertsai/entity-audit` | Audit mutation marks |
| 2 | `@gertsai/di` | DI container |
| 2 | `@gertsai/flux` | Reactive streams |
| 2 | `@gertsai/queue` | BullMQ wrappers + /standalone runner |
| 2 | `@gertsai/entity` | Model + Entity + EntityWithMetadata |
| 2 | `@gertsai/storage-core` | IStorageProvider abstract layer |
| 2 | `@gertsai/query-dsl` | Type-safe query constraints + /sql |
| 2 | `@gertsai/audit-primitives` | Timestamp + AuditMarks |
| 2 | `@gertsai/entity-vue` | Vue ReactiveAdapter |
| 2 | `@gertsai/entity-react` | React ReactiveAdapter + useEntity |
| 2 | `@gertsai/entity-solid` | SolidJS ReactiveAdapter |
| 2 | `@gertsai/entity-svelte` | Svelte ReactiveAdapter |
| 2 | `@gertsai/rest-request-manager` | retry + rate-limit + circuit-breaker |
| 2 | `@gertsai/session-guard` | External invariant guards over session |
| 3 | `@gertsai/core` | Platform contracts (Workflow types) |
| 3 | `@gertsai/hsm` | Hierarchical state machines |
| 3 | `@gertsai/entity-storage` | session-aware audit-stamped CRUD |
| 3 | `@gertsai/rpc-proxy-builder` | createRpcProxy<TActionMap> |
| 4 | `@gertsai/auth-openfga` | OpenFGA ReBAC adapter |
| 4 | `@gertsai/api-core` | Moleculer SDK + subpaths /contracts /moleculer /runtime/node |
| 4 | `@gertsai/runtime-context` | Per-request composition root |
| 5 | `@gertsai/api-rlr` | Rate limiter / retry loop runtime |

Подробности по каждому — README в `packages/<name>/` этого репозитория.

### Subpath exports

Некоторые пакеты экспортируют subpaths:

```ts
import { defineAction } from '@gertsai/api-core/moleculer';
import type { ActionContract } from '@gertsai/api-core/contracts';
import { compileToSql } from '@gertsai/query-dsl/sql';
import { vueReactiveAdapter } from '@gertsai/entity/vue';
import { setupOtel } from '@gertsai/otel/moleculer';
import { createQueueWorker } from '@gertsai/queue/standalone';
```

Subpath list — см. `exports` field в `packages/<name>/package.json`.

---

## 5. CI/CD (GitHub Actions)

Если consumer repo тоже на GitHub Actions:

```yaml
# .github/workflows/ci.yml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          registry-url: 'https://npm.pkg.github.com'
          scope: '@gertsai'
      - run: pnpm install
        env:
          # GITHUB_TOKEN автоматически предоставлен runner'у;
          # для cross-org access нужен PAT через repo secrets
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Если consumer repo НЕ в `gertsai` org — нужен PAT:
          # NODE_AUTH_TOKEN: ${{ secrets.GERTSAI_PACKAGES_PAT }}
```

**Важно для cross-org**: если consumer repo НЕ в org `gertsai`, дефолтный
`GITHUB_TOKEN` runner'a **не имеет** доступа к пакетам `gertsai`. Создай
PAT с `read:packages` и сохрани как secret `GERTSAI_PACKAGES_PAT` в
consumer repo (`Settings → Secrets and variables → Actions`).

---

## 6. Локальная разработка двух репо (workspace link)

Если правишь `@gertsai/*` параллельно с consumer'ом — не публикуй каждый
раз. Используй pnpm workspace link.

### Вариант A — pnpm `overrides` (быстро, без monorepo merge)

В consumer `package.json`:

```json
{
  "pnpm": {
    "overrides": {
      "@gertsai/utils": "link:../GertsAi/shared/packages/utils",
      "@gertsai/fsm": "link:../GertsAi/shared/packages/fsm"
    }
  }
}
```

Path относительный от consumer корня. После `pnpm install` consumer будет
импортировать пакеты прямо из gertsai/shared рабочей копии — правки в
source видны мгновенно (нужен `pnpm build` в gertsai/shared для пакетов
которые компилируются в `dist/`).

### Вариант B — объединить в один pnpm workspace

В consumer `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - '../GertsAi/shared/packages/*'   # cross-repo
```

Cross-repo workspace работает только если оба репо клонированы в смежных
директориях. Это рабочий setup для глубокой co-development.

### Откат на registry

Когда закончил local dev — убери `overrides` или cross-repo workspace
entry, run `pnpm install` — pnpm подставит published version обратно.

---

## 7. Troubleshooting

### `401 Unauthorized` при `pnpm install`

- Проверь что `GITHUB_PACKAGES_TOKEN` экспортирован в текущей оболочке:
  `echo $GITHUB_PACKAGES_TOKEN`
- Проверь что PAT не expired (PAT'ы имеют срок жизни)
- Проверь что PAT имеет scope `read:packages` (classic) или
  `Packages: Read` (fine-grained)
- Проверь что у твоего GitHub аккаунта есть доступ к org `gertsai`

### `404 Not Found` при resolve

- Проверь что в `.npmrc` есть `@gertsai:registry=https://npm.pkg.github.com`
  именно с этим scope маппингом
- Проверь имя пакета — оно case-sensitive
- Проверь версию: `npm view @gertsai/<name> versions --registry https://npm.pkg.github.com`

### TypeScript "Cannot find module"

- `pnpm install` прошёл успешно? Перезапусти TS-сервер в IDE
- Subpath import? Проверь `exports` field в `packages/<name>/package.json` —
  должна быть твоя subpath
- Версия пакета поддерживает этот subpath? (subpath появились в разное
  время — см. CHANGELOG)

### Lockfile конфликты

GitHub Packages иногда меняет URL формат resolved entries в lockfile при
re-install. Если pnpm-lock.yaml даёт merge conflicts на каждом install:

```bash
rm pnpm-lock.yaml
pnpm install
git add pnpm-lock.yaml
git commit -m "chore: regenerate lockfile"
```

Один раз — должно стабилизироваться.

### Pre-v1.0 breaking change неожиданно сломал consumer

Это **normal** до v1.0 (CLAUDE.md разрешает breaking в minor bumps). Решение:

- Pin точные версии (раздел 3)
- Подписаться на release notifications: <https://github.com/gertsai/shared/releases>
  → Watch → Custom → Releases
- Читать CHANGELOG.md в `packages/<name>/CHANGELOG.md` перед bump

---

## 8. Будущее (миграция на public npm)

Когда проект достигнет v1.0 (см. ROADMAP Phase 2 + P4.2):

- Registry переключится на `https://registry.npmjs.org`
- Auth для read больше не нужен (public registry)
- `.npmrc` упростится (можно убрать `@gertsai:registry` overload)
- Versioning перейдёт на стандартный `^1.x.y` caret

Изменения будут анонсированы в release notes + migration guide.

До тех пор — GitHub Packages — единственный канал.

---

## Refs

- ROADMAP.md (Phase 2 v1.0 release + P4.2 public npm migration)
- GIT-FLOW-GUIDE.ru.md (для committer'ов в этот репо)
- CLAUDE.md → Releases (как пакеты публикуются)
- GitHub Packages docs: <https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry>
