# CONSUMING-PACKAGES-GUIDE

Как использовать `@gertsai/*` пакеты из этого репозитория в **другом** проекте.

> **Текущий канал:** GitHub Packages, scope `@gertsai`.
> Версии пакетов независимы; среди них уже есть 1.x и выше.
> Переход на public npm — отдельное решение, не автоматическое следствие v1.0.
> [Каталог пакетов](../packages/INDEX.md) и [инструкция для ИИ](AI-CONSUMER-GUIDE.md).

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

- **Node:** поддерживаемая workspace-версия — `^22.13.0 || ^24.0.0 || >=26.0.0`;
  дополнительно проверь `engines` выбранного пакета.
- **pnpm 10.x** — основной проверяемый менеджер этого репозитория.
- **GitHub account** с правом читать нужные packages; членство в org само по
  себе не доказывает доступ. Для npm registry GitHub авторизация нужна и для public packages.

### GitHub Personal Access Token (PAT)

Для локальной установки GitHub Packages поддерживает **PAT classic**, а не
fine-grained PAT. Создай его через <https://github.com/settings/tokens/new> с
минимальным scope `read:packages`. Для установки не нужны `write:packages` или
`delete:packages`. При SAML SSO авторизуй токен для нужной организации.

### Передай token в окружение

Используй password manager или secret manager, чтобы передать credential в
`NODE_AUTH_TOKEN` текущего процесса. Не вставляй значение в shell-команды,
startup-файлы, `.envrc`, git, логи или чат ИИ. Не включай shell tracing.

Проверка **наличия**, не права доступа и не валидности:

```bash
if [ -n "${NODE_AUTH_TOKEN:-}" ]; then
  printf '%s\n' 'NODE_AUTH_TOKEN is set'
else
  printf '%s\n' 'NODE_AUTH_TOKEN is missing' >&2
  exit 1
fi
```

Не печатай значение, префикс, суффикс, длину или hash токена.

---

## 2. Registry install (главный путь)

### Шаг 1 — добавь `.npmrc` в корень consumer проекта

```ini
# .npmrc
@gertsai:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}

# (Опционально) ускорение pnpm resolution для остальных пакетов
auto-install-peers=true
```

**Важно**: `${NODE_AUTH_TOKEN}` — это **literal** строка в `.npmrc`,
pnpm/npm подставит её из process env при resolve. Не вписывай токен в файл
напрямую — `.npmrc` попадёт в git, токен утечёт.

Добавь `.npmrc` в **commit** (только если он не содержит секрет напрямую —
наша версия с `${VAR}` ОК).

### Шаг 2 — добавь пакет(ы) в зависимости

Для первого полного сценария используй
[versioned timeout recipe](AI-CONSUMER-GUIDE.md#recipe-bound-an-asynchronous-wait).
Для других пакетов сначала выбери доступные exact versions и обязательные peers
по выбранной версии README/manifest. Не заменяй этот выбор установкой latest.

Закоммить manifest и lockfile consumer-проекта после review получившегося набора.

### Шаг 3 — используй

```ts
// Пример public import; полный исполнимый сценарий — в AI consumer guide.
import { defineAction } from '@gertsai/api-core/moleculer';
```

TypeScript types подцепляются автоматически (все пакеты ship `.d.ts` в `dist/`).

---

## 3. Version pinning strategy

Выбирай версию **каждого пакета отдельно**. Для воспроизводимой интеграции и
проверки используй exact versions и закоммиченный lockfile; проверь peers
выбранного набора. В [записях релизов](https://github.com/gertsai/shared/releases)
зафиксирован storage-набор `storage-core@3.0.0`, `query-dsl@3.0.0`,
`entity-queries@1.0.0`; доступность своему credential и весь peer-набор проверяй отдельно.

Для пакета 0.x minor может менять контракт; для пакета ≥1.0 breaking change
требует major по SemVer. Range не заменяет review CHANGELOG и проверки
consumer-проекта. Нельзя применять общий ярлык «всё pre-v1.0» ко всему repo.

Версия в checkout не доказывает наличие tarball в registry. Сначала проверь
доступность нужной версии своим read credential, затем устанавливай её и peers.

### Узнать актуальные версии

```bash
# Список всех опубликованных версий пакета
npm view @gertsai/utils versions --registry https://npm.pkg.github.com

# Latest
npm view @gertsai/utils version --registry https://npm.pkg.github.com
```

Или GitHub UI: <https://github.com/orgs/gertsai/packages?repo_name=shared>

---

## 4. Каталог пакетов

[Единый каталог по задачам](../packages/INDEX.md) ведёт к каноническому README
каждого package. Это каталог исходников, не обещание доступности всех версий в
registry. Имена, `exports`, `engines` и обязательные peers сверяй с manifest
выбранной версии; optional peer может быть необходим при использовании adapter subpath.

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

Consumer workflow должен иметь read permissions и доступ к выбранным packages:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: read
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
      - run: pnpm install --frozen-lockfile
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

В `.npmrc` из раздела 2 используется та же переменная `NODE_AUTH_TOKEN`.
Для private package настрой **Package settings → Manage Actions access** и
дай consumer repository право Read. `packages: read` и принадлежность к той
же org сами по себе этот grant не создают.

Если доступа через `GITHUB_TOKEN` нет, используй разрешённый политикой PAT
classic с `read:packages`, сохранённый как Actions secret. Замени только
binding на `NODE_AUTH_TOKEN: ${{ secrets.GERTSAI_PACKAGES_PAT }}`.
Не выдавай недоверенному PR-коду доступ к private packages через privileged workflow.

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

- Проверь наличие `NODE_AUTH_TOKEN` способом из раздела 1, **не выводя token**.
- Проверь expiration, scope `read:packages`, права аккаунта/package и SSO.
- Для Actions отдельно проверь `packages: read` и package-level repository grant.
- `403` из-за scopes — проблема credential, а не доказательство отсутствия пакета.

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

Не удаляй lockfile автоматически. Сначала сравни изменения dependency versions,
registry mapping и версию менеджера пакетов, затем разреши конфликт штатным
способом consumer-проекта. Любую необходимую регенерацию согласуй отдельно и
проверь полный diff; не выдавай её за универсальное исправление registry access.

### Pre-v1.0 breaking change неожиданно сломал consumer

Для выбранного пакета 0.x проверь migration notes minor-релиза:

- Pin точные версии (раздел 3)
- Подписаться на release notifications: <https://github.com/gertsai/shared/releases>
  → Watch → Custom → Releases
- Читать CHANGELOG.md в `packages/<name>/CHANGELOG.md` перед bump

---

## 8. Будущее (миграция на public npm)

GitHub Packages остаётся текущим каналом. Переезд на public npm требует
отдельного изменения registry/auth, объявления и migration guide. Версия
отдельного пакета ≥1.0 сама по себе registry не переключает.

---

## Refs

- [Карта документации](INDEX.md).
- [Канонический release guide](../.changeset/README.md).
- [Git Flow guide](GIT-FLOW-GUIDE.ru.md) для contributors.
- GitHub Packages docs: <https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry>
