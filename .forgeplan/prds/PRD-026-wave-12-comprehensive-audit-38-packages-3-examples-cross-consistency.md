---
depth: standard
id: PRD-026
kind: prd
last_modified_at: 2026-05-15T16:24:23.162385+00:00
last_modified_by: claude-code/2.1.139
status: active
title: Wave 12 — comprehensive audit (38 packages + 3 examples + cross-consistency)
---

## Problem Statement

После Wave 11.D пакеты опубликованы на GitHub Packages (приватно). До public release нужно убедиться что:
1. Каждый из 38 пакетов внутренне coherent (типизация, SOLID, security, hex-layer корректность, тесты).
2. Cross-package consistency — нет дублирования, port'ы и адаптеры согласованы между пакетами, общие соглашения (error model, типы сессий, etc.) едины.
3. 3 example app'а демонстрируют patterns правильно — не диверsifyируют, не контрадиктят package contracts.

Wave 10/11 закрыли аудит на example-app level (EVID-036 / 039 / 042). Этот wave 12 расширяет аудит до **monorepo-wide coverage** — на уровень каждого пакета.

## Goals

1. **Per-package audit** — 38 пакетов, каждый получает 4-эксперт review (logic / arch / type / security baseline; performance + tests добавляются для пакетов tier ≥ 3 где это релевантно).
2. **Cross-consistency audit** — одна wave с фокусом на: error taxonomy uniformity, port/adapter naming conventions, ADR-002 hex layer compliance, ADR-003 subpath patterns, ADR-006 errors Shared Kernel correctness, typed action exports везде.
3. **Examples audit** — m9s-example backend + m9s-example-web + m9s-example-api-types, фокус на: правильность использования package patterns, no anti-patterns, hex layer compliance, real auth flow safety.
4. Каждая волна shipped как один focused PR с EVID. Финдинги ранжированы по severity (CRITICAL/HIGH/MED/LOW). CRITICAL findings блокируют next wave.

## Target Audience

- **Primary:** developers cloning monorepo для production использования — audit gives them confidence что foundation packages don't carry latent issues.
- **Secondary:** Wave 13+ contributors — audit findings становятся backlog'ом для polish work.
- **Tertiary:** будущие OSS visitors — audit chain (EVID-036 → 039 → 042 → 043+...) demonstrates engineering rigor.

## Functional Requirements

- [ ] **FR-001 — Validation wave (Wave 12.A NOW)**: `@gertsai/api-core` deep audit с 5 экспертами (logic + arch + type + security + tests). Доказывает методология работает на самом важном пакете до scale-up.
  - **Acceptance:** EVID-043 published; CRITICAL findings = 0 OR documented + actioned; score ≥ 7/10.
- [ ] **FR-002 — Tier 1 audit wave (Wave 12.B)**: 15 foundation packages grouped — `fsm fetch collection llm-costs utils m9s-cache ws-rpc config tenant otel pg-client session entity-audit errors tenant-resolver`. 4 эксперта (logic + arch + type + security), per-package quick scan + consolidated EVID.
- [ ] **FR-003 — Tier 2 audit wave (Wave 12.C)**: 12 mid-tier packages — `di flux queue entity storage-core query-dsl audit-primitives entity-vue entity-react entity-solid entity-svelte rest-request-manager`. Same 4-expert pattern.
- [ ] **FR-004 — Tier 3-5 audit wave (Wave 12.D)**: 11 application-tier packages — `core hsm entity-storage rpc-proxy-builder runtime-context session-guard async-utils logger-factory auth-openfga api-core api-rlr`. Note: api-core already audited in 12.A; counted for completeness.
- [ ] **FR-005 — Examples audit wave (Wave 12.E)**: 3 example apps — m9s-example backend + m9s-example-web + m9s-example-api-types. Focus on hex layer, auth correctness, no leakage of demo-mode shortcuts post-Wave-11.A.
- [ ] **FR-006 — Cross-consistency audit wave (Wave 12.F)**: monorepo-wide check (no per-package focus). 4 эксперта analyze: (a) error taxonomy uniformity across все packages (ADR-006), (b) port/adapter naming (ADR-002), (c) subpath patterns (ADR-003), (d) typed action exports (`defineAction` use everywhere it should be), (e) `JwtClaims` extraction success (no remaining duplicates).
- [ ] **FR-007 — Aggregate report**: один summary EVID после всех 5 audit waves — total findings count by severity, score per tier, top-10 actionable items для Wave 13 polish backlog.

## Non-Functional Requirements

**NFR-1 — Methodology**
  - Каждая wave использует `fpl-skills:audit` skill (TeamCreate + 4-6 reviewer agents in parallel + team-lead synthesis).
  - File ownership при cross-package check: каждый reviewer assigned subset of packages чтобы не overlap.
  - Severity classification: CRITICAL (security/data-loss), HIGH (correctness bugs), MED (smells), LOW (cosmetic).

**NFR-2 — Budget per wave**
  - Token budget: ~250-350k per wave (4-5 agents × ~70k each + team-lead ~30k).
  - Wall-clock: ~30-60 min per wave.
  - Files per wave: cap at 30 (skill limit). For tier waves: group of ~15 packages ≈ ~30 source files если выбирать ключевые (index.ts, главные классы).

**NFR-3 — Stop-conditions**
  - CRITICAL finding in any wave → stop subsequent waves until fix landed.
  - HIGH findings > 3 per wave → consider remediation PR before next wave.

**NFR-4 — Forgeplan discipline**
  - EVID per wave (043 для 12.A, 044 для 12.B, ..., 048 для 12.F).
  - Aggregate EVID (049) после всех waves.
  - Each EVID supersedes the previous if findings affect same target.

## Stakeholders

- **Owner:** monorepo as whole.
- **Reviewers:** ecosystem maintainers post-merge.

## Related Artifacts

- [[PRD-025]] / [[EVID-042]] — Wave 12 design (predecessor; this PRD is one of the items in PRD-025 Phase B).
- [[EVID-036]] / [[EVID-039]] — earlier audit chains (proven methodology).
- [[ADR-002]] — Hex layer.
- [[ADR-003]] — subpath patterns.
- [[ADR-006]] — `@gertsai/errors` Shared Kernel.

## Out of Scope

- Performance benchmarks — separate Wave 13 если findings указывают.
- Visual / UX audit examples-web — done в Wave 10.C separately.
- Security pentest — external concern, не in-house audit.
- npm public publish gate — отдельное решение пользователя.



