---
depth: standard
id: ADR-004
kind: adr
last_modified_at: 2026-05-05T20:25:27.307078+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-001
  relation: based_on
- target: ADR-003
  relation: refines
- target: ADR-002
  relation: informs
- target: EVID-006
  relation: informs
status: active
title: Foundation libs naming + extraction strategy (Sprint 3.2 scope redesign per audit-pre-sprint-3-2)
---

---
id: ADR-004
title: "Foundation libs naming + extraction strategy (Sprint 3.2 scope redesign per audit-pre-sprint-3-2)"
status: draft
depth: standard
valid_until: 2027-05-05
created: 2026-05-05
updated: 2026-05-05
---

# ADR-004: Foundation libs naming + extraction strategy

## Context

Audit-pre-sprint-3-2 (2026-05-05, 5 reviewers) выдал NO-GO от architect-reviewer на 3 critical scope-level findings, относящиеся к Sprint 3.2 plan «extract 6 foundation libs» (per PRD-001 FR-016..FR-020):

- **F-A-1 — `@gertsai/observe` collision**: PRD-001 FR-018 определяет `@gertsai/observe` как OTel SDK (`setupObservability(brokerOptions)`). Upstream `@gerts/observe` (`gertsai_codex/packages/observe/`) — **ClickHouse-backed LLM-observability SDK** (Trace, Generation, Score, BatchQueue, Langfuse-style). Два разных продукта под одним именем. Шипанём `@gertsai/observe@v0.2.0` любой из двух семантик — другая заперта; через 1-2 месяца после v0.2.0 GA вынуждены делать v0.3.x breaking rename.

- **F-A-2 — `@gertsai/database` semantics conflict**: PRD-001 + KNOWN-ISSUES §5 + ADR-011 (Hub) определяют `@gertsai/database` как **agnostic 3-method `PgClient` interface** (invariants I-1, I-2). Upstream `@gerts/database` — Prisma schema + 29k LOC + `@prisma/client` runtime dep — **gerts-tied schema**, явно `Out-of-Scope` per PRD-001. Импорт под этим именем re-publish'ит gerts-tied код как OSS.

- **F-A-3 — `@gertsai/auth-moleculer` transitive `@gerts/auth` drag**: Upstream `apps/auth-moleculer/package.json:30-32` hard-deps `@gerts/auth: workspace:*`. Это 19 субдиректорий (audit, connectors, crypto, device-auth, grants, jwt-keys, mfa, oidc, permissions, quota, rate-limiting, sentinel, session, sso) — explicitly deferred per ADR-007 + contributor-consent risk per PRD-001 R-9. Либо `@gertsai/auth-moleculer` shipped broken (missing peer), либо Sprint 3.2 implicitly drags `@gerts/auth` extraction в scope.

ADR-004 фиксирует scope-redesign — naming + per-package extraction strategy для Sprint 3.2 — **до** запуска SPEC-007 (Sprint 3.2 implementation checklist) и до `npm publish v0.2.0`.

## Decision

Sprint 3.2 extracts **5 foundation libraries** (was 6 в PRD-001) под пересмотренными именами, с явно маркированной per-package extraction strategy.

**Selected scope** (5 packages, replacing PRD-001 FR-016..FR-020):

| Package | Tier | Source | Strategy | Replaces PRD-001 |
|---------|------|--------|----------|---------------------|
| `@gertsai/config` | 1 | api-core/runtime/node + apps config patterns | **Shim** (re-export from existing api-core/runtime/node) **OR defer** | FR-016 |
| `@gertsai/tenant` | 1 | upstream `apps/pipeline/src/middlewares/tenant.middleware.ts` + `@gerts/auth/src/tenant/` | **Preserve-history** (P) — pure types + ctx-shape interface; sub-path `/moleculer` для adapter | FR-017 |
| `@gertsai/otel` | 1 | fresh code | **Fresh** (F) — OTel SDK setup; lazy peer-dep `@opentelemetry/*` | replaces `@gertsai/observe`; FR-018 |
| `@gertsai/pg-client` | 1 | api-rlr `PgClient` interface + adapter pattern | **Fresh** (F) — agnostic 3-method client interface; **NOT** history-preserved from upstream Prisma `@gerts/database` | replaces `@gertsai/database`; FR-019 (refined) |
| `@gertsai/queue` | 2 | upstream BullMQ wrappers + ApiController queue runtime extracted | **Preserve-history + fresh boundary** (P+F) | FR-019 |

