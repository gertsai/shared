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
- **🔴 STRICT: Forgeplan artifacts мутировать ТОЛЬКО через MCP/CLI** —
  файлы в `.forgeplan/{prds,adrs,specs,rfcs,evidence,notes}/*.md` нельзя
  редактировать через `Edit`/`Write`/`sed` напрямую. Все изменения тела/статуса
  идут через `mcp__forgeplan__forgeplan_update`, `forgeplan_new`,
  `forgeplan_link`, `forgeplan_activate`, `forgeplan_deprecate` (или
  эквивалентный CLI `forgeplan update|new|link|activate|...`). Прямой Edit
  десинхронизирует LanceDB index, state machine (`.forgeplan/state/<ID>.yaml`)
  и canonical body — `forgeplan_get` начнёт возвращать stale данные,
  semantic search промахнётся. Если случайно отредактирован — recover через
  `forgeplan_update id=<ID> body=<full new body>` (читаешь файл, формируешь
  полное новое body без YAML frontmatter, пушишь через MCP). Last-resort
  fallback: `forgeplan scan-import` пересоберёт LanceDB из markdown.
  Direct Edit OK ТОЛЬКО для не-forgeplan markdown (READMEs, CLAUDE.md,
  KNOWN-ISSUES, src code, .changeset/*.md).

---

## Что это за проект

- **Тип**: TypeScript-only multi-package OSS monorepo (npm packages).
- **Scope**: `@gertsai/*` — **38 packages** (14 first-wave v0.1.0 + 5 foundation libs Sprint 3.2 per ADR-004 [config/tenant/otel/queue/pg-client] + 3 Wave 4A new Sprint 3.4 per PRD-002 [entity/session/entity-audit; di enhanced in-place] + 3 Wave 4B new Sprint 3.5 per ADR-005 [storage-core/query-dsl/entity-storage] + 13 Wave 5 packages per PRD-003 [2 Phase 1 errors/tenant-resolver per ADR-006 + 3 Phase 2 runtime-context/session-guard/audit-primitives per ADR-007 + 4 Phase 3 entity-vue/react/solid/svelte per ADR-008 + 4 Phase 4 async-utils/logger-factory/rpc-proxy-builder/rest-request-manager per ADR-009]). **Waves 5–7 complete** — Sprint 3.10 + Sprint 3.11 + Wave 6.{2,3,4,5} + Wave 7.{1,2} are E+/F+ enhancements on existing packages, not new packages.
- **Стек**: Node ≥22 LTS · pnpm 10.x · TypeScript 5.9 · Vitest · moonrepo · Changesets.
- **Источник foundation-решений**: `~/Work/GertsHub/.forgeplan/{adrs,epics,evidence}/`
  (read-only, не править отсюда). Главные: ADR-005, ADR-006, ADR-009, EPIC-007, EVID-008.
- **Текущий статус**: Wave 11.B + сменилось 8 PRs за Wave 10-11 сессию (#17 .. #24). Stack завершён:
  - **Wave 10** (PRDs 016-022) — m9s-example reference webapp built (auth UI + content slices + design system + audit closures).
  - **Wave 11.A** (PRD-023) — production hardening: real bcrypt auth, hardcoded JWT_SECRET removed, Redis rotation store, per-tenant SSE caps, env-driven CORS, Button-primitive migration.
  - **Wave 11.B** (PRD-024) — `defineAction` upstreamed в `@gertsai/api-core/moleculer` (changeset minor → v0.2.0), `JwtClaims` в shared `@gertsai-examples/m9s-example-api-types` package.
  - **Wave 11.C** (PRD-025 design) — Production ops layer (observability, health/ready, graceful shutdown, auto-migrate, rate-limit defaults) + 4 extensions (OIDC, Prisma, Storybook CI, oxlint) + doc cleanup. Phase C now ships (this commit); Phase A in Wave 12; Phase B in Wave 13.
  - **v0.2.0 ещё не опубликован** в npm — pending publish gate. После merge changeset PR (создаётся автоматически после Wave 11.B landing) → `pnpm changeset publish` ручной с Y per package.
  - См. `KNOWN-ISSUES.md` для текущих limitations.

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


## Forgeplan — единый источник правды для решений

`.forgeplan/` — **single source of truth** для «что было решено, зачем, с какими доказательствами» и (через lifecycle артефактов `draft → active → superseded/deprecated/stale`) «над чем сейчас работаем». CLI: `forgeplan` (v0.27+). MCP: `.mcp.json` → server `forgeplan` (28 tools).

### Методология

```
OBSERVE → ROUTE → SHAPE → BUILD → PROVE → SHIP
```

| Phase | Action | Команда |
|---|---|---|
| Observe | restore context, find blind spots | `forgeplan health` |
| Route | decide depth | `forgeplan route "<task>"` |
| Shape | create + validate artifacts | `forgeplan new <kind>` ; `forgeplan validate <id>` |
| Reason | ADI hypotheses (Standard+, mandatory Deep+) | `forgeplan reason <id>` |
| Build | code + tests | (стек workspace'а) |
| Prove | evidence + R_eff | `forgeplan new evidence` ; `forgeplan link` ; `forgeplan score` |
| Ship | activate + PR + merge | `forgeplan activate` ; `gh pr create` |

Depth маппится на наш Routing/Depth: **Tactical** (без артефакта) / **Standard** (PRD+RFC) / **Deep** (PRD+Spec+RFC+ADR) / **Critical** (Epic+stack + adversarial review).

### Когда артефакт обязателен (Standard+)

- Новая фича, видимая пользователю (любого `apps/*`).
- Кросс-workspace изменения, новые публичные API в `packages/{design-system,backend-sdk,analytics}`.
- Изменения схемы / миграций, контракта `backend-sdk` (orval).
- Изменения `.claude/rules/`, `.claude/agents/`, `.claude/commands/`, оркестраторов.
- Архитектурные решения — оформляются ADR в `.forgeplan/adrs/` + (опционально) дублируются в `docs/` через `project-docs-writer`.

Tactical (без артефакта): однострочные фиксы, форматирование, переименование 1 файла, правка опечаток в md/комментах, bump зависимости без API impact.

### Hint protocol — выполнять verbatim

Каждый вывод `forgeplan` (CLI и MCP) заканчивается одним из маркеров:

| Marker | Действие |
|---|---|
| `Next: <full command>` | run as-is |
| `Or: <full command>` | только если `Next:` блокирует |
| `Wait: <condition>` | retry после condition |
| `Done.` | terminal — переходим к следующей задаче |
| `Fix: <full command>` | error remediation, paired с `Error:` |

JSON / MCP кладут то же значение в `_next_action`. **Не парафразировать, не подставлять placeholder'ы.**

### R_eff (математика, которую ОБЯЗАН знать)

```
R_eff = min(evidence_scores)        # weakest link, НИКОГДА не average
evidence_score = max(0, verdict_score - CL_penalty)
```

| Verdict | Score |   | CL | Penalty | Контекст |
|---|---|---|---|---|---|
| `supports` | 1.0 |   | CL3 | 0.0 | same — internal test on target system |
| `weakens` | 0.5 |   | CL2 | 0.1 | similar — related project, same stack |
| `refutes` | 0.0 |   | CL1 | 0.4 | different — article, external docs |
|  |  |   | CL0 | 0.9 | opposed |

| R_eff | Status |
|---|---|
| ≥ 0.5 | Adequate — activate ok |
| < 0.5 | Needs review — add evidence |
| < 0.3 | At risk — reassess |

EvidencePack body **ОБЯЗАН** содержать секцию `## Structured Fields` с `verdict`, `congruence_level`, `evidence_type`. Без них парсер тихо ставит CL0 → R_eff схлопывается до 0.1.

### Standard flow для фичи (Standard+)

```bash
forgeplan health                                         # observe
forgeplan route "implement ad-account dashboard tile"
forgeplan new prd "Ad-account dashboard tile"            # shape
$EDITOR .forgeplan/prds/PRD-NNN-*.md                     # заполнить MUST sections
forgeplan validate PRD-NNN                               # 0 MUST errors
forgeplan reason PRD-NNN                                 # ADI (Standard+)
# write code + tests (через subagent / orchestrator)
forgeplan new evidence "PRD-NNN: vitest 14 pass, p95 180ms на staging"
$EDITOR .forgeplan/evidence/EVID-MMM-*.md                # ## Structured Fields!
forgeplan link EVID-MMM PRD-NNN --relation informs
forgeplan score PRD-NNN                                  # R_eff > 0?
forgeplan activate PRD-NNN                               # draft → active
# gh pr create --base develop  (PR body: "Refs: PRD-NNN")
```

### Multi-agent (`dispatch → claim → spawn → release`)

```bash
forgeplan dispatch --agents 3 --json    # планер conflict-free buckets (НЕ спавнер!)
forgeplan claim PRD-NNN --agent <subagent-name> --ttl-minutes 60
# … работа …
forgeplan release PRD-NNN
```

`dispatch` возвращает план, **спавнит main thread / orchestrator** через `Agent({subagent_type, prompt})` (несколько `Agent`-блоков в одном сообщении = параллель). `SendMessage` — НЕ спавнер; адресует только уже запущенные процессы.

### Команды-однострочники (на каждый день)

```bash
forgeplan health              # session-start sanity check
forgeplan list                # все артефакты
forgeplan graph               # mermaid-граф связей
forgeplan stale               # артефакты с истёкшим valid_until
forgeplan blindspots          # решения без evidence
forgeplan claims              # кто что захватил
```

### Bootstrap после `git clone`

```bash
forgeplan init -y             # idempotent, создаст .forgeplan/config.yaml
forgeplan scan-import         # пересобрать LanceDB из markdown
forgeplan health
```

`config.yaml` коммитится; `.forgeplan/{lance,logs,memory,trash,claims,state,session.yaml}` — нет (см. `.gitignore`).

### LLM-токены: что бесплатно, что платно

В `.forgeplan/config.yaml` секция `llm:` **закомментирована** — это намеренно. Большая часть Forgeplan работает локально/детерминированно, без API:

- **Бесплатно (local)**: `init`, `new`, `validate`, `score`, `link`, `activate`, `health`, `list`, `status`, `graph`, `tree`, `order`, `stale`, `blindspots`, `claim`/`release`/`claims`, `dispatch`, `route` (эвристика), `calibrate`, `journal`, `coverage`, `drift`, `gaps`, `fgr`, `decay`, `phase`, `tag`/`untag`, `update`/`delete`, `restore`/`undo-last`, `import`/`export`, `scan-import`, `migrate`, `reindex`, `capture` (regex-based), `search` и `embed` (на **локальной** `bge-m3` через fastembed, без API).
- **Использует LLM-API (платно отдельно)**: `reason` (ADI), `generate` (создание артефакта по описанию), `decompose` (PRD → RFC tasks), `context` (single-call reasoning).

Подписка Claude Code НЕ покрывает Anthropic API — это разные billing'и. Поэтому дефолтная политика:

**Не подключать `llm:`** для повседневной работы. Базовый цикл `route → new → validate → link → score → activate` бесплатный — он покрывает 80% пользы Forgeplan.

Когда нужен `reason` / `generate` (Deep+ задачи), есть варианты по приоритету:

1. **Через Claude Code в чате** (используем твою подписку, не отдельный API):
   - попросить «сделай ADI-reasoning по PRD-NNN: 5 гипотез + deduction predictions»;
   - сохранить вывод: `forgeplan update PRD-NNN --body @/tmp/reasoning.md` или вручную в `.forgeplan/notes/`.
2. **Gemini Free Tier** — `gemini-2.0-flash` через Google AI Studio (большая бесплатная квота на день). В `config.yaml`:
   ```yaml
   llm:
     provider: gemini
     model: gemini-2.0-flash
     api_key_env: GEMINI_API_KEY
   ```
3. **Ollama локально** — бесплатно, но качество ADI ощутимо хуже Sonnet/Opus:
   ```yaml
   llm:
     provider: ollama
     model: llama3.1:8b
     base_url: http://localhost:11434
   ```
4. **Платный Anthropic API** — отдельный billing на console.anthropic.com (≈$0.05–0.10 за `reason` PRD среднего размера на Sonnet 4.6). Включать только если делаешь reason регулярно и качество критично.

Embedding-модель `bge-m3` (для `search`/`embed`) подгружается в `.forgeplan/.fastembed_cache/` при первом запуске — локально, без API. Не путать с LLM-провайдером.

### Per-workspace CLAUDE.md

Для каждого `apps/*` и `packages/*` есть свой `CLAUDE.md` со scope-специфичными правилами и Forgeplan-нюансами (depth defaults, артефакты, evidence-источники). Корневой файл — общий контракт; per-workspace — локальные специфики. Читать оба.

### Anti-patterns

- Создать PRD-stub и забить → либо заполняй, либо не создавай.
- Activate без evidence → R_eff = 0, валидатор не пропустит.
- EvidencePack без `## Structured Fields` → silent CL0 → R_eff = 0.1.
- Назвать конкретную либу/фреймворк в `## Functional Requirements` PRD (implementation leakage — это в RFC/Spec).
- Reactivate `superseded` артефакт — terminal state. Создавай новый, который supersedes текущий.
- Игнорить `Next:` hint и запускать ad-hoc команду.
- Считать LanceDB authoritative — markdown wins (`scan-import` пересоберёт).
- `forgeplan dispatch` как спавнер — он только планер. Спавнят `Agent`-блоки.
- `tech-lead.SendMessage(<specialist>, ...)` для делегирования кода — silent no-op, если specialist не запущен через `Agent`.

---

## Code-review-graph MCP — ИСПОЛЬЗОВАТЬ FIRST

**Проект имеет knowledge-граф.** Всегда пробуй `code-review-graph` MCP-инструменты **до** Grep/Glob/Read — быстрее, дешевле по токенам, даёт structural context (callers, dependents, test coverage).

| Tool | Когда |
|---|---|
| `semantic_search_nodes` | Найти функцию/класс по имени/keyword |
| `query_graph` | callers_of / callees_of / imports_of / tests_for / dependencies |
| `get_impact_radius` | Blast radius изменения |
| `detect_changes` | Risk-scored обзор правок (для review) |
| `get_review_context` | Token-efficient snippets для review |
| `get_affected_flows` | Какие execution paths затронуты |
| `get_architecture_overview` + `list_communities` | Архитектура высокого уровня |
| `refactor_tool` | Renames, поиск dead code |

Граф **авто-обновляется через хуки**. Fall back на Grep/Glob/Read только когда граф не покрывает.

---

## ForgePlan marketplace — Claude Code plugins

Регистрация маркетплейса и список включённых плагинов лежит в `.claude/settings.json` (`extraKnownMarketplaces.forgeplan` + `enabledPlugins`). Источник: `github:ForgePlan/marketplace`. Маркетплейс не вендорится в репо — это ссылка; Claude Code сам клонирует в `~/.claude/plugins/cache` при первом старте.

### Trust handshake (один раз на машину)

При первом открытии репо в Claude Code появится prompt:
1. **Trust folder** → `extraKnownMarketplaces` активируется.
2. Claude Code предлагает поставить `forgeplan` marketplace → **Yes**.
3. Затем по очереди предлагает поставить каждый из 11 включённых плагинов → **Yes to all**.
4. После — `/reload-plugins` (или рестарт). Все команды/агенты появятся в `/help` и `/agents`.

### Установлено (11 плагинов)

| Plugin | Что даёт | Namespace команд |
|---|---|---|
| `dev-toolkit` | `/audit` (4-агентский ревью), `/sprint`, `/recall`, `/report`, dev-advisor agent, safety hook | `/dev-toolkit:audit` etc. |
| `forgeplan-workflow` | `/forge-cycle`, `/forge-audit`, forge-advisor, methodology KB | `/forgeplan-workflow:forge-cycle` |
| `forgeplan-orchestra` | `/sync`, `/session` (требует Orchestra MCP `orch` — у нас не подключён, плагин активен но `/sync` не сработает) | `/forgeplan-orchestra:session` |
| `forgeplan-brownfield-pack` | C4/DDD/MADR ingest mappings + playbooks (alpha) | — (mappings, не команды) |
| `fpf` | `/fpf`, `/fpf-decompose`, `/fpf-evaluate`, `/fpf-reason` + 224-section FPF KB | `/fpf:fpf` etc. |
| `laws-of-ux` | `/ux-review`, `/ux-law`, UX-reviewer agent, auto-hint hook на `.html/.css/.jsx/.tsx/.vue` | `/laws-of-ux:ux-review` |
| `agents-core` | 11 агентов: debugger, code-reviewer, error-detective, performance-engineer, production-validator, coder, planner, researcher, reviewer, tester, tdd-london | — |
| `agents-domain` | 11 framework-специалистов: typescript-pro, frontend-developer, nextjs-developer, golang-pro, mobile-app-developer и т.д. | — |
| `agents-pro` | 21 агент: security-expert, adr-architect, ddd-domain-expert, ml-developer, ui-designer и т.д. | — |
| `agents-github` | 7 агентов: pr-manager, issue-manager, release-manager, repo-architect и т.д. | — |
| `agents-sparc` | SPARC: specification → pseudocode → architecture → refinement + sparc-orchestrator (experimental) | — |

### Известные конфликты и приоритеты

- **`code-reviewer`** существует и у нас (`.claude/agents/code-reviewer.md`) и в `agents-core`. Local agents имеют приоритет — `Agent({subagent_type: "code-reviewer"})` возьмёт наш. Если нужен plugin-вариант — обращаться по плагин-имени через `/agents` UI.
- **`forge-safety-hook.sh`**: и наш `.claude/hooks/forge-safety-hook.sh`, и `forgeplan-workflow/hooks/scripts/forge-safety-hook.sh` подписываются на `PreToolUse:Bash`. Хуки запускаются последовательно; дубль не критичен (оба только проверяют, не мутируют state). Если потом окажется тяжёлым — отключить наш локальный.
- **Safety hooks**: dev-toolkit + forgeplan-workflow + наш локальный = тройной слой проверок на `git push --force` / `rm -rf /` / `DROP TABLE`. Это features-not-bugs.
- **Slash-команды** не конфликтуют — все плагин-команды namespaced (`/<plugin>:<cmd>`). Наши `/orchestrate-*`, `/code-review`, `/quality-gate` остаются основным workflow.
- **`/audit` (dev-toolkit) vs `/code-review` (наш)**: разные роли. `/dev-toolkit:audit` — quick parallel review (logic/architecture/security/tests); наш `/code-review` — local diff или GitHub PR с привязкой к workspace conventions. Использовать оба по контексту.
- **`forgeplan-orchestra`** включён, но `/sync` не работает без Orchestra MCP server (`orch`). Плагин не ломается — просто молчит. Подключить `orch` отдельно если понадобится.

### Когда что использовать

- Forgeplan-цикл (Standard+) — `/forgeplan-workflow:forge-cycle "<task>"` как conversational обёртка над `forgeplan route → new → validate → score → activate`. Альтернатива ручному CLI/MCP.
- Архитектурные решения / разложение системы — `/fpf:fpf-decompose` или `/fpf:fpf-reason` (3+ гипотезы → ADI). Полезно для Deep+ задач без подключения LLM-провайдера в forgeplan config.
- Frontend-ревью UX-практик — `/laws-of-ux:ux-review` после landing/admin изменений (дополняет наш `landing-next-dev-reviewer` / `react-dev-reviewer`).
- Параллельный код-ревью — `/dev-toolkit:audit` как быстрый smoke (≠ замена `/code-review` или orchestrator review-цикла).
- SPARC-методология — `agents-sparc` помечен experimental; не использовать для production без явной просьбы юзера.

### Update / отключение

```bash
# Внутри Claude Code:
/plugin marketplace update forgeplan       # подтянуть новые версии плагинов
/plugin disable <name>@forgeplan           # отключить отдельный плагин
/plugin uninstall <name>@forgeplan         # совсем удалить
```

Для отключения плагина для всей команды — поставить `false` в `enabledPlugins` в `.claude/settings.json`.

---

## Session start — прогрев контекста

Что грузится автоматически:
- `~/.claude/projects/-Users-nikitafedorov-.../memory/MEMORY.md` (auto-memory с feedback rules) — **уже в контексте**, читать руками не надо.
- `CLAUDE.md` (этот файл).
- `apps/<app>/CLAUDE.md` и `packages/<pkg>/CLAUDE.md` — Claude Code их подхватывает по контексту запроса.
- `session-start-forgeplan.sh` хук — инжектит `forgeplan health` + Forgeplan-rules как additionalContext.
- `AGENTS.md` (полный справочник по хукам/орчестраторам).

| Источник | Команда | Что даёт |
|---|---|---|
| Граф (структура) | `get_architecture_overview` | Карта пакетов, communities |
| Git status | `git status` / `git diff` | Что меняется сейчас |
| Активные задачи | `tasks-manifest.json` (root) | Текущие тикеты |

**НЕ читать на старте**: `pnpm-lock.yaml`, `.code-review-graph/`, generated `styled-system/`, `**/dist`, `**/storybook-static`, `node_modules`. Только по релевантному вопросу.

«Достаточно контекста» = можешь назвать какой workspace тронут, какой стек у этого workspace, какие subagent/orchestrator подходят.

---

## Полный цикл (единственный источник истины)

```
 1. Observe:  forgeplan health                       (artifacts, blind spots)
 2. Route:    forgeplan route "<task>" → workspace + orchestrator/subagent
 3. Graph:    code-review-graph MCP first — caller/callees/tests/impact
 4. Shape:    (Standard+) forgeplan new <kind> + validate; для Deep+ — reason
 5. Branch:   git checkout develop && git pull && git checkout -b <type>/<short>
 6. Claim:    (multi-agent) forgeplan claim <ID> --ttl-minutes <N>
 7. Code:     Edit/Write — post-edit-format.js сам прогонит Biome
 8. Test:     pnpm --filter <pkg> test               (если задет тестируемый код)
 9. Type:     pnpm --filter <pkg> typecheck          (ОДИН раз — см. memory)
10. Lint:     pnpm --filter <pkg> lint               (обычно уже зелёный)
11. Review:   reviewer subagent после developer batch (ВНУТРИ orchestrator)
12. Prove:    (Standard+) forgeplan new evidence + ## Structured Fields + link + score
13. Gate:     /quality-gate --scope=<workspace>      (Biome + tsc + опц. build + knip)
14. Verify:   verification-loop skill (build/type/lint/security/diff)
15. Activate: (Standard+) forgeplan activate <ID>    (R_eff > 0 обязателен)
16. Commit:   conventional commits, body на русском, без --amend опубликованного
17. PR:       gh pr create --base develop            (body: "Refs: <ID>")
18. Release:  (multi-agent, после merge) forgeplan release <ID>
19. Sync:     обновить tasks-manifest.json / TODO если есть
```

**Tactical** (тривиально, обратимо, 1 файл): Observe → Route → Branch → Code → Commit. Без artifact, orchestrator, review, /quality-gate.

## 38 packages — tier таблица + build (post-Sprint 3.0..3.11 + Wave 6/7 enhancements per ADR-004..ADR-012)

**Wave 5 fully complete** — 13 packages total (2 Phase 1 + 3 Phase 2 + 4 Phase 3 + 4 Phase 4). Subsequent enhancement waves (no new packages, all E+/F+):
- **Sprint 3.10** (ADR-010 + Amendment 1) — Wave 5 polish + m9s integration + SessionDestroyedError relocation to `@gertsai/errors` Shared Kernel + TypedToken<T> wrapper for ProviderContext.
- **Sprint 3.11** (ADR-011 local + SPEC-016 + EVID-018/019) — m9s-example production-grade reference application (real Ollama infra + storage + AuthZ + lint migration).
- **Wave 6.2** (EVID-020) — `@gertsai/auth-openfga` apiToken plumbed end-to-end to OpenFGA SDK.
- **Wave 6.3** (ADR-012 + SPEC-017 + EVID-021) — `@gertsai/auth-openfga` multi-instance scoping via SHA-256 fingerprint cache key.
- **Wave 6.4** (commit `940bdef`) — oxlint correctness sweep + lib bump to ES2023.
- **Wave 6.5** (EVID-022) — `@gertsai/storage-core` adds `upsertDoc` primitive + capability flag.
- **Wave 7.1** (commit `53e80c0`) — audit P1 type-system polish + activate legacy drafts.
- **Wave 7.2** (commit `f791e8a`) — `@gertsai/storage-core` `upsertDoc` capability object `{ supported, preservesCreatorAudit }` + audit-aware impls in `@gertsai/entity-storage` (closes §10).

Все 38 packages используют **uniform tsup dual ESM+CJS** (Sprint 3.0 §U-1..U-6) с фиксированными scripts (`build`, `clean`, `test`, `typecheck`, `lint` — Sprint 3.0.1 F-8).

| Tier | Package | Internal deps | Source | Notes |
|---|---|---|---|---|
| 1 | `@gertsai/fsm` | — | first wave | finite state machine primitives |
| 1 | `@gertsai/fetch` | — | first wave | HTTP fetch wrapper |
| 1 | `@gertsai/collection` | — | first wave | collection utilities (subpaths) |
| 1 | `@gertsai/llm-costs` | — | first wave | LLM cost calculation |
| 1 | `@gertsai/utils` | — | first wave | generic utilities |
| 1 | `@gertsai/m9s-cache` | — | first wave | Moleculer cache adapter |
| 1 | `@gertsai/ws-rpc` | — | first wave | WebSocket RPC primitives |
| **1** | **`@gertsai/async-utils`** | — | **Sprint 3.9 W-3-9-1..10 (F)** | Zero-peer-dep: sleep + withTimeout + defer + debounce + throttle + retry (default `'full'` jitter per ADR-009 Amendment 1.2.7, CWE-409 protection) + makeCancellable per ADR-009 I-1/I-2/I-16 |
| **1** | **`@gertsai/logger-factory`** | errors (peer) | **Sprint 3.9 W-3-9-11..16 (F)** | createLogger + consoleBackend default; /pino + /winston peer-optional subpaths via createRequire; default-on REDACTION_KEYS redact per ADR-009 I-17; child frozen-copy + independent level state per Amendment 1.2.6 |
| **1** | **`@gertsai/errors`** | — | **Sprint 3.6 W-3-6-1..8 (F fresh)** | Universal error taxonomy (10 ErrorKind `as const`) + AppError<D> + 10 typed subclasses + `/http` (RFC 9457 ProblemDetails + bucket types + redaction) + `/grpc` (canonical status codes vendored) + cycle/depth guard. **Shared Kernel** for `@gertsai/*` ecosystem per ADR-006 §D §6 |
| **1** | **`@gertsai/tenant-resolver`** | errors (peer) | **Sprint 3.6 W-3-6-9..17 (F fresh)** | Composable strategy chain + 3 hardened built-in strategies (Header trustProxy, Subdomain strict-suffix, Path URL-normalised) + `/moleculer` + `/http` subpaths; **default `mode: 'strict'`** fail-closed per ADR-006 I-18 |
| **1** | **`@gertsai/config`** | api-core | **Sprint 3.2 W-1 (S shim)** | re-exports api-core/runtime/node — ADR-004 |
| **1** | **`@gertsai/tenant`** | — | **Sprint 3.2 W-2 (F fresh)** | TenantId brand + getTenantIdStrict/Optional + `/moleculer` adapter |
| **1** | **`@gertsai/otel`** | — | **Sprint 3.2 W-3 (F fresh)** | OTel SDK setup + `/moleculer` tracing; lazy peer-deps |
| **1** | **`@gertsai/pg-client`** | — (root); storage-core, query-dsl peer (`/storage`) | **Sprint 3.2 W-4 (F)** + **Sprint 3.5 W-4B-4 (A — additive `/storage` adapter)** | Root: agnostic 3-method PgClient + mockPgClient (ADR-011 I-1/I-2 unchanged). `./storage` subpath: PgStorageProvider implements IStorageProvider per ADR-005 I-3 (additive, peer-optional storage-core+query-dsl) |
| **1** | **`@gertsai/session`** | errors (peer for `*Strict` + Sprint 3.10 SessionDestroyedError) | **Sprint 3.4 W-4A-2 (F fresh)** + **Sprint 3.6 W-3-6-18..22 (E+ additive)** + **Sprint 3.10 (E+ — $-mutator throws SessionDestroyedError from `@gertsai/errors`)** | Session class + AbstractDialog + 24-value OperatorType + dataAccessUuid (Sprint 3.4) + Sprint 3.6 scoping (`tenantId/projectId/spaceId` flat tags per ADR-006 I-17) + 3 strict helpers (`getTenantStrict`/`getProjectStrict`/`getSpaceStrict` per ADR-006 I-16); Sprint 3.10: `$switchOperator`/`$setDataAccessUuid` throw `SessionDestroyedError` (Shared Kernel from `@gertsai/errors` per ADR-010 Amendment 1 §A1.1; tier discipline preserved — no peer-dep on session-guard added). |
| **1** | **`@gertsai/entity-audit`** | session, audit-primitives | **Sprint 3.4 W-4A-3 (F fresh)** + **Sprint 3.7 (E+ — re-export from audit-primitives)** | MutationMarks + UpdateActionMap + 4 builder funcs (set/update/delete/restore) — backend-agnostic Timestamp; Sprint 3.7: Timestamp/TimestampProvider/timestampToMillis/timestampFromDate re-exported from `@gertsai/audit-primitives` (deprecated own copies kept for backward compat) |
| 2 | `@gertsai/di` | utils | **enhanced Sprint 3.4 W-4A-4 (E)** | DI container + new guards/destroy/inference helpers (Orchestra orchlab/di patterns) |
| 2 | `@gertsai/flux` | collection | first wave | reactive streams |
| **2** | **`@gertsai/queue`** | — | **Sprint 3.2 W-5 (P+F)** | BullMQ wrappers + `/standalone` runner; consumed BY api-core (Sprint 3.x migration) |
| **2** | **`@gertsai/entity`** | session; entity-vue (peer; optional, only for /vue subpath) | **Sprint 3.4 W-4A-1 (F fresh)** + **Sprint 3.8 (E+ — /vue subpath becomes re-export shim per ADR-008 Decision B)** | Model + Entity + EntityWithMetadata base classes; pluggable ReactiveAdapter; `/vue` subpath delegates to `@gertsai/entity-vue` standalone; framework adapters live in `@gertsai/entity-{vue,react,solid,svelte}` per ADR-008 |
| **2** | **`@gertsai/storage-core`** | di | **Sprint 3.5 W-4B-1 (F fresh)** + **Wave 6.5 (E+ upsertDoc)** + **Wave 7.2 (E+ upsert capability object)** | Backend-agnostic IStorageProvider<Meta> interface + StorageMetadata generic + IBatchRunner/ITransactionRunner + capabilities flag + storageProviderIdentifier DI token + ListenersNotSupportedError/TransactionConflictError per ADR-005 Decision A. Wave 6.5 (EVID-022): `upsertDoc` primitive + capability flag. Wave 7.2 (commit `f791e8a`): `upsertDoc` capability is `{ supported: boolean; preservesCreatorAudit: boolean }` (boolean-pair shape per audit P1 closure §10). |
| **2** | **`@gertsai/query-dsl`** | storage-core | **Sprint 3.5 W-4B-3 (F fresh)** | Type-safe query constraints (whereField/orderBy/limit/start*/end*) compile-validated against Meta['indexed']; `./sql` subpath = compileToSql reference Postgres compiler |
| **2** | **`@gertsai/audit-primitives`** | — | **Sprint 3.7 W-3-7-18..23 (F fresh)** | Pure data layer (zero internal deps per ADR-007 I-7) — Timestamp + AuditMarks interfaces + TimestampProvider call-signature alias `() => Timestamp` (matches entity-audit shape per ADR-007 I-14) + 2 default providers (date / fixed) + 4 conversion helpers |
| **2** | **`@gertsai/entity-vue`** | entity (peer) | **Sprint 3.8 W-3-8-1..6 (F+E+)** | vueReactiveAdapter standalone Vue ReactiveAdapter; lazy `createRequire('@vue/runtime-core')` per ADR-008 Amendment 1.2.9; entity/vue subpath becomes re-export shim per ADR-008 Decision B + I-3 |
| **2** | **`@gertsai/entity-react`** | entity (peer) | **Sprint 3.8 W-3-8-7..11 (F)** | reactReactiveAdapter (Proxy + 3 traps + WeakMap subscribe + sync notify + re-entrancy guard per ADR-008 I-11..I-13) + useEntity hook (useSyncExternalStore + version snapshot per Amendment 1.2.10) |
| **2** | **`@gertsai/entity-solid`** | entity (peer) | **Sprint 3.8 W-3-8-12..16 (F)** | solidReactiveAdapter (createStore + produce per R-3) + useEntity Store accessor; module-private Symbol per I-11 |
| **2** | **`@gertsai/entity-svelte`** | entity (peer) | **Sprint 3.8 W-3-8-17..21 (F)** | svelteReactiveAdapter (Proxy + writable + 3 traps + WeakMap + re-entrancy guard) + entityStore Readable<Entity<Data>> per ADR-008 Amendment 1.1.1 |
| **2** | **`@gertsai/rest-request-manager`** | fetch + errors + async-utils + logger-factory (optional) | **Sprint 3.9 W-3-9-22..28 (F)** | RestRequestManager: retry + token-bucket rate-limiter + LRU circuit-breaker (default `maxHosts: 1000` per ADR-009 Amendment 1.2.1, CWE-770 protection) + HTTP→AppError translation per I-8; AbortError→TimeoutError per Amendment 1.2.8; Node-only (engines.node ≥22) per Amendment 1.2.10 |
| **2** | **`@gertsai/session-guard`** | session, errors (peers) | **Sprint 3.7 W-3-7-11..17 (F fresh)** | External invariant guards over `@gertsai/session`: 4 predicates (`isAuthenticated/hasOperatorType/isInTenant/isImpersonating`) + 5 dedicated errors (incl. `AuthenticationRequiredError` per ADR-007 Amendment 1.1.2 split) + 5 assertion helpers + 3 result-shape `check*` variants. `isInTenant` returns false on undefined-tenant (I-18); `isImpersonating` throws on empty UUIDs (I-19) |
| 3 | `@gertsai/core` | llm-costs | first wave | platform contracts (Workflow types, Sprint 3.1 W-1; Sprint 3.0.1 F-9 meta) |
| 3 | `@gertsai/hsm` | — | first wave | hierarchical state machines |
| **3** | **`@gertsai/entity-storage`** | storage-core, entity, entity-audit, session, di | **Sprint 3.5 W-4B-2 (F fresh)** + **Wave 7.2 (E+ audit-aware upsert impls)** | abstract BaseEntityStorageService<Meta, UpdateActionTypes> session-aware audit-stamped CRUD + soft-delete + EventEmitter (STORAGE_EVENTS) + IDestroyable; class InMemoryStorageProvider<Meta> Map-backed test fixture full-listeners support. Wave 7.2 (commit `f791e8a`): audit-aware upsert implementations consuming storage-core `{ supported, preservesCreatorAudit }` capability. |
| **3** | **`@gertsai/rpc-proxy-builder`** | api-core (peer; type-only via /contracts) | **Sprint 3.9 W-3-9-17..21 (F)** | createRpcProxy<TActionMap> + RpcTransport interface; module-private `Symbol('rpc-proxy')` brand per I-7; **3 read-only Proxy traps** (get/set→false/deleteProperty→false) per I-15 (CWE-1188 protection); unknown action throws Error per I-14 (CWE-1230 fail-open prevention); WeakMap idempotent cache |
| **4** | **`@gertsai/auth-openfga`** | core | first wave + **Wave 6.2 (E+ apiToken)** + **Wave 6.3 (E+ multi-instance scoping)** | OpenFGA ReBAC adapter. Wave 6.2 (EVID-020, commit `219502e`): apiToken plumbed end-to-end to OpenFGA SDK. Wave 6.3 (ADR-012 + SPEC-017 + EVID-021, commit `67df840`): multi-instance scoped-singletons via SHA-256 fingerprint cache key (resolves `singleton-multi-store` issue). |
| 4 | `@gertsai/api-core` | core, auth-openfga | first wave | Moleculer SDK; subpaths /contracts /moleculer /runtime/node (Sprint 2 ADR-003) |
| **4** | **`@gertsai/runtime-context`** | errors, session, tenant-resolver, di (peers); moleculer (peer-optional) | **Sprint 3.7 W-3-7-1..10 (F fresh)** + **Sprint 3.10 W-3-10-26..29a (F+ — TypedToken<T> overload)** | Per-request composition root — RequestContext + AuthContext + FeatureContext + ProviderContext + 5 dedicated errors (Sprint 3.7 per ADR-007). Sprint 3.10: `defineToken<T>` + `isTypedToken` + `TypedToken<T>` interface (required brand `[TYPED_TOKEN_BRAND]` discriminator, NO phantom field per ADR-010 Amendment 1 §I-12); ProviderContext gains overloads accepting both `symbol` and `TypedToken<T>` (declaration order: symbol first, TypedToken second); `DefaultProviderContext` extracts `.symbol` from TypedToken before `assertSymbolToken` per I-13. Module-private `Symbol(...)` brand per Sprint 3.8 I-11 reuse (CWE-1321 prevention). `/moleculer` subpath unchanged. |
| 5 | `@gertsai/api-rlr` | api-core | first wave | rate limiter / retry loop runtime (ADR-011) |

