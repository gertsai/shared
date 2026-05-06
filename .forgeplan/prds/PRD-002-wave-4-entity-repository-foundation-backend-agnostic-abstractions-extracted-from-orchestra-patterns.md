---
depth: standard
id: PRD-002
kind: prd
last_modified_at: 2026-05-05T21:17:38.814424+00:00
last_modified_by: claude-code/2.1.128
links:
- target: PRD-001
  relation: refines
- target: ADR-005
  relation: based_on
status: active
title: Wave 4 — Entity/Repository Foundation (backend-agnostic abstractions extracted from Orchestra patterns)
---

# PRD-002: Wave 4 — Entity/Repository Foundation

## Vision

`gertsai/shared` приобретает **production-ready entity / session / repository foundation** — набор backend-agnostic пакетов, на которых можно собрать любой Moleculer/Node бэкенд, AI pipeline, OSS приложение в стиле Orchestra (multi-platform, session-aware, optimistic UI, audit-trailed, soft-delete-friendly), но **без привязки к конкретному backend (Firestore, SQL, NoSQL — любой)**.

Wave 4 — это transplant **архитектурного подхода** Orchestra, не её конкретных решений хранения. Любое приложение получает: optimistic-mutation-friendly entity base classes, session с identity scoping (operatorUuid + dataAccessUuid), audit trail с soft-delete, abstract storage interface с pluggable backends. Существующий `@gertsai/pg-client` (3-method agnostic interface) становится одним из adapters — additive, без breaking changes.

## Problem

`gertsai/shared` v0.2.0 имеет 19 packages: API contracts, runtime, LLM cost, queue, OTel, tenant, pg-client. **Чего не хватает** для построения "Orchestra-style" application stack:

1. **Entity layer**: developer самостоятельно изобретает базовый класс для domain-моделей (User, Project, Doc, Order…) — оптимистичные мутации, lifecycle hooks, metadata (флаг "ещё не сохранено" для optimistic UI, флаг "устарело" для cache invalidation), типизированные UID, EventEmitter integration. Приходится копировать pattern из существующих проектов или писать с нуля. Inconsistency между проектами гарантирована.

2. **Session / identity context**: operatorUuid (кто вызывает) + dataAccessUuid (от чьего имени смотрим данные) — критично для AI agent acting on behalf of user, для multi-platform apps (web/iOS/Android/electron/API/AI/bot/MCP), для impersonation flows. Сейчас разработчик инжектит контекст ad-hoc — drift гарантирован.

3. **Audit / soft-delete**: created_at/by/platform, updated_at/by/platform, deleted_at/by/platform + extensible update_action — стандартный DDD pattern. Сейчас каждое приложение пере-изобретает builder functions + типы. Soft-delete без extracted lib превращается в hard-delete по ошибке.

4. **Storage abstraction**: уже есть `@gertsai/pg-client` (3-method agnostic interface). Но нет DI-based provider pattern + listener subscriptions (real-time UI) + transactions/batches abstractions, которые позволили бы написать repository **один раз** и поддерживать любой backend.

5. **Repository base class**: BaseEntityStorageService<Meta> pattern — wraps storage provider, session-aware mutation builders, default CRUD + soft-delete, EventEmitter notifications. Без него каждый repository в проекте — копипаст boilerplate'а. Нет single source of truth для repository-pattern API.

6. **Type-safe queries**: compile-time проверка where/orderBy/limit против схемы entity. Сейчас runtime errors на typo в field names.

**Impact**:
- Любое gertsai-style приложение переизобретает entity base + session + audit + repository scaffolding (~500-1000 LOC × проект).
- Inconsistency между gertsai_codex, GertsHub, external OSS adopters неизбежна — каждый делает свой Entity + Session.
- Нельзя написать переносимый repository: написал на pg-client → не работает с другим backend. Написал на Firestore → не работает с pg-client.
- AI agent scenarios страдают особенно: dataAccessUuid (агент действует от имени пользователя) — Orchestra решила, остальные приложения переизобретают или ломают tenant isolation.
- Type safety на queries отсутствует — typo в field name = runtime bug.