**Dropped from Sprint 3.2 scope**:

- ❌ `@gertsai/auth-moleculer` — keeps `@gertsai/api-core/moleculer/auth/` subpath until отдельный ADR + `@gertsai/auth` extraction.
- ❌ `@gertsai/observe` (LLM-observability SDK) — deferred to a later wave under a new name (e.g. `@gertsai/llm-observe`).

**Why selected**: minimal-blast-radius name resolution (rename вместо v0.3.x breaking change post-GA), agnostic database story (preserves ADR-011 invariants), avoids 19-subdir transitive scope creep on auth.

### Per-package extraction strategy legend

- **P** = Preserve git history (`git filter-repo` from upstream).
- **F** = Fresh code (write новое, NOT history-preserved).
- **S** = Shim / thin re-export (no new code surface).
- **P+F** = Preserve-history core + fresh boundary work.
- **F+S** = Fresh code with optional shim layer.

## Alternatives Considered

| Option | Verdict | Why |
|--------|---------|-----|
| A — Ship original 6-package scope (PRD-001 unchanged) | **Rejected** | Architect NO-GO: F-A-1/F-A-2/F-A-3 force v0.3.x breaking rename within 1-2 months of v0.2.0 GA. |
| B — Drop foundation libs entirely; ship v0.2.0 only | Rejected | PRD-001 Wave 2 целевой scope — foundation libs unblock downstream `gertsai_codex` migration. Шип v0.2.0 без них = stalled migration. |
| **C — 5 packages с renamed observe→otel + database→pg-client + drop auth-moleculer** | **Chosen** | Resolves all 3 NO-GO findings; preserves Wave 2 scope; minimal collateral damage; foundation libs ship in Sprint 3.2. |
| D — 5 packages, but defer rename to v0.3.0 | Rejected | Same v0.3.x breaking change risk Option A had — only window-dressing. |

## Consequences

### Positive

- **Naming collision avoided** for v0.2.0 lifetime (1-2+ years before potential rename).
- **OSS contributor consent preserved** — no implicit `@gerts/auth` drag.
- **ADR-011 invariants preserved** — `@gertsai/pg-client` is agnostic by design (no Prisma binding).
- **Sprint 3.2 scope compresses 6→5** — ~20% capacity freed для quality (testing, docs, polish).
- **Legacy upstream `@gerts/observe` ClickHouse SDK** retains future extraction path under unconflicted name (`@gertsai/llm-observe` or similar — TBD in отдельный ADR if/when extraction triggered).

### Negative (trade-offs)

- **`@gertsai/config` extraction may be deferred** — if shim path chosen, no new package; PRD-001 FR-016 partially fulfilled через existing `@gertsai/api-core/runtime/node` subpath. Documentation in CLAUDE.md updated accordingly.
- **Two upstream packages renamed** (observe, database) — extraction is no-history (fresh code) for `pg-client` and `otel`; commit history continuity не сохраняется. Acceptable: upstream code не подходит anyway (Prisma vs agnostic; Langfuse vs OTel).
- **`@gertsai/auth-moleculer` deferred** — m9s-example продолжает использовать `api-core/moleculer/auth/` subpath; downstream consumers не получают standalone auth lib в Sprint 3.2. Acceptable: PRD-001 FR-020 уже содержал fallback "(or subpath under api-core/moleculer/auth)".

### Risks

