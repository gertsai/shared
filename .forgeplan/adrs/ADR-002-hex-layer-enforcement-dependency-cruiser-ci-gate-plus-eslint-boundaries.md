---
depth: standard
id: ADR-002
kind: adr
last_modified_at: 2026-05-05T07:02:16.953724+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-001
  relation: based_on
- target: ADR-001
  relation: informs
status: active
title: Hex layer enforcement — dependency-cruiser CI gate plus ESLint boundaries
---

---
id: ADR-002
title: "Hex layer enforcement — dependency-cruiser CI gate plus ESLint boundaries"
status: proposed
depth: standard
valid_until: 2027-05-05
prd_ref: PRD-001
created: 2026-05-05
updated: 2026-05-05
---

# ADR-002: Hex layer enforcement — dependency-cruiser CI gate + ESLint boundaries

## Context

m9s-example уже описывает hexagonal layers: `domain → application → infrastructure → composition → mol-services → services → lib`. Memory recall (`gerts_shared` bank) фиксирует layer rules:

- `domain` ⊂ stdlib + `@gertsai/core` types
- `application` ⊂ `domain` only
- `infrastructure` ⊂ `domain/ports` + `@gertsai/*`
- `services` ⊂ `application` + `infrastructure` + `lib`
- `lib` ⊂ `@gertsai/api-core` wrappers
- `composition` ⊂ собирает всё (composition root)
- `mol-services` ⊂ только Moleculer service shape

**Однако rules нигде не enforced**: они живут в memory bank + JSDoc комментариях, не в коде. Через 6 месяцев без gate'а правила протекут (классический antipattern: разработчик в `services/ingest/lifecycle.ts` импортит напрямую из `infrastructure/memory-document.store.ts` минуя composition root). Это уже потенциально ослабит m9s-example как reference.

PRD-001 (Wave 2, FR-016/017) фиксирует требование автоматизированного enforcement. User decision (development session 2026-05-05, развилка C): «выбрать то, что реально даёт пользу, надёжность, удобство». Этот ADR закрывает выбор формально.

## Decision

**Selected**: **C-Hybrid** — двухуровневое enforcement:

1. **CI gate (hard)**: `dependency-cruiser` ≥17 в job `lint:depcruise` фейлит билд при нарушении layer rules. Single source of truth: `.dependency-cruiser.cjs` per package (или shared базовый config через `@gertsai/depcruise-config-hex`).
2. **IDE feedback (soft)**: `eslint-plugin-boundaries` в `.eslintrc` даёт immediate warning при наборе кода. Конфиг publishedся как `@gertsai/eslint-config-hex` с теми же правилами, что и dependency-cruiser (sync через generator или ручная sync-проверка в CI).

**Why Selected**:

1. **Польза**: разработчик видит violation в редакторе сразу (ESLint), не ждёт PR review. Снижение цены ошибки в ~10 раз (сразу vs. через час+).
2. **Надёжность**: `dependency-cruiser` нельзя обойти через `// eslint-disable` — это отдельный CLI tool, проверяет dep-граф, не AST. Hard gate в CI = нельзя замержить нарушение.
3. **Удобство**: один концепт правил для разработчика; ESLint и CI говорят одно и то же. Конфиг живёт в shared-пакете, обновляется централизованно.
4. **Цена**: ~1 день разовой настройки + maintenance ≈ 0 (правила меняются редко, package update — auto).

## Alternatives Considered

### Option C1 — ESLint-only

**Description**: использовать только `eslint-plugin-boundaries`. Запуск в IDE + в CI как часть обычного `lint`.

**Pros**:
- Один tool, один config (.eslintrc).
- Нативная интеграция с TypeScript.
- Низкий setup overhead.

**Cons**:
- **Обходится через `// eslint-disable-next-line`**. Любой PR может молча отключить правило в одной строке.
- ESLint работает на AST одного файла; layer rules — это межфайловые dep-rules. ESLint plugins пытаются эмулировать через `import/no-restricted-paths`, но это не настоящий dep-graph analysis.
- Нет visualization графа.

### Option C2 — dependency-cruiser-only (CI gate)

**Description**: только hard gate в CI, без IDE feedback.

**Pros**:
- Невозможно обойти.
- Полный dep-graph analysis (то, для чего инструмент создан).
- Visualization out-of-box (`dependency-cruiser --output-type dot`).
- Pre-commit hook возможен (но добавляет ~5-10 сек).