**Strategy markers** (per ADR-004 + ADR-005 + ADR-006 extensions):
- **P** = Preserve git history; **F** = Fresh code; **S** = Shim/thin re-export; **P+F** = Preserve-history core + fresh boundary; **E** = Enhancement of existing package (additive only); **A** = Additive non-breaking adapter extension.
- **F+** = Fix on existing — additive only, no breaking changes (Wave 5 ADR-006 §D §4; e.g. Sprint 3.6 polish batch).
- **E+** = Enhancement of existing package, additive only (Wave 5 ADR-006 §D §5; e.g. Sprint 3.6 session scoping).

**Что важно знать**:
- All 38 packages (14 first-wave + 5 Sprint 3.2 + 3 Sprint 3.4 + 3 Sprint 3.5 + 13 Wave 5 = 38 physical directories; `di` was enhanced in-place during Sprint 3.4, not a new package): uniform tsup dual ESM+CJS (Sprint 3.0 §U-3..U-6).
- `tspc` only used in m9s-example (typia transformer). Production packages migrated off ts-patch.
- `core` + `api-core` имеют subpath exports + typesVersions для Node10 fallback (Sprint 3.0.1 F-4).
- `tenant`, `otel`, `queue`, `entity`, `query-dsl`, `pg-client` имеют `/moleculer`, `/moleculer`, `/standalone`, `/vue`, `/sql`, `/storage` subpaths соответственно — typesVersions добавлен per Sprint 3.0.1 F-4 pattern.
- ApiController workflow internal hook keyed by `Symbol.for('@gertsai/api-core:registerWorkflow')` — never surfaces в emitted `.d.ts` (Sprint 3.0.1 F-1).
- `core/src/connectors/identity-resolver.ts` — закомментирован экспорт. См. `KNOWN-ISSUES.md` пункт 1.
- **PgStorageProvider** (Sprint 3.5 `@gertsai/pg-client/storage`) wraps existing 3-method PgClient via raw SQL (compileToSql). capabilities { listeners: false, transactions: true, batches: true }. SQLSTATE 40001/40P01 → TransactionConflictError. ADR-005 I-3 + ADR-011 I-1/I-2 preserved (root surface unchanged).