- **R-1**: Architect F-A-4 — `@gertsai/config` overlap с api-core/runtime/node — if "shim" chosen, the package becomes a thin re-export only. Mitigation: SPEC-007 explicitly выбирает shim vs fresh fork; if shim — document deprecation timeline в README.
- **R-2**: Architect F-A-5 — `@gertsai/queue` boundary unclear vs ApiController BullMQ runtime — extraction direction matters. Mitigation: SPEC-007 specifies import direction (`@gertsai/queue` consumed BY api-core/moleculer, not vice versa).
- **R-3**: `@gertsai/llm-observe` (renamed-upstream-observe-SDK) future extraction — cannot reuse `@gertsai/observe` name (now claimed by OTel SDK). Documented limitation; future ADR for that wave.
- **R-4**: Tier table in `CLAUDE.md` must update atomically with first Sprint 3.2 commit (`packages/*` tier 1-5 grouping). Mitigation: SPEC-007 W-1 makes CLAUDE.md update part of Phase 1.
- **R-5**: PRD-001 FR-016..FR-020 текстов теперь partially superseded — readers могут confuse. Mitigation: PRD-001 amendment 2026-05-05 (separate commit) adds explicit "Sprint 3.2 scope redesigned per ADR-004" pointer.

## Invariants

I-1: Foundation libs не могут заимствовать имена upstream packages, у которых semantics не align с `@gertsai/*` Wave 2 цели. Naming-conflict-resolution требует separate ADR before publish.

I-2: Per-package extraction strategy MUST be marked (P/F/S/P+F/F+S) в SPEC прежде чем Build phase starts. Mixed strategies (e.g. P+F) document boundary explicitly: "history preserved для X файлов; fresh код для Y."

I-3: `@gertsai/pg-client` остаётся agnostic — interface 3 методов max (per ADR-011 I-1, I-2). NO Prisma/Drizzle/raw-pg dependency in package.json `dependencies` or `peerDependencies`. Adapters to specific clients are user responsibility.

I-4: `@gertsai/otel` lazy-loads `@opentelemetry/*` SDKs — peer-dep optional, не required. Consumers без OTel needs не платят за package weight.

I-5: `@gertsai/auth-moleculer` extraction остаётся deferred до отдельного ADR (post-`@gertsai/auth` ADR), не Sprint 3.2.

I-6: `@gertsai/observe` name reserved для OTel SDK (per FR-018). Upstream LLM-observability SDK (Trace/Generation/Score) extraction (когда понадобится) должна использовать другое имя.

## Evidence Requirements