**Cons**:
- Разработчик узнаёт о violation только при PR push'е (worst-case через час+ работы).
- Нет real-time feedback — frustrating UX.

### Option C3 — Doc-only (status quo)

**Description**: оставить layer rules в памяти/CLAUDE.md/комментариях.

**Pros**:
- Zero setup.
- Никакого CI overhead.

**Cons**:
- Через 3-6 месяцев правила протекут (доказано: m9s-example уже имеет правила только в memory recall, не в коде).
- Code review загружено layer-checking → ревьюеры пропускают, или PR'ы блокируются на subjective discussions.

### Option C4 — Custom AST scanner

**Description**: написать свой scanner на ts-morph для проверки layer rules.

**Pros**:
- Полный контроль.
- Можно встроить в `tsc` build.

**Cons**:
- ~1-2 недели на implement + maintenance.
- Re-inventing dependency-cruiser.
- Шанс багов в нашем сканере >> у production-tested tool.

## Trade-off Analysis

| Критерий | C1 (ESLint-only) | C2 (dep-cruiser only) | **C-Hybrid (this)** | C3 (doc-only) | C4 (custom) |
|----------|-------------------|------------------------|----------------------|---------------|--------------|
| Невозможно обойти | ★★ (eslint-disable) | ★★★★★ | ★★★★★ (CI) + ★★ (IDE) | ★ | ★★★★ |
| Real-time feedback | ★★★★★ | ★ | ★★★★★ | ★ | ★★★ |
| Setup cost | ★★★★★ | ★★★★ | ★★★★ | ★★★★★ | ★★ |
| Maintenance cost | ★★★★ | ★★★★ | ★★★★ | ★★★★★ | ★★ |
| Drift через 6 мес | ★★ | ★★★★ | ★★★★★ | ★ | ★★★★ |
| Visualization | ★ | ★★★★★ | ★★★★★ | ★ | depends |
| Single source of truth | ★★★★★ | ★★★★ | ★★★ (sync 2 configs) | ★★ | ★★★★ |
| **Total** | **22** | **27** | **30** | **18** | **20** |

**Победитель**: **C-Hybrid**.

### ADI Reasoning

**Hypotheses**:
- H1: Один gate (только CI или только IDE) недостаточен для долгосрочной надёжности.
- H2: ESLint-only достаточен, потому что разработчики дисциплинированы.
- H3: Гибрид CI+IDE даёт оба преимущества: real-time UX + impossible-to-bypass gate.

**Evidence**:
- H1 partial confirm: m9s-example без gate уже дрейфует (правила в memory only, в коде нет). Production-doc-only fails over time.
- H2 refuted: `// eslint-disable` — стандартный паттерн обхода в OSS контрибуциях. Невозможно ожидать дисциплину от external contributors.
- H3 confirmed: одна и та же rule в двух tools = redundant safety без значимого overhead.

**Conclusion**: H3 confirmed.

## Consequences

### Positive

- Layer rules стабильны через любое количество PR/contributors.
- IDE warnings ускоряют developer feedback в ~10x.
- Code review освобождается от layer-checking → ревьюеры фокусируются на business logic.
- Visualization (`gerts mod graph` в Wave 4) использует тот же dep-cruiser output — synergy.

### Negative (trade-offs)

- Двойной config: `.dependency-cruiser.cjs` + `.eslintrc`. Mitigated через shared packages (`@gertsai/depcruise-config-hex`, `@gertsai/eslint-config-hex`) и CI sync-check.
- CI время растёт на ~10-30 сек (`lint:depcruise` job).
- Разработчик должен установить ESLint extension в IDE (но это уже стандарт).

### Risks

- **R-1**: Правила слишком strict, blocking legit refactor. **Mitigation**: warning-only mode для первых 2 weeks (см. Implementation Plan); explicit annotation `// depcruise-disable-next-line layer-violation -- reason: ...` с audit-trail.
- **R-2**: Sync drift между ESLint config и dep-cruiser config. **Mitigation**: один common-rules файл в `@gertsai/depcruise-config-hex/rules.json`, оба tools читают из него; CI test проверяет parity.
- **R-3**: dependency-cruiser breaking change в minor. **Mitigation**: pin major version, integration test в shared CI.

## Invariants