**Cross-references** (ADR-XXX — local `.forgeplan/adrs/` unless marked **Hub**):
- ADR-002 (Hex layer enforcement) — applies к `examples/m9s-example/` only; foundation libs flat utility packages OUTSIDE hex.
- ADR-003 (Platform Runtime Boundaries) — subpath patterns; new packages follow.
- ADR-004 (Foundation libs naming + extraction strategy) — rename `observe→otel`, `database→pg-client`, drop `auth-moleculer`.
- ADR-005 (storage-core architecture) — abstract IStorageProvider + pg-client as adapter.
- ADR-006/7/8/9/10 (Wave 5 Phases 1–4 + Sprint 3.10 polish closure).
- ADR-011 **(local)** + SPEC-016 + EVID-018/019 (Sprint 3.11 m9s-example production-grade reference).
- ADR-012 + SPEC-017 + EVID-021 (Wave 6.3 multi-instance scoped-singletons via SHA-256 fingerprint).
- EVID-020 (Wave 6.2 apiToken plumbing) + EVID-022 (Wave 6.5 upsertDoc primitive).
- **Hub ADR-011** (external, `~/Work/GertsHub/.forgeplan/`) — `@gertsai/pg-client` invariants I-1/I-2 (agnostic, no Prisma binding). Note: Hub-ADR-011 ID coincides with local-ADR-011 — disambiguate by prefix when citing.

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