## Target Users

| Персона | Описание | Боль без Wave 4 |
|---------|----------|------------------|
| **Backend application developer** | Строит бэкенд поверх @gertsai/* | Изобретает entity classes, session shape, audit fields, repository pattern. Каждый раз. |
| **AI agent author** | Делает агентов, действующих от имени users | Identity scoping (operator vs dataAccess) не стандартизован — security holes. |
| **Multi-tenant SaaS author** | Multi-tenant backend с строгой isolation | @gertsai/tenant есть, но без session/operator context — incomplete picture. |
| **OSS reader / contributor** | Читает m9s-example как reference | Не видит canonical "build any app" stack — пример workflow + ingest only. |
| **Maintainer (мы)** | Развиваем foundation | Каждый downstream проект ломает наши patterns по-своему. |

## Differentiators (после Wave 4)

- **One repository, any backend** — @gertsai/pg-client adapter, future Firestore adapter, in-memory test fixture — все через один IStorageProvider interface.
- **Session-aware mutations**: builder functions автоматически заполняют created_by_uuid, updated_at, created_by_platform. Developer пишет `userRepo.set(user)`, а не `{ ...user, created_at: now(), created_by_uuid: ctx.session.operatorUuid, ... }`.
- **Optimistic UI ready**: entity flag "ещё не сохранено" + markStaled() для cache invalidation — pattern, который любой UI framework может потреблять.
- **AI agent identity scoping** baked in: dataAccessUuid отделён от operatorUuid, агент видит только то, что разрешено пользователю — без отдельной auth library.
- **Type-safe queries**: compile-time проверка where/orderBy/limit против схемы entity.

## Goals

- **G-1**: Все 7 Wave 4 packages backend-agnostic — 0 hard imports конкретных backend SDK или UI framework runtime (no Firebase, no Vue runtime).
- **G-2**: @gertsai/pg-client получает adapter additive — existing 3-method interface unchanged.
- **G-3**: Sample application: write one repository subclass, swap between pg-client adapter и in-memory adapter — все tests pass без code change в repository.
- **G-4**: Reactivity layer pluggable — default plain-object impl works без UI framework runtime; optional UI framework adapter в subpath.
- **G-5**: m9s-example optionally migrates one entity к новому foundation (reference / docs target, не blocker).

## Non-Goals

- НЕ extract concrete Firestore impl в Wave 4 — future wave когда будет external demand.
- НЕ extract Orchestra business entities (Spaces/Chats/Messages) — domain-specific.
- НЕ extract Orchestra-specific enums (ChatType, UserType) — domain-specific.
- НЕ ship migration tooling (schema migrations) — отдельный package позже.
- НЕ ship multi-master replication — отдельный wave.
- НЕ менять @gertsai/pg-client 3-method core interface (only additive adapter).

## Scope

### Sprint 3.4 (Wave 4A — pure abstractions, no storage):

| Package | Tier | Strategy | Effort | Source |
|---------|------|----------|--------|--------|
| @gertsai/entity | 1 | F (fresh, mirroring upstream Entity) | 8h | upstream entity base |
| @gertsai/session | 1 | F (fresh, mirroring upstream Session) | 6h | upstream session class |
| @gertsai/entity-audit | 1 | F (fresh, mirroring upstream meta builders) | 4h | upstream audit/meta |
| @gertsai/di | 2 | E (enhance existing) | 5h | upstream DI improvements |

### Sprint 3.5 (Wave 4B — storage layer):

| Package | Tier | Strategy | Effort | Source |
|---------|------|----------|--------|--------|
| @gertsai/storage-core | 2 | F (fresh interface) | 10h | upstream storage interface |
| @gertsai/entity-storage | 3 | F (fresh, mirroring upstream BaseEntityStorageService) | 10h | upstream entity-storage service |
| @gertsai/query-dsl | 2 | F (fresh) | 8h | upstream query constraints |

**Refactor**: @gertsai/pg-client gets additive adapter (PgStorageProvider implements IStorageProvider). Strategy marker A (Additive) per ADR-005 extension.

## Out-of-Scope (Wave 4 explicitly does NOT include)

- Hard backend SDK imports в Wave 4 packages.
- UI framework runtime imports в core entity package (только в optional subpath).
- Orchestra business entities or domain enums.
- Migration tooling.
- Multi-master replication.
- Breaking changes to @gertsai/pg-client core interface.

## Functional Requirements

| ID | Category | Requirement | Priority |
|----|----------|-------------|----------|
| FR-W4-001 | Entity | @gertsai/entity provides Entity<Data> base с shallow-reactive _data, $patch(partial), _uid, $defaultData(), EventEmitter integration через base Model class | Must |
| FR-W4-002 | Entity | @gertsai/entity provides EntityWithMetadata-equivalent base с $metadata, isMockup flag, isStaled flag, $markStaled(), $setMetadata(), typename support для discriminated unions | Must |
| FR-W4-003 | Entity | @gertsai/entity reactive layer pluggable — default plain-object impl + optional UI-framework adapter subpath | Should |
| FR-W4-004 | Session | @gertsai/session provides Session class с operatorUuid, operatorType, tokenGetter callback, dialog (AbstractDialog interface), clientPlatform, clientVersion, errorHandler, optional dataAccessUuid scoping | Must |
| FR-W4-005 | Session | Session.$switchOperator({ _uid, type }) для impersonation flows; $destroy() cleanup | Must |
| FR-W4-006 | Session | Session.dataAccessUuid getter — returns operator's UUID OR scoped UUID (агент действует от имени пользователя) | Must |
| FR-W4-007 | Audit | @gertsai/entity-audit provides MutationMarks type (created/updated/deleted × at/by_uuid/by_platform), generic Timestamp interface | Must |
| FR-W4-008 | Audit | @gertsai/entity-audit provides extensible UpdateActionMap[entityName] pattern — per-entity action types | Must |
| FR-W4-009 | Audit | @gertsai/entity-audit provides pure builder functions: buildDataForSet, buildDataForUpdate, buildDataForDelete, buildDataForRestore — typed, session-aware | Must |
| FR-W4-010 | DI | @gertsai/di enhanced с createIdentifier<T>() для type-safe DI keys (cherry-pick) | Should |
| FR-W4-011 | DI | @gertsai/di enhanced с IDestroyable lifecycle interface (cherry-pick) | Should |
| FR-W4-012 | Storage | @gertsai/storage-core provides IStorageProvider<Meta> interface — backend-agnostic CRUD + listeners. Methods: set, getDoc, getDocs, count, update, delete, onDocumentSnapshot, onCollectionSnapshot | Must |
| FR-W4-013 | Storage | @gertsai/storage-core provides IBatchRunner + ITransactionRunner interfaces — atomic ops abstraction | Must |
| FR-W4-014 | Storage | @gertsai/storage-core provides StorageMetadata generic interface — declares write/read field schemas + indexed fields without ORM-specific types | Must |
| FR-W4-015 | Storage | @gertsai/storage-core provides DI registration token storageProviderIdentifier для late-binding | Must |
| FR-W4-016 | Storage | @gertsai/pg-client ships an adapter (PgStorageProvider implements IStorageProvider) — additive | Must |
| FR-W4-017 | Repository | @gertsai/entity-storage provides abstract BaseEntityStorageService<Meta, UpdateActionTypes> — wraps IStorageProvider, default CRUD + soft-delete + restore, session-aware mutations, EventEmitter | Must |
| FR-W4-018 | Repository | @gertsai/entity-storage provides in-memory adapter (InMemoryStorageProvider) — implements IStorageProvider, для testing | Must |
| FR-W4-019 | Query | @gertsai/query-dsl provides ValidQueryConstraints<Meta, QC> type-safe query builder | Should |
| FR-W4-020 | Query | @gertsai/query-dsl constraints: whereField/orderBy/limit/startAt/startAfter/endAt/endBefore — все compile-time-validated против Meta schema | Should |

## Non-Functional Requirements

| ID | Category | Requirement | Metric |
|----|----------|-------------|--------|
| NFR-W4-001 | Backend agnosticism | NO concrete backend SDK / UI framework runtime imports в @gertsai/{entity,session,entity-audit,storage-core,entity-storage,query-dsl} src | grep audit: 0 matches |
| NFR-W4-002 | Reactivity opt-in | @gertsai/entity reactivity layer pluggable; default plain-object impl works without UI framework runtime | smoke test без UI framework installed: passes |
| NFR-W4-003 | Tarball hygiene | Per-package pnpm pack --dry-run: 0 leak (test/src/.env/tsconfig artifacts) | preserves Sprint 3.0 baseline |
| NFR-W4-004 | API stability | Wave 4 packages ship as 0.1.0 (initial release); follow SemVer post-v0.2.0 | changeset entries declare minor bumps |
| NFR-W4-005 | Test coverage | Each package ≥10 tests covering entity lifecycle, session switching, audit builders, storage interface conformance | per-package vitest run |
| NFR-W4-006 | Type safety | All public APIs strict TypeScript; no any без `// reason: ...`; tsconfig.base strict: true enforced | pnpm typecheck 19+7 packages green |
| NFR-W4-007 | License + SPDX | All new files start с `// SPDX-License-Identifier: Apache-2.0` | audit script |
| NFR-W4-008 | publint compliance | All 7 new packages: pnpm run publint "All good!" | CI gate |
| NFR-W4-009 | attw Node10 | Subpath exports — typesVersions added per Sprint 3.0.1 F-4 pattern | pnpm run attw 0 💀 |

## Acceptance Criteria

### AC-W4-1 — Wave 4A complete (Sprint 3.4)

```
Given Sprint 3.4 SPEC-007 implementation is complete
When  CI runs full repo verify (install/build/test/typecheck/lint/publint/depcruise/attw)
Then  all 4 new packages green
And   grep audit returns 0 matches for forbidden imports (concrete backend SDK / UI framework runtime in core)
And   tests cover Entity lifecycle, Session switching, audit builders
And   EVID-008 created with structured fields supporting SPEC-007
```

### AC-W4-2 — Wave 4B complete (Sprint 3.5)

```
Given Sprint 3.5 SPEC-008 implementation is complete
When  CI runs full repo verify
Then  all 3 new packages green
And   @gertsai/pg-client gets PgStorageProvider adapter (additive, no breaking)
And   In-memory storage adapter works as test fixture
And   Sample reference: write one BaseEntityStorageService subclass, swap IStorageProvider impl, all tests pass
And   EVID-009 created
```

### AC-W4-3 — Reference impl in m9s-example (Sprint 3.5+ optional)

```
Given m9s-example uses @gertsai/api-core for ingest workflow
When  m9s-example optionally migrates to use @gertsai/{entity,session,entity-audit,storage-core}
Then  ingest module shows canonical pattern: domain Entity → Repository → workflow
And   no concrete backend SDK code added
And   storage backend pluggable
```

## Dependencies

| Package | Internal deps | External peer-deps |
|---------|---------------|---------------------|
| @gertsai/entity | @gertsai/session (uses Session in base Model) | events.EventEmitter (Node builtin), optional UI framework runtime (peer optional, в subpath) |
| @gertsai/session | none | events.EventEmitter |
| @gertsai/entity-audit | @gertsai/session (mutation builders consume Session) | none |
| @gertsai/di (enhanced) | none | none |
| @gertsai/storage-core | @gertsai/di | none (interface only) |
| @gertsai/entity-storage | @gertsai/storage-core, @gertsai/entity, @gertsai/entity-audit, @gertsai/session, @gertsai/di | none |
| @gertsai/query-dsl | @gertsai/storage-core | none |
| @gertsai/pg-client (refactor) | + @gertsai/storage-core (additive adapter) | existing |

## Risks

| ID | Risk | Probability | Impact | Mitigation |
|----|------|-------------|--------|------------|
| R-1 | UI framework reactivity layer creates accidental coupling | Medium | Medium | Pluggable reactive layer; default plain-object reactive shim; UI framework adapter в subpath (peer optional) |
| R-2 | Storage interface too one-backend-shaped — listeners (onSnapshot) не имеют 1:1 в SQL world | High | Medium | Document tradeoff: SQL adapters могут эмулировать через CDC/polling/LISTEN-NOTIFY OR throw NotImplementedError. Listeners optional in interface. |
| R-3 | DI enhancement breaks existing @gertsai/di consumers | Low | High | Strict additive only; existing API surface preserved; enhancement тестируется через regression suite |
| R-4 | @gertsai/pg-client adapter additive creates double API surface — consumers confused | Medium | Low | README clearly distinguishes: low-level PgClient для direct SQL; PgStorageProvider для entity-storage integration. Examples в обоих paths. |
| R-5 | Orchestra extraction "1:1" lifts implementation details that don't fit OSS | Medium | Low | Keep generic UUID interface; replace lodash.isequal с deepEqual в @gertsai/utils если не там; document each replacement. |
| R-6 | License / contributor consent | Medium | High | Confirmed by user 2026-05-06. Apply Apache 2.0 + SPDX headers. NOTICE if upstream attribution required. |
| R-7 | UpdateActionMap module-augmentation pattern может конфликтовать в monorepo с multiple consumers | Low | Low | Document module-augmentation pattern; provide non-augmented fallback API |

## Implementation Phases

### Sprint 3.4 (Wave 4A — abstractions)

Phase A (3∥ workers + 1 sequential):
- W-4A-1 entity-worker → @gertsai/entity
- W-4A-2 session-worker → @gertsai/session
- W-4A-3 audit-worker → @gertsai/entity-audit
- W-4A-4 di-worker → @gertsai/di enhancement (sequential, runs after others to avoid touching DI mid-build)

Phase B (team-lead): integrated verify + CLAUDE.md tier table + commits.
Phase C (team-lead): EVID-008 + activate SPEC-007.

### Sprint 3.5 (Wave 4B — storage layer)

Phase A (3∥ workers):
- W-4B-1 storage-core-worker → @gertsai/storage-core
- W-4B-2 entity-storage-worker → @gertsai/entity-storage + in-memory adapter
- W-4B-3 query-dsl-worker → @gertsai/query-dsl

Phase B (team-lead): pg-client adapter additive; integrated verify; CLAUDE.md update; commits.
Phase C (team-lead): EVID-009 + activate SPEC-008.

## Success Criteria

| ID | Criterion | Metric | Timeframe |
|----|-----------|--------|-----------|
| SC-W4-1 | 7 new packages published as part of Wave 4 (post-v0.2.0) | npm view @gertsai/{entity,session,entity-audit,storage-core,entity-storage,query-dsl} version | Q3 2026 |
| SC-W4-2 | Reference impl shows pattern: write one repository subclass, swap backend | example tests pass with both @gertsai/pg-client adapter и in-memory adapter | Sprint 3.5 |
| SC-W4-3 | Zero forbidden imports в Wave 4 packages | grep audit: 0 matches | Each sprint |
| SC-W4-4 | m9s-example migrates one entity (опционально) | shows canonical pattern | Wave 4 follow-up |
| SC-W4-5 | Total monorepo: 19 → 26 packages after Wave 4 | ls packages/ count | end of Wave 4 |

## Related Artifacts

| Artifact | Type | Relation |
|----------|------|----------|
| PRD-001 (Wave 2 — Clean Library Platform) | PRD | refines |
| ADR-005 (Storage-core architecture) | ADR | based_on |
| ADR-004 (Foundation libs naming) | ADR | informs |
| ADR-003 (Platform Runtime Boundaries) | ADR | informs |
| ADR-002 (Hex layer enforcement) | ADR | informs |
| EVID-007 (Sprint 3.2 complete) | Evidence | informs |
| Upstream extraction sources (orchlab/core, orchlab/storage, orchlab/di) | external | informs (extraction reference) |

> **Next step**: Activate PRD-002 → Activate ADR-005 → SPEC-007 (Sprint 3.4 Wave 4A Shape) → Sprint 3.4 Build → SPEC-008 → Sprint 3.5 Build.