- **I-1**: Любой PR в `gertsai/shared` или Hub проходит `lint:depcruise` job до merge. Branch protection enforced.
- **I-2**: Layer rules — single source of truth: `@gertsai/depcruise-config-hex/rules.cjs`. ESLint config либо importит правила из этого пакета, либо в CI parity-check фейлится.
- **I-3**: Annotation для bypass (`// depcruise-disable-next-line layer-violation`) допустима только с reason; audit-script регулярно собирает все annotations и репортит counts.
- **I-4**: Layer definition (что есть domain/application/etc.) фиксируется в этом ADR. Изменение → новый ADR amendment.
- **I-5**: Hex enforcement применяется к: `examples/m9s-example/`, всем future hex-based packages. Foundation utility packages (`fsm`, `utils`, `fetch`, etc.) hex не enforce — у них нет hex layout.

## Layer Definition (canonical)

```
┌────────────────────────────────────────────────────────────────────┐
│ composition/   ← composition root: знает все слои; читает env     │
│  ↑                                                                  │
│ mol-services/  ← Moleculer ServiceSchema; thin transport adapter   │
│  ↑                                                                  │
│ services/      ← lifecycle, queue handlers, channel handlers       │
│  ↑              wires application + infrastructure через ctx       │
│ lib/           ← @gertsai/api-core wrappers (controller, etc.)     │
│                                                                     │
│ application/   ← use cases, application services; ports = domain   │
│  ↑                                                                  │
│ domain/        ← entities, value objects, ports (interfaces)        │
│                  zero deps на framework/IO/transport                │
│                                                                     │
│ infrastructure/ ← outbound adapter implementations                 │
│                  implements domain/ports/* через @gertsai/*         │
└────────────────────────────────────────────────────────────────────┘
```

**Allowed dependencies (from → to)**:

| From ↓ / To → | domain | application | infrastructure | services | lib | mol-services | composition |
|---------------|--------|-------------|-----------------|----------|-----|---------------|-------------|
| **domain**          | ✅ self | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **application**     | ✅ | ✅ self | ❌ | ❌ | ❌ | ❌ | ❌ |
| **infrastructure**  | ✅ (ports only) | ❌ | ✅ self | ❌ | ❌ | ❌ | ❌ |
| **services**        | ❌ direct | ✅ | ✅ via ctx only | ✅ self | ✅ | ❌ | ✅ (composition imports allowed) |
| **lib**             | ❌ | ❌ | ❌ | ❌ | ✅ self | ❌ | ❌ |
| **mol-services**    | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ self | ❌ |
| **composition**     | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ self |

**Allowed external imports (`@gertsai/*` and other npm)**:

- `domain/`: TS stdlib only + `@gertsai/core` types only (no runtime).
- `application/`: TS stdlib only + `@gertsai/core` types.
- `infrastructure/`: any `@gertsai/*` runtime + 3rd-party clients.
- `services/`, `lib/`, `mol-services/`, `composition/`: any `@gertsai/*` + Moleculer.

## Evidence Requirements

- **E-1**: `.dependency-cruiser.cjs` создан в `examples/m9s-example/`, проходит на текущем коде m9s-example без violations (baseline проверка).
- **E-2**: PR test (synthetic): добавить violating import в `services/ingest/lifecycle.ts` → CI должен fail.
- **E-3**: ESLint extension в IDE даёт red squiggle на этой же violation в течение ≤1 секунды.
- **E-4**: Audit script `scripts/audit-depcruise-bypasses.sh` показывает count = 0 в первые 3 месяца.
- **E-5**: `lint:depcruise` CI job время ≤30 сек (per NFR-012 PRD-001).

## Valid Until

`2027-05-05` (1 год).

**Refresh Triggers**:
- ≥3 разработчика жалуются на ложные срабатывания за квартал.
- dependency-cruiser deprecated / unmaintained.
- ESLint flat-config форсит миграцию (правила могут потерять структуру).
- TypeScript native dep-cruiser equivalent shipped.

## Pre-conditions

- [x] PRD-001 одобрен MUST validation
- [x] User explicit decision: "наиболее полезное/надёжное/удобное" → C-Hybrid (development session 2026-05-05)
- [ ] ADR-001 (Module composition framework) — параллельная работа

## Post-conditions

- [ ] `@gertsai/depcruise-config-hex` package скелет создан
- [ ] `@gertsai/eslint-config-hex` package скелет создан
- [ ] m9s-example имеет `.dependency-cruiser.cjs` + `.eslintrc.cjs` импортирующие shared config
- [ ] CI workflow `.github/workflows/ci.yml` содержит `lint:depcruise` job
- [ ] Branch protection обновлён: `lint:depcruise` required check