- E-1: Sprint 3.2 SPEC-007 (foundation libs Wave 1 implementation checklist) активирован с per-package P/F/S marker и ссылкой на ADR-004.
- E-2: PRD-001 amendment 2026-05-05 содержит явное cross-reference на ADR-004 в FR-016..FR-020 пунктах.
- E-3: `examples/m9s-example/package.json` не содержит ссылок на `@gertsai/observe`, `@gertsai/database`, `@gertsai/auth-moleculer` после Sprint 3.2 ship — все imports переключены на новые имена ИЛИ subpath fallback.
- E-4: `CLAUDE.md` tier table обновлён с 5 новыми packages (по чартам ADR-004 + per-package strategy notes) atomically with Sprint 3.2 W-1 commit.
- E-5: `pnpm pack --dry-run` для каждого нового package показывает 0 leak (test artifacts, .env, /src/*.ts) — preserves Sprint 3.0 EVID-004 baseline tarball hygiene.

## Implementation Plan

### Phase 0: Pre-conditions (this ADR's activation)
- [ ] **0.1** ADR-004 created and activated (this artifact).
- [ ] **0.2** PRD-001 amendment 2026-05-05 commits cross-ref ADR-004 in FR-016..FR-020.

### Phase 1: Sprint 3.2 Shape
- [ ] **1.1** SPEC-007 (Sprint 3.2 — foundation libs Wave 1) draft created.
- [ ] **1.2** SPEC-007 specifies per-package strategy (P/F/S), import direction для queue (R-2), shim-vs-fresh decision для config (R-1).
- [ ] **1.3** SPEC-007 validated (forgeplan_validate, forgeplan_review).
- [ ] **1.4** SPEC-007 activated.

### Phase 2: Sprint 3.2 Build
- [ ] **2.1** AgentTeams 5 workers (один per package OR clustering by tier).
- [ ] **2.2** CLAUDE.md tier table updated в W-1 commit.
- [ ] **2.3** `examples/m9s-example` migrated к новым именам (где applicable).

### Phase 3: Verify + Evidence
- [ ] **3.1** Full repo verify (build/test/typecheck/lint/publint/depcruise/attw).
- [ ] **3.2** `pnpm pack --dry-run` для каждого нового пакета → 0 leak.
- [ ] **3.3** EVID-007 (Sprint 3.2 complete) created с structured fields.
- [ ] **3.4** EVID-007 linked + SPEC-007 activated.

## Admissibility

NOT admissible под этим ADR:

- NOT: Импортировать upstream `@gerts/observe` ClickHouse SDK код в `@gertsai/observe` namespace — name теперь reserved для OTel SDK (per FR-018 + I-6).
- NOT: Шипить `@gertsai/database` с Prisma зависимостью (peer/runtime). Agnostic only (I-3).
- NOT: Добавлять `@gertsai/auth-moleculer` package в Sprint 3.2 scope (I-5).
- NOT: Использовать P (preserve-history) extraction для `@gertsai/pg-client` или `@gertsai/otel` — fresh code only.
- NOT: Шипить пакет без README + CHANGELOG + LICENSE Apache 2.0 + SPDX header per source file (NFR-009, NFR-010).

## Rollback Plan

**Triggers** (когда откатывать ADR-004):

- Если Sprint 3.2 SPEC-007 reveals что rename `observe→otel` или `database→pg-client` ломает downstream gertsai_codex apps консьюмеров critical путь, и cost migration > cost of v0.3.x breaking change later.
- Если `@gertsai/auth-moleculer` deferral блокирует Wave 2 GA milestone из-за external partner request.

**Steps** (шаги отката):

1. Открыть amendment к ADR-004 с motivation статусом.
2. Если rename revert needed: SPEC-007 W-items rename `@gertsai/otel`→`@gertsai/observe` (or `pg-client`→`database`). Tier table update.
3. Если `@gertsai/auth-moleculer` reinstated: separate ADR-005 для `@gertsai/auth` extraction strategy + transitive `@gerts/auth` minimum-viable subset.

**Blast Radius**: medium. Rename touches 5 package.json + CLAUDE.md tier + downstream import paths in m9s-example + future consumer migrations. No data migration risk (foundation libs are stateless).

## AI Guidance

> Правила для AI-агентов при работе с ADR-004:

- **Use new names** in any new code: `@gertsai/otel`, `@gertsai/pg-client`. NEVER `@gertsai/observe` or `@gertsai/database` для NEW work.
- **For LLM-observability задачи**: ask user to confirm package name — это **отдельный wave** под новым именем (e.g. `@gertsai/llm-observe`), НЕ `@gertsai/observe`.
- **For auth code**: keep changes within `@gertsai/api-core/moleculer/auth/` subpath или `@gertsai/auth-openfga`. NO standalone `@gertsai/auth-moleculer` package work.
- **For tenant**: `@gertsai/tenant` carries pure types + ctx-shape interface. Adapter logic (Moleculer Context bridging) goes в `@gertsai/tenant/moleculer` subpath, NOT root.
- **For pg-client**: keep agnostic. NO Prisma imports. Test fixtures may use Drizzle/raw-pg/Prisma but those go в test files, not source.
- **If task conflicts with ADR-004 invariants**: STOP, raise to user, suggest amendment vs new ADR.

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-001 (Wave 2 — Clean Library Platform) | PRD | based_on (refines FR-016..FR-020 scope) |
| ADR-003 (Platform Runtime Boundaries) | ADR | refines (foundation libs follow same neutral-types + adapter pattern) |
| ADR-002 (Hex layer enforcement) | ADR | informs (foundation libs опционально hex-enforced — see F-A-8) |
| EVID-006 (Sprint 3.0.1 complete) | Evidence | informs (type-system + DX foundation для Sprint 3.2) |
| audit-pre-sprint-3-2 (5 reviewers) | external | based_on (architect F-A-1, F-A-2, F-A-3 — drives this ADR) |

> **Next step**: Activate ADR-004 → PRD-001 amendment 2026-05-05 cross-references → SPEC-007 (Sprint 3.2 Shape).