## Admissibility

- **NOT**: разрешать `// depcruise-disable` без reason (нарушает I-3).
- **NOT**: расходящиеся правила между ESLint и dep-cruiser (нарушает I-2).
- **NOT**: применять hex enforcement к `packages/` foundation utilities — они не hex-shaped (нарушает I-5).
- **NOT**: добавлять new layer (например, "service-layer-mixin/") без amendment ADR-002.

## Rollback Plan

**Triggers**:
- ≥10 PR заблокированы false-positive violations за месяц.
- dependency-cruiser CVE / security issue.
- Boot/CI время > 60 сек (превышает 2× NFR-012).

**Steps**:
1. Switch dep-cruiser на warning-only mode (no exit-code-fail) на 1 неделю.
2. Survey разработчиков: что не работает.
3. Если pivot: revert к C2 (dep-cruiser only, без ESLint) или C1 (ESLint only).
4. Document в new EVID + amendment ADR-002.

**Blast Radius**: малый — отключение enforcement не ломает код. m9s-example продолжает работать; правила остаются в памяти/CLAUDE.md.

## Affected Files

- `.forgeplan/adrs/ADR-002-*` (этот)
- `packages/depcruise-config-hex/**` (создаётся в Wave 2)
- `packages/eslint-config-hex/**` (создаётся в Wave 2)
- `examples/m9s-example/.dependency-cruiser.cjs` (создаётся)
- `examples/m9s-example/.eslintrc.cjs` (создаётся)
- `.github/workflows/ci.yml` (добавить `lint:depcruise` job)
- `CONTRIBUTING.md` (добавить раздел про hex layers + bypass policy)

## AI Guidance

- **При создании нового hex package**: copy `.dependency-cruiser.cjs` template из `@gertsai/depcruise-config-hex/example/`.
- **Если dep-cruiser ругается на legit рефактор**: НЕ добавлять `// depcruise-disable` молча. Открыть discussion в PR — может быть, правило надо обновить через ADR amendment.
- **При добавлении нового слоя** (`service-mixin/`, `worker-driver/`, etc.): требуется ADR amendment, не пометка в PR.
- **При обновлении dep-cruiser major**: запустить full repo lint в CI на форке, проверить нет ли новых false-positives.

## Implementation Plan

### Phase 0: Decision (this ADR)

- [x] **0.1** ADR-002 (this) — fixate C-Hybrid

### Phase 1: Tooling (Wave 2 Phase 1)

- [ ] **1.1** `packages/depcruise-config-hex/` — shared dep-cruiser config + rules JSON
- [ ] **1.2** `packages/eslint-config-hex/` — ESLint flat-config importing same rules
- [ ] **1.3** Sync-check script: `pnpm hex:check-config-parity` (CI job)

### Phase 2: m9s-example baseline

- [ ] **2.1** `examples/m9s-example/.dependency-cruiser.cjs` extends `@gertsai/depcruise-config-hex`
- [ ] **2.2** `examples/m9s-example/.eslintrc.cjs` extends `@gertsai/eslint-config-hex`
- [ ] **2.3** Run dep-cruiser → expect green (current code complies)

### Phase 3: Enforcement enable

- [ ] **3.1** `.github/workflows/ci.yml` adds `lint:depcruise` job — initially warning-only (2 недели)
- [ ] **3.2** After 2 недели + zero false positives: switch to fail-on-violation
- [ ] **3.3** Branch protection: add `lint:depcruise` as required check

### Phase 4: Audit + tooling

- [ ] **4.1** `scripts/audit-depcruise-bypasses.sh` собирает counts annotations
- [ ] **4.2** Quarterly review bypass usage; high count → revisit rules
- [ ] **4.3** `gerts mod graph` (Wave 4) использует dep-cruiser output для visualization

## Related Artifacts

| Artifact | Type | Relation |
|---|---|---|
| PRD-001 | PRD | based_on |
| ADR-001 (Module composition framework) | ADR | informs (synergy: hex layers + yaml composition) |
| GertsHub RFC-004 (Moleculer Customization Patterns) | RFC (external) | informs (service template имеет неявные layer rules) |
| RFC-001 shared (gerts-module.yaml schema) | RFC | informs (schema validates module имеет hex layout) |
| RFC-002 shared (module-loader runtime) | RFC | informs |

> **Next step**: Create RFC-001 (gerts-module.yaml schema), затем RFC-002 (module-loader runtime).






